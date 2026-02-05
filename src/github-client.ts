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

export interface WorkflowRunSummary {
	totalRuns: number;
	successCount: number;
	failureCount: number;
}

export interface ShipEvent {
	id: number;
	sha: string;
	createdAt: Date;
	source: 'deployment' | 'release';
	label: string;
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
	 * Get reviews AND PR size for multiple PRs in a single pass.
	 * Piggybacks pulls.get (for additions/deletions) onto the existing
	 * review+comment fetch so we don't need a separate per-PR round trip.
	 */
	async getReviewsAndSizes(prNumbers: number[]): Promise<{
		reviewsByPR: Map<number, Review[]>;
		sizesByPR: Map<number, { additions: number; deletions: number }>;
	}> {
		const reviewsByPR = new Map<number, Review[]>();
		const sizesByPR = new Map<number, { additions: number; deletions: number }>();

		const fetchForPR = async (prNumber: number) => {
			try {
				// Fetch reviews, comments, AND PR details in parallel
				const [reviewsResponse, commentsResponse, prResponse] = await Promise.all([
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
					this.octokit.rest.pulls.get({
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

				return {
					prNumber,
					reviews,
					additions: prResponse.data.additions,
					deletions: prResponse.data.deletions,
				};
			} catch {
				return { prNumber, reviews: [] as Review[], additions: 0, deletions: 0 };
			}
		};

		const results = await runWithConcurrency(prNumbers, fetchForPR, CONCURRENCY_LIMIT);

		for (const { prNumber, reviews, additions, deletions } of results) {
			reviewsByPR.set(prNumber, reviews);
			sizesByPR.set(prNumber, { additions, deletions });
		}

		return { reviewsByPR, sizesByPR };
	}

	/**
	 * Get reviews for multiple PRs - parallelized with concurrency limit
	 */
	async getReviewsForPRs(prNumbers: number[]): Promise<Map<number, Review[]>> {
		const { reviewsByPR } = await this.getReviewsAndSizes(prNumbers);
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

	/**
	 * Get PR size details (additions + deletions) for multiple PRs
	 */
	async getPRDetails(prNumbers: number[]): Promise<Map<number, { additions: number; deletions: number }>> {
		const result = new Map<number, { additions: number; deletions: number }>();

		const fetchPR = async (prNumber: number) => {
			try {
				const response = await this.octokit.rest.pulls.get({
					owner: this.owner,
					repo: this.repo,
					pull_number: prNumber,
				});
				return {
					prNumber,
					additions: response.data.additions,
					deletions: response.data.deletions,
				};
			} catch {
				return { prNumber, additions: 0, deletions: 0 };
			}
		};

		const results = await runWithConcurrency(prNumbers, fetchPR, CONCURRENCY_LIMIT);
		for (const { prNumber, additions, deletions } of results) {
			result.set(prNumber, { additions, deletions });
		}

		return result;
	}

	/**
	 * Get workflow run summary for a date range.
	 * Caps at 5 pages (500 runs) to avoid slow pagination on active repos.
	 */
	async getWorkflowRuns(
		startDate: Date,
		endDate: Date,
		workflowFilter?: string
	): Promise<WorkflowRunSummary | null> {
		try {
			const created = `${startDate.toISOString().split('T')[0]}..${endDate.toISOString().split('T')[0]}`;

			const params = {
				owner: this.owner,
				repo: this.repo,
				status: 'completed' as const,
				created,
				per_page: 100,
			};

			const endpoint = workflowFilter
				? this.octokit.rest.actions.listWorkflowRuns
				: this.octokit.rest.actions.listWorkflowRunsForRepo;

			const requestParams = workflowFilter
				? { ...params, workflow_id: workflowFilter }
				: params;

			const items: any[] = [];
			const MAX_PAGES = 5;
			let page = 0;

			const iterator = this.octokit.paginate.iterator(endpoint as any, requestParams);
			for await (const response of iterator) {
				items.push(...response.data);
				page++;
				if (page >= MAX_PAGES) break;
			}

			// Exclude cancelled and skipped runs
			const relevant = items.filter(
				(r: any) => r.conclusion !== 'cancelled' && r.conclusion !== 'skipped'
			);

			if (relevant.length === 0) return null;

			const successCount = relevant.filter((r: any) => r.conclusion === 'success').length;
			const failureCount = relevant.length - successCount;

			return {
				totalRuns: relevant.length,
				successCount,
				failureCount,
			};
		} catch {
			return null;
		}
	}

	/**
	 * Get deployments within a date range.
	 * Uses iterator with early termination — stops once we pass startDate.
	 */
	async getDeployments(startDate: Date, endDate: Date, environment?: string): Promise<ShipEvent[]> {
		try {
			const params = {
				owner: this.owner,
				repo: this.repo,
				per_page: 100,
				...(environment ? { environment } : {}),
			};

			const results: ShipEvent[] = [];

			const iterator = this.octokit.paginate.iterator(
				this.octokit.rest.repos.listDeployments,
				params,
			);

			outer:
			for await (const response of iterator) {
				for (const d of response.data) {
					const created = new Date(d.created_at);
					// Deployments are newest-first; stop when we're past the window
					if (created < startDate) break outer;
					if (created <= endDate) {
						results.push({
							id: d.id,
							sha: d.sha,
							createdAt: created,
							source: 'deployment',
							label: d.environment || 'unknown',
						});
					}
				}
			}

			return results;
		} catch {
			return [];
		}
	}

	/**
	 * Get releases within a date range (excludes drafts).
	 * Uses iterator with early termination — stops once we pass startDate.
	 */
	async getReleases(startDate: Date, endDate: Date): Promise<ShipEvent[]> {
		try {
			const results: ShipEvent[] = [];

			const iterator = this.octokit.paginate.iterator(
				this.octokit.rest.repos.listReleases,
				{
					owner: this.owner,
					repo: this.repo,
					per_page: 100,
				},
			);

			outer:
			for await (const response of iterator) {
				for (const r of response.data) {
					if (r.draft) continue;
					const published = r.published_at ? new Date(r.published_at) : null;
					if (!published) continue;
					// Releases are newest-first; stop when we're past the window
					if (published < startDate) break outer;
					if (published <= endDate) {
						results.push({
							id: r.id,
							sha: r.target_commitish || '',
							createdAt: published,
							source: 'release',
							label: r.tag_name || 'unknown',
						});
					}
				}
			}

			return results;
		} catch {
			return [];
		}
	}

	/**
	 * Get the date of the first commit for each PR
	 */
	async getFirstCommitDates(prNumbers: number[]): Promise<Map<number, Date>> {
		const result = new Map<number, Date>();

		const fetchFirstCommit = async (prNumber: number) => {
			try {
				const response = await this.octokit.rest.pulls.listCommits({
					owner: this.owner,
					repo: this.repo,
					pull_number: prNumber,
					per_page: 1,
				});
				const firstCommit = response.data[0];
				if (firstCommit) {
					const date = firstCommit.commit.author?.date || firstCommit.commit.committer?.date;
					if (date) {
						return { prNumber, date: new Date(date) };
					}
				}
				return { prNumber, date: null };
			} catch {
				return { prNumber, date: null };
			}
		};

		const results = await runWithConcurrency(prNumbers, fetchFirstCommit, CONCURRENCY_LIMIT);
		for (const { prNumber, date } of results) {
			if (date) {
				result.set(prNumber, date);
			}
		}

		return result;
	}
}
