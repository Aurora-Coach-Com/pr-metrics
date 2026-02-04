/**
 * Insight detection
 *
 * Detects coaching-relevant patterns from metrics and generates
 * insight teasers for the health card.
 */
import { SprintMetrics } from './metrics';
import { Thresholds } from './config';
export interface Insight {
    type: 'knowledge-silo' | 'cycle-time-regression' | 'wip-overload' | 'review-bottleneck' | 'shallow-reviews';
    severity: 'info' | 'warning' | 'critical';
    message: string;
}
export declare function detectInsights(metrics: SprintMetrics, thresholds: Thresholds): Insight[];
/**
 * Get emoji for health status
 */
export declare function getHealthEmoji(metrics: SprintMetrics, thresholds: Thresholds): string;
