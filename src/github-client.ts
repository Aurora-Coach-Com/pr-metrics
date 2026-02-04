/**
 * GitHub API client
 *
 * Fetches PR and review data from GitHub's REST API.
 * Optimized for speed with parallel requests and concurrency limits.
 */

import * as github from '@actions/github';

// Concurrency limit to avoid rate limiting
const CONCURRENCY_LIMIT = 10;

export interface PullRequest {
	number: number;
	title: string;
	createdAt: Date;
	mergedAt: Date;
	author: string;
}

export interface Review {
	prNumber: number;
	submittedAt: Date;
	author: string;
	state: string;
	commentCount: number;
}

/**
 * Run promises with concurrency limit
 */
async function runWithConcurrency<T, R>(
	items: T[],
	fn: (item: T) => Promise<R>,
	limit: number
): Promise<R[]> {
	const results: R[] = [];
	const executing: Promise<void>[] = [];

	for (const item of items) {
		const promise = fn(item).then((result) => {
			results.push(result);
		});

		executing.push(promise);

		if (executing.length >= limit) {
			await Promise.race(executing);
			// Remove completed promises
			for (let i = executing.length - 1; i >= 0; i--) {
				const p = executing[i];
				const isSettled = await Promise.race([
					p.then(() => true),
					Promise.resolve(false),
				]);
				if (isSettled) {
					executing.splice(i, 1);
				}
			}
		}
	}

	await Promise.all(executing);
	return results;
}

export class GitHubClient {
	private octokit: ReturnType<typeof github.getOctokit>;
	private owner: string;
	private repo: string;

	constructor(token: string, owner: string, repo: string) {
		this.octokit = github.getOctokit(token);
		this.owner = owner;
		this.repo = repo;
	}

	/**
	 * Get all PRs merged within the given date range
	 * Uses search API - no individual PR fetches needed
	 */
	async getMergedPRs(startDate: Date, endDate: Date): Promise<PullRequest[]> {
		const query = `repo:${this.owner}/${this.repo} is:pr is:merged merged:${startDate.toISOString().split('T')[0]}..${endDate.toISOString().split('T')[0]}`;

		try {
			// Paginate through all search results
			const items = await this.octokit.paginate(
				this.octokit.rest.search.issuesAndPullRequests,
				{
					q: query,
					sort: 'updated',
					order: 'desc',
					per_page: 100,
				},
				(response) => response.data
			);

			// Map search results directly - no extra API calls needed
			return items
				.filter((item) => item.pull_request?.merged_at)
				.map((item) => ({
					number: item.number,
					title: item.title,
					createdAt: new Date(item.created_at),
					mergedAt: new Date(item.pull_request!.merged_at!),
					author: item.user?.login || 'unknown',
				}));
		} catch (error) {
			// Fallback to listing PRs if search fails
			console.log('   Search API unavailable, falling back to list API...');
			return this.getMergedPRsFallback(startDate, endDate);
		}
	}

	/**
	 * Fallback method using list PRs API
	 */
	private async getMergedPRsFallback(startDate: Date, endDate: Date): Promise<PullRequest[]> {
		const pullRequests: PullRequest[] = [];

		const iterator = this.octokit.paginate.iterator(this.octokit.rest.pulls.list, {
			owner: this.owner,
			repo: this.repo,
			state: 'closed',
			sort: 'updated',
			direction: 'desc',
			per_page: 100,
		});

		for await (const response of iterator) {
			for (const pr of response.data) {
				if (!pr.merged_at) continue;

				const mergedAt = new Date(pr.merged_at);
				if (mergedAt < startDate) return pullRequests;
				if (mergedAt > endDate) continue;

				pullRequests.push({
					number: pr.number,
					title: pr.title,
					createdAt: new Date(pr.created_at),
					mergedAt: mergedAt,
					author: pr.user?.login || 'unknown',
				});
			}
		}

		return pullRequests;
	}

	/**
	 * Get reviews for multiple PRs - parallelized with concurrency limit
	 */
	async getReviewsForPRs(prNumbers: number[]): Promise<Map<number, Review[]>> {
		const reviewsByPR = new Map<number, Review[]>();

		const fetchReviewsForPR = async (prNumber: number): Promise<{ prNumber: number; reviews: Review[] }> => {
			try {
				// Fetch reviews and comments in parallel
				const [reviewsResponse, commentsResponse] = await Promise.all([
					this.octokit.rest.pulls.listReviews({
						owner: this.owner,
						repo: this.repo,
						pull_number: prNumber,
					}),
					this.octokit.rest.pulls.listReviewComments({
						owner: this.owner,
						repo: this.repo,
						pull_number: prNumber,
					}),
				]);

				const inlineCommentCount = commentsResponse.data.length;

				const reviews: Review[] = reviewsResponse.data
					.filter((r) => r.submitted_at)
					.map((r) => ({
						prNumber,
						submittedAt: new Date(r.submitted_at!),
						author: r.user?.login || 'unknown',
						state: r.state,
						commentCount: r.body && r.body.trim().length > 0 ? 1 : 0,
					}));

				// Distribute inline comments across reviews
				const nonAuthorReviews = reviews.filter((r) => r.author !== 'unknown');
				if (nonAuthorReviews.length > 0 && inlineCommentCount > 0) {
					const perReview = inlineCommentCount / nonAuthorReviews.length;
					nonAuthorReviews.forEach((r) => (r.commentCount += perReview));
				}

				return { prNumber, reviews };
			} catch {
				return { prNumber, reviews: [] };
			}
		};

		// Fetch all reviews in parallel with concurrency limit
		const results = await runWithConcurrency(prNumbers, fetchReviewsForPR, CONCURRENCY_LIMIT);

		for (const { prNumber, reviews } of results) {
			reviewsByPR.set(prNumber, reviews);
		}

		return reviewsByPR;
	}

	/**
	 * Get currently open PR count (for WIP calculation)
	 * Uses per_page=1 and reads total_count from the search API
	 * to avoid fetching all open PRs just to count them.
	 */
	async getOpenPRs(): Promise<number> {
		const query = `repo:${this.owner}/${this.repo} is:pr is:open`;
		try {
			const response = await this.octokit.rest.search.issuesAndPullRequests({
				q: query,
				per_page: 1,
			});
			return response.data.total_count;
		} catch {
			// Fallback: paginate through list API
			const items = await this.octokit.paginate(
				this.octokit.rest.pulls.list,
				{
					owner: this.owner,
					repo: this.repo,
					state: 'open',
					per_page: 100,
				},
				(response) => response.data
			);
			return items.length;
		}
	}

	/**
	 * Post a comment to an issue
	 */
	async postIssueComment(issueNumber: number, body: string): Promise<void> {
		await this.octokit.rest.issues.createComment({
			owner: this.owner,
			repo: this.repo,
			issue_number: issueNumber,
			body,
		});
	}
}
