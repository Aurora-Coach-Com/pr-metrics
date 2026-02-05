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
     * Get reviews AND PR size for multiple PRs in a single pass.
     * Piggybacks pulls.get (for additions/deletions) onto the existing
     * review+comment fetch so we don't need a separate per-PR round trip.
     */
    getReviewsAndSizes(prNumbers: number[]): Promise<{
        reviewsByPR: Map<number, Review[]>;
        sizesByPR: Map<number, {
            additions: number;
            deletions: number;
        }>;
    }>;
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
    /**
     * Get PR size details (additions + deletions) for multiple PRs
     */
    getPRDetails(prNumbers: number[]): Promise<Map<number, {
        additions: number;
        deletions: number;
    }>>;
    /**
     * Get workflow run summary for a date range.
     * Caps at 5 pages (500 runs) to avoid slow pagination on active repos.
     */
    getWorkflowRuns(startDate: Date, endDate: Date, workflowFilter?: string): Promise<WorkflowRunSummary | null>;
    /**
     * Get deployments within a date range.
     * Uses iterator with early termination — stops once we pass startDate.
     */
    getDeployments(startDate: Date, endDate: Date, environment?: string): Promise<ShipEvent[]>;
    /**
     * Get releases within a date range (excludes drafts).
     * Uses iterator with early termination — stops once we pass startDate.
     */
    getReleases(startDate: Date, endDate: Date): Promise<ShipEvent[]>;
    /**
     * Get the date of the first commit for each PR
     */
    getFirstCommitDates(prNumbers: number[]): Promise<Map<number, Date>>;
}
