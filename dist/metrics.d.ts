/**
 * Metrics calculation
 *
 * Computes sprint health metrics from PR and review data.
 */
import { PullRequest, Review, WorkflowRunSummary, ShipEvent } from './github-client';
export interface SprintMetrics {
    cycleTimeMedianHours: number;
    cycleTimeP90Hours: number;
    throughputCount: number;
    wipCount: number;
    prSizeMedian: number | null;
    prSizeCategory: 'small' | 'medium' | 'large' | null;
    buildSuccessRate: number | null;
    buildTotalRuns: number | null;
    shipFrequency: number | null;
    shipCount: number | null;
    shipSource: 'deployment' | 'release' | null;
    leadTimeMedianHours: number | null;
    reviewTurnaroundMedianHours: number;
    collaboratorCount: number;
    concentrationRatio: number;
    reviewDepthScore: number;
    cycleTimeTrend: 'improving' | 'stable' | 'degrading';
    prNumbers: number[];
}
export interface MetricsOptions {
    prSizes?: Map<number, {
        additions: number;
        deletions: number;
    }>;
    workflowRuns?: WorkflowRunSummary | null;
    shipEvents?: ShipEvent[];
    firstCommitDates?: Map<number, Date>;
    periodDays?: number;
}
export declare function calculateMetrics(pullRequests: PullRequest[], reviewsByPR: Map<number, Review[]>, openPRCount: number, options?: MetricsOptions): SprintMetrics;
/**
 * Format hours as human-readable duration
 */
export declare function formatDuration(hours: number): string;
