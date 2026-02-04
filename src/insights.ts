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

export function detectInsights(metrics: SprintMetrics, thresholds: Thresholds): Insight[] {
	const insights: Insight[] = [];

	// Knowledge silo detection
	if (metrics.concentrationRatio >= thresholds.concentrationCritical) {
		insights.push({
			type: 'knowledge-silo',
			severity: 'critical',
			message: `Review patterns show ${Math.round(metrics.concentrationRatio * 100)}% concentration — significant knowledge silo risk`,
		});
	} else if (metrics.concentrationRatio >= thresholds.concentrationWarning) {
		insights.push({
			type: 'knowledge-silo',
			severity: 'warning',
			message: 'Your review patterns suggest a knowledge silo forming',
		});
	}

	// Cycle time detection
	if (metrics.cycleTimeMedianHours >= thresholds.cycleTimeCriticalHours) {
		insights.push({
			type: 'cycle-time-regression',
			severity: 'critical',
			message: `Cycle time at ${Math.round(metrics.cycleTimeMedianHours / 24)} days — significant delivery bottleneck`,
		});
	} else if (metrics.cycleTimeMedianHours >= thresholds.cycleTimeWarningHours) {
		insights.push({
			type: 'cycle-time-regression',
			severity: 'warning',
			message: `Cycle time at ${Math.round(metrics.cycleTimeMedianHours)} hours — above warning threshold`,
		});
	}

	// WIP overload detection
	const wipRatio = metrics.collaboratorCount > 0
		? metrics.wipCount / metrics.collaboratorCount
		: 0;

	if (wipRatio >= thresholds.wipCriticalRatio) {
		insights.push({
			type: 'wip-overload',
			severity: 'critical',
			message: `WIP (${metrics.wipCount}) at ${wipRatio.toFixed(1)}x team size — severe flow bottleneck`,
		});
	} else if (wipRatio >= thresholds.wipWarningRatio) {
		insights.push({
			type: 'wip-overload',
			severity: 'warning',
			message: 'High WIP pressure detected — flow bottleneck likely',
		});
	}

	// Review bottleneck detection
	if (metrics.reviewTurnaroundMedianHours >= thresholds.reviewCriticalHours) {
		insights.push({
			type: 'review-bottleneck',
			severity: 'critical',
			message: `Reviews taking ${Math.round(metrics.reviewTurnaroundMedianHours)} hours on average — blocking delivery`,
		});
	} else if (metrics.reviewTurnaroundMedianHours >= thresholds.reviewWarningHours) {
		insights.push({
			type: 'review-bottleneck',
			severity: 'warning',
			message: 'Review turnaround could be faster',
		});
	}

	// Shallow reviews detection (only if there were reviews)
	if (metrics.throughputCount > 0 && metrics.reviewDepthScore <= thresholds.reviewDepthCritical) {
		insights.push({
			type: 'shallow-reviews',
			severity: 'warning',
			message: 'Reviews appear to be rubber-stamps — limited knowledge transfer',
		});
	} else if (metrics.throughputCount > 0 && metrics.reviewDepthScore <= thresholds.reviewDepthWarning) {
		insights.push({
			type: 'shallow-reviews',
			severity: 'info',
			message: 'Review comments are light — consider deeper code discussions',
		});
	}

	// Sort by severity (critical first)
	const severityOrder = { critical: 0, warning: 1, info: 2 };
	insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

	// Return only the most important insight (to avoid cluttering the card)
	return insights.slice(0, 1);
}

/**
 * Get emoji for health status
 */
export function getHealthEmoji(metrics: SprintMetrics, thresholds: Thresholds): string {
	// Overall health based on cycle time and WIP
	const wipRatio = metrics.collaboratorCount > 0
		? metrics.wipCount / metrics.collaboratorCount
		: 0;

	if (
		metrics.cycleTimeMedianHours >= thresholds.cycleTimeCriticalHours ||
		wipRatio >= thresholds.wipCriticalRatio
	) {
		return '🔴';
	}

	if (
		metrics.cycleTimeMedianHours >= thresholds.cycleTimeWarningHours ||
		wipRatio >= thresholds.wipWarningRatio ||
		metrics.concentrationRatio >= thresholds.concentrationWarning
	) {
		return '🟡';
	}

	return '🟢';
}
