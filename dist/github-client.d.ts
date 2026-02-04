/**
 * GitHub API client
 *
 * Fetches PR and review data from GitHub's REST API.
 * Optimized for speed with parallel requests and concurrency limits.
 */
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
export declare class GitHubClient {
    private octokit;
    private owner;
    private repo;
    constructor(token: string, owner: string, repo: string);
    /**
     * Get all PRs merged within the given date range
     * Uses search API - no individual PR fetches needed
     */
    getMergedPRs(startDate: Date, endDate: Date): Promise<PullRequest[]>;
    /**
     * Fallback method using list PRs API
     */
    private getMergedPRsFallback;
    /**
     * Get reviews for multiple PRs - parallelized with concurrency limit
     */
    getReviewsForPRs(prNumbers: number[]): Promise<Map<number, Review[]>>;
    /**
     * Get currently open PR count (for WIP calculation)
     * Uses per_page=1 and reads total_count from the search API
     * to avoid fetching all open PRs just to count them.
     */
    getOpenPRs(): Promise<number>;
    /**
     * Post a comment to an issue
     */
    postIssueComment(issueNumber: number, body: string): Promise<void>;
}
