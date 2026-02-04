/**
 * Health card renderer
 *
 * Generates the markdown health card from metrics and insights.
 */

import { Config, Thresholds } from './config';
import { SprintMetrics, formatDuration } from './metrics';
import { getHealthEmoji } from './insights';

// Aurora Coach cat logo in ASCII (23 chars wide)
export const AURORA_LOGO = `\
░░░░░░░██▓░▓██░░░░░░░░░
░░░░░░▓██░▓░▓██░░░░░░░░
░░░░░░██░░░░░██▓░░░░░░░
░░░░░░░███░░░░██▓░░░░░░
░░░░░░░██▓░░░░░███░░░░░
░░░░░▓██░░░░░░░░███░░░░
░░░░▓██░░░░░░░░░░███░░░
░░░██▓░░░▓██▓▓░░░▓███░░
░░██▓░░░██▓▓██░░░▓████░
▓██░░░░░██░░░░░░░██▓░██
██░░░░░░██▓░░░▓▓██▓░░██
░▓███████████████████▓░`;

export function renderHealthCard(
	config: Config,
	metrics: SprintMetrics,
	thresholds: Thresholds
): string {
	const healthEmoji = getHealthEmoji(metrics, thresholds);
	const dateRange = formatDateRange(config.periodStart, config.periodEnd);

	// Format metrics
	const cycleTime = formatCycleTime(metrics.cycleTimeMedianHours, metrics.cycleTimeP90Hours);
	const reviewSpeed = formatDuration(metrics.reviewTurnaroundMedianHours);
	const reviewDepth = formatReviewDepth(metrics.reviewDepthScore);
	const throughput = `${metrics.throughputCount} PRs`;
	const wip = formatWIP(metrics.wipCount, metrics.collaboratorCount);
	const collaboration = formatCollaboration(metrics.collaboratorCount, metrics.concentrationRatio);

	// Build the card
	let card = `\
\`\`\`
${AURORA_LOGO}
\`\`\`

## ${healthEmoji} Sprint Health — ${dateRange}

| Metric | Value |
|--------|-------|
| PR Cycle Time | ${cycleTime} |
| Review Speed | ${reviewSpeed} |
| Review Depth | ${reviewDepth} |
| Throughput | ${throughput} |
| WIP | ${wip} |
| Collaboration | ${collaboration} |
`;

	// Add quick wins for flagged metrics
	const quickWins = generateQuickWins(metrics, thresholds);
	if (quickWins.length > 0) {
		card += `
### 💡 Quick Wins

${quickWins.map((tip) => `- ${tip}`).join('\n')}

> *These are general patterns. For coaching based on your team's context → [aurora-coach.com](https://aurora-coach.com?utm_source=github-action&utm_medium=health-card&utm_campaign=sprint-health)*
`;
	}

	// Footer
	card += `
---
*Powered by [Aurora Coach](https://aurora-coach.com) — The AI Coach for Software Engineering Teams*`;

	return card;
}

function formatDateRange(start: Date, end: Date): string {
	const formatDate = (d: Date) =>
		d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	return `${formatDate(start)} – ${formatDate(end)}`;
}

function formatWIP(wipCount: number, collaboratorCount: number): string {
	if (collaboratorCount === 0) {
		return `${wipCount} open`;
	}
	const ratio = wipCount / collaboratorCount;
	if (ratio <= 1.5) {
		return `${wipCount} open (healthy)`;
	} else if (ratio <= 2.5) {
		return `${wipCount} open (elevated)`;
	}
	return `${wipCount} open (overloaded)`;
}

function formatCollaboration(count: number, concentration: number): string {
	if (count <= 1) {
		return 'Solo contributor';
	}

	if (concentration >= 0.75) {
		return `${count} contributors (siloed)`;
	} else if (concentration >= 0.6) {
		return `${count} contributors (concentrated)`;
	}
	return `${count} contributors (balanced)`;
}

function formatCycleTime(medianHours: number, p90Hours: number): string {
	const median = formatDuration(medianHours);
	const p90 = formatDuration(p90Hours);
	return `${median} (P90: ${p90})`;
}

