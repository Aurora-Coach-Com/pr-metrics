/**
 * Metrics calculation
 *
 * Computes sprint health metrics from PR and review data.
 */

import { PullRequest, Review, WorkflowRunSummary, ShipEvent } from './github-client';

export interface SprintMetrics {
	// Delivery
	cycleTimeMedianHours: number;
	cycleTimeP90Hours: number;
	throughputCount: number;
	wipCount: number;

	// PR Size
	prSizeMedian: number | null;
	prSizeCategory: 'small' | 'medium' | 'large' | null;

	// Build
	buildSuccessRate: number | null;
	buildTotalRuns: number | null;

	// Ship
	shipFrequency: number | null;
	shipCount: number | null;
	shipSource: 'deployment' | 'release' | null;

	// Lead Time
	leadTimeMedianHours: number | null;

	// Collaboration
	reviewTurnaroundMedianHours: number;
	collaboratorCount: number;
	concentrationRatio: number; // Highest contributor's share (0-1)
	reviewDepthScore: number; // Average comments per PR (0 = rubber stamps)

	// Derived
	cycleTimeTrend: 'improving' | 'stable' | 'degrading';
	prNumbers: number[];
}

export interface MetricsOptions {
	prSizes?: Map<number, { additions: number; deletions: number }>;
	workflowRuns?: WorkflowRunSummary | null;
	shipEvents?: ShipEvent[];
	firstCommitDates?: Map<number, Date>;
	periodDays?: number;
}

export function calculateMetrics(
	pullRequests: PullRequest[],
	reviewsByPR: Map<number, Review[]>,
	openPRCount: number,
	options?: MetricsOptions
): SprintMetrics {
	// Cycle times (PR created → merged)
	const cycleTimes = pullRequests.map((pr) => {
		const hours = (pr.mergedAt.getTime() - pr.createdAt.getTime()) / (1000 * 60 * 60);
		return hours;
	});

	// Review turnaround (PR created → first review)
	const reviewTurnarounds: number[] = [];
	for (const pr of pullRequests) {
		const reviews = reviewsByPR.get(pr.number) || [];
		// Find first review that's not from the author
		const firstReview = reviews
			.filter((r) => r.author !== pr.author)
			.sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime())[0];

		if (firstReview) {
			const hours = (firstReview.submittedAt.getTime() - pr.createdAt.getTime()) / (1000 * 60 * 60);
			reviewTurnarounds.push(hours);
		}
	}

	// Contributors and concentration
	const contributorPRCounts = new Map<string, number>();
	for (const pr of pullRequests) {
		const current = contributorPRCounts.get(pr.author) || 0;
		contributorPRCounts.set(pr.author, current + 1);
	}

	const totalPRs = pullRequests.length;
	const maxContribution = Math.max(...contributorPRCounts.values());
	const concentrationRatio = totalPRs > 0 ? maxContribution / totalPRs : 0;

	// Review depth (average comments per PR, excluding self-reviews)
	let totalComments = 0;
	let prsWithReviews = 0;
	for (const pr of pullRequests) {
		const reviews = reviewsByPR.get(pr.number) || [];
		const nonAuthorReviews = reviews.filter((r) => r.author !== pr.author);
		if (nonAuthorReviews.length > 0) {
			totalComments += nonAuthorReviews.reduce((sum, r) => sum + r.commentCount, 0);
			prsWithReviews++;
		}
	}
	const reviewDepthScore = prsWithReviews > 0 ? totalComments / prsWithReviews : 0;

	// --- New metrics (from options) ---
	let prSizeMedian: number | null = null;
	let prSizeCategory: 'small' | 'medium' | 'large' | null = null;
	let buildSuccessRate: number | null = null;
	let buildTotalRuns: number | null = null;
	let shipFrequency: number | null = null;
	let shipCount: number | null = null;
	let shipSource: 'deployment' | 'release' | null = null;
	let leadTimeMedianHours: number | null = null;

	if (options) {
		// PR Size
		if (options.prSizes && options.prSizes.size > 0) {
			const sizes = [...options.prSizes.values()].map((s) => s.additions + s.deletions);
			prSizeMedian = median(sizes);
			if (prSizeMedian !== null) {
				if (prSizeMedian < 100) prSizeCategory = 'small';
				else if (prSizeMedian < 400) prSizeCategory = 'medium';
				else prSizeCategory = 'large';
			}
		}

		// Build Success
		if (options.workflowRuns && options.workflowRuns.totalRuns > 0) {
			buildTotalRuns = options.workflowRuns.totalRuns;
			buildSuccessRate = Math.round(
				(options.workflowRuns.successCount / options.workflowRuns.totalRuns) * 100
			);
		}

		// Ship Frequency
		if (options.shipEvents && options.shipEvents.length > 0) {
			shipCount = options.shipEvents.length;
			shipSource = options.shipEvents[0].source;
			const days = options.periodDays || 14;
			shipFrequency = shipCount / days;
		}

		// Lead Time: first commit → ship event
		if (
			options.shipEvents && options.shipEvents.length > 0 &&
			options.firstCommitDates && options.firstCommitDates.size > 0
		) {
			const sortedShipEvents = [...options.shipEvents].sort(
				(a, b) => a.createdAt.getTime() - b.createdAt.getTime()
			);
			const leadTimes: number[] = [];

			for (const pr of pullRequests) {
				const firstCommitDate = options.firstCommitDates.get(pr.number);
				if (!firstCommitDate) continue;

				// Find the earliest ship event after merge
				const shipEvent = sortedShipEvents.find(
					(e) => e.createdAt.getTime() >= pr.mergedAt.getTime()
				);
				if (!shipEvent) continue;

				const hours = (shipEvent.createdAt.getTime() - firstCommitDate.getTime()) / (1000 * 60 * 60);
				if (hours >= 0) {
					leadTimes.push(hours);
				}
			}

			if (leadTimes.length > 0) {
				leadTimeMedianHours = median(leadTimes);
			}
		}
	}

	return {
		cycleTimeMedianHours: median(cycleTimes) || 0,
		cycleTimeP90Hours: percentile(cycleTimes, 90) || 0,
		throughputCount: pullRequests.length,
		wipCount: openPRCount,

		prSizeMedian,
		prSizeCategory,
		buildSuccessRate,
		buildTotalRuns,
		shipFrequency,
		shipCount,
		shipSource,
		leadTimeMedianHours,

		reviewTurnaroundMedianHours: median(reviewTurnarounds) || 0,
		collaboratorCount: contributorPRCounts.size,
		concentrationRatio,
		reviewDepthScore,

		// TODO: Compare to previous period for trend
		cycleTimeTrend: 'stable',

		prNumbers: pullRequests.map((pr) => pr.number),
	};
}

/**
 * Calculate median of an array
 */
function median(values: number[]): number | null {
	if (values.length === 0) return null;

	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);

	if (sorted.length % 2 === 0) {
		return (sorted[mid - 1] + sorted[mid]) / 2;
	}
	return sorted[mid];
}

/**
 * Calculate percentile of an array
 */
function percentile(values: number[], p: number): number | null {
	if (values.length === 0) return null;

	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.max(0, index)];
}

/**
 * Format hours as human-readable duration
 */
export function formatDuration(hours: number): string {
	if (hours < 1) {
		return `${Math.round(hours * 60)} min`;
	}
	if (hours < 24) {
		return `${hours.toFixed(1)} hours`;
	}
	const days = hours / 24;
	return `${days.toFixed(1)} days`;
}
