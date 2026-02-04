/**
 * Metrics calculation
 *
 * Computes sprint health metrics from PR and review data.
 */
import { PullRequest, Review } from './github-client';
export interface SprintMetrics {
    cycleTimeMedianHours: number;
    cycleTimeP90Hours: number;
    throughputCount: number;
    wipCount: number;
    reviewTurnaroundMedianHours: number;
    collaboratorCount: number;
    concentrationRatio: number;
    reviewDepthScore: number;
    cycleTimeTrend: 'improving' | 'stable' | 'degrading';
    prNumbers: number[];
}
export declare function calculateMetrics(pullRequests: PullRequest[], reviewsByPR: Map<number, Review[]>, openPRCount: number): SprintMetrics;
/**
 * Format hours as human-readable duration
 */
export declare function formatDuration(hours: number): string;