function formatReviewDepth(score: number): string {
	if (score === 0) {
		return '—';
	}
	if (score < 0.5) {
		return `${score.toFixed(1)} comments/PR (light)`;
	}
	if (score < 2) {
		return `${score.toFixed(1)} comments/PR (moderate)`;
	}
	if (score < 3) {
		return `${score.toFixed(1)} comments/PR (thorough)`;
	}
	return `${score.toFixed(1)} comments/PR (very thorough)`;
}

/**
 * Generate contextual quick wins based on flagged metrics
 */
function generateQuickWins(metrics: SprintMetrics, thresholds: Thresholds): string[] {
	const tips: string[] = [];

	// Cycle Time
	if (metrics.cycleTimeMedianHours >= thresholds.cycleTimeCriticalHours) {
		tips.push('**Cycle time** — Long cycle times usually mean PRs waiting — for review, CI, or decisions. Finding where work stalls is the first step.');
	} else if (metrics.cycleTimeMedianHours >= thresholds.cycleTimeWarningHours) {
		tips.push('**Cycle time** — Smaller PRs often move faster — one reviewable chunk beats a sprawling change. Though in approval-heavy environments, bundling related changes sometimes reduces total overhead.');
	}

	// P90 outliers (if P90 is more than 3x median)
	if (metrics.cycleTimeMedianHours > 0 && metrics.cycleTimeP90Hours >= metrics.cycleTimeMedianHours * 3) {
		tips.push('**P90 outliers** — When P90 is much higher than median, a few PRs are getting stuck. These outliers often reveal external blockers worth investigating.');
	}

	// Review Turnaround
	if (metrics.reviewTurnaroundMedianHours >= thresholds.reviewCriticalHours) {
		tips.push('**Review speed** — Two-day review waits often signal capacity issues or unclear ownership. Explicit review assignments can help.');
	} else if (metrics.reviewTurnaroundMedianHours >= thresholds.reviewWarningHours) {
		tips.push('**Review speed** — Review delays compound — waiting PRs become stale, need rebasing, slow the next one. Small daily review windows help.');
	}

	// WIP
	const wipRatio = metrics.collaboratorCount > 0
		? metrics.wipCount / metrics.collaboratorCount
		: 0;

	if (wipRatio >= thresholds.wipCriticalRatio) {
		tips.push('**WIP** — WIP this high usually means too much in flight. Try a "stop starting, start finishing" week to clear the queue.');
	} else if (wipRatio >= thresholds.wipWarningRatio) {
		tips.push('**WIP** — High WIP often means context-switching. Finishing one thing before starting the next improves flow.');
	}

	// Concentration (Knowledge Silo)
	if (metrics.concentrationRatio >= thresholds.concentrationCritical) {
		tips.push('**Concentration** — High concentration creates bus-factor risk. Cross-training is worth the short-term slowdown.');
	} else if (metrics.concentrationRatio >= thresholds.concentrationWarning) {
		tips.push('**Concentration** — When one person handles most PRs or reviews, knowledge concentrates. Rotating reviewers spreads context.');
	}

	// Review Depth
	if (metrics.reviewDepthScore > 0 && metrics.reviewDepthScore <= thresholds.reviewDepthCritical) {
		tips.push('**Review depth** — Very few comments often means approvals, not conversations. This can signal time pressure or unclear expectations.');
	} else if (metrics.reviewDepthScore > 0 && metrics.reviewDepthScore <= thresholds.reviewDepthWarning) {
		tips.push('**Review depth** — Light reviews move fast but may miss knowledge-sharing opportunities. Even one question per PR builds shared understanding.');
	} else if (metrics.reviewDepthScore >= 3.0) {
		tips.push('**Review depth** — Detailed reviews build quality, but watch for diminishing returns. If reviews take longer than development, consider calibrating standards to risk level.');
	}

	// Solo contributor
	if (metrics.collaboratorCount <= 1 && metrics.throughputCount > 0) {
		tips.push('**Collaboration** — Solo work is fine for focused sprints. When possible, even async review from a teammate adds perspective.');
	}

	return tips;
}
