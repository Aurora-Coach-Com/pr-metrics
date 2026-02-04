import { describe, it } from 'node:test';
import assert from 'node:assert';
import { renderHealthCard, AURORA_LOGO } from '../card';
import { Config, Thresholds } from '../config';
import { SprintMetrics } from '../metrics';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultThresholds: Thresholds = {
	cycleTimeWarningHours: 72,
	cycleTimeCriticalHours: 168,
	reviewWarningHours: 24,
	reviewCriticalHours: 48,
	wipWarningRatio: 2,
	wipCriticalRatio: 3,
	concentrationWarning: 0.6,
	concentrationCritical: 0.75,
	reviewDepthWarning: 0.5,
	reviewDepthCritical: 0.2,
};

function makeConfig(overrides: Partial<Config> = {}): Config {
	return {
		token: 'test-token',
		owner: 'test-owner',
		repo: 'test-repo',
		sprintLengthDays: 14,
		periodStart: new Date('2025-01-01'),
		periodEnd: new Date('2025-01-14'),
		postAs: 'summary',
		thresholds: defaultThresholds,
		...overrides,
	};
}

function makeMetrics(overrides: Partial<SprintMetrics> = {}): SprintMetrics {
	return {
		cycleTimeMedianHours: 20,
		cycleTimeP90Hours: 30,
		throughputCount: 5,
		wipCount: 2,
		reviewTurnaroundMedianHours: 8,
		collaboratorCount: 4,
		concentrationRatio: 0.3,
		reviewDepthScore: 1.5,
		cycleTimeTrend: 'stable',
		prNumbers: [1, 2, 3, 4, 5],
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Card structure
// ---------------------------------------------------------------------------

describe('renderHealthCard — structure', () => {
	it('includes Aurora logo', () => {
		const card = renderHealthCard(makeConfig(), makeMetrics(), defaultThresholds);
		assert.ok(card.includes(AURORA_LOGO));
	});

	it('includes Sprint Health header with date range', () => {
		const card = renderHealthCard(makeConfig(), makeMetrics(), defaultThresholds);
		assert.ok(card.includes('Sprint Health'));
		assert.ok(card.includes('Jan 1'));
		assert.ok(card.includes('Jan 14'));
	});

	it('includes metric table headers', () => {
		const card = renderHealthCard(makeConfig(), makeMetrics(), defaultThresholds);
		assert.ok(card.includes('| Metric | Value |'));
		assert.ok(card.includes('PR Cycle Time'));
		assert.ok(card.includes('Review Speed'));
		assert.ok(card.includes('Review Depth'));
		assert.ok(card.includes('Throughput'));
		assert.ok(card.includes('WIP'));
		assert.ok(card.includes('Collaboration'));
	});

	it('includes footer with Aurora Coach link', () => {
		const card = renderHealthCard(makeConfig(), makeMetrics(), defaultThresholds);
		assert.ok(card.includes('Powered by'));
		assert.ok(card.includes('aurora-coach.com'));
	});
});

// ---------------------------------------------------------------------------
// Health emoji in header
// ---------------------------------------------------------------------------

describe('renderHealthCard — health emoji', () => {
	it('shows green emoji for healthy metrics', () => {
		const card = renderHealthCard(makeConfig(), makeMetrics(), defaultThresholds);
		assert.ok(card.includes('🟢'));
	});

	it('shows yellow emoji for warning-level metrics', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ cycleTimeMedianHours: 80 }),
			defaultThresholds,
		);
		assert.ok(card.includes('🟡'));
	});

	it('shows red emoji for critical-level metrics', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ cycleTimeMedianHours: 200 }),
			defaultThresholds,
		);
		assert.ok(card.includes('🔴'));
	});
});

// ---------------------------------------------------------------------------
// WIP formatting
// ---------------------------------------------------------------------------

describe('renderHealthCard — WIP display', () => {
	it('shows "healthy" when wip/collaborator <= 1.5', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ wipCount: 4, collaboratorCount: 4 }),
			defaultThresholds,
		);
		assert.ok(card.includes('4 open (healthy)'));
	});

	it('shows "elevated" when wip/collaborator is between 1.5 and 2.5', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ wipCount: 8, collaboratorCount: 4 }),
			defaultThresholds,
		);
		assert.ok(card.includes('8 open (elevated)'));
	});

	it('shows "overloaded" when wip/collaborator > 2.5', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ wipCount: 12, collaboratorCount: 4 }),
			defaultThresholds,
		);
		assert.ok(card.includes('12 open (overloaded)'));
	});

	it('shows just count when collaborator count is 0', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ wipCount: 3, collaboratorCount: 0 }),
			defaultThresholds,
		);
		assert.ok(card.includes('3 open'));
		assert.ok(!card.includes('3 open (healthy)'));
		assert.ok(!card.includes('3 open (elevated)'));
		assert.ok(!card.includes('3 open (overloaded)'));
	});
});

// ---------------------------------------------------------------------------
// Collaboration formatting
// ---------------------------------------------------------------------------

describe('renderHealthCard — collaboration display', () => {
	it('shows "Solo contributor" for 1 contributor', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ collaboratorCount: 1, concentrationRatio: 1.0 }),
			defaultThresholds,
		);
		assert.ok(card.includes('Solo contributor'));
	});

	it('shows "balanced" when concentration < 0.6', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ collaboratorCount: 4, concentrationRatio: 0.3 }),
			defaultThresholds,
		);
		assert.ok(card.includes('4 contributors (balanced)'));
	});

	it('shows "concentrated" when concentration >= 0.6 and < 0.75', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ collaboratorCount: 3, concentrationRatio: 0.65 }),
			defaultThresholds,
		);
		assert.ok(card.includes('3 contributors (concentrated)'));
	});

	it('shows "siloed" when concentration >= 0.75', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ collaboratorCount: 4, concentrationRatio: 0.8 }),
			defaultThresholds,
		);
		assert.ok(card.includes('4 contributors (siloed)'));
	});
});

// ---------------------------------------------------------------------------
// Review depth formatting
// ---------------------------------------------------------------------------

describe('renderHealthCard — review depth display', () => {
	it('shows dash when review depth is 0', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ reviewDepthScore: 0 }),
			defaultThresholds,
		);
		assert.match(card, /Review Depth \| —/);
	});

	it('shows "light" when depth < 0.5', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ reviewDepthScore: 0.3 }),
			defaultThresholds,
		);
		assert.ok(card.includes('comments/PR (light)'));
	});

	it('shows "moderate" when depth >= 0.5 and < 2', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ reviewDepthScore: 1.2 }),
			defaultThresholds,
		);
		assert.ok(card.includes('comments/PR (moderate)'));
	});

	it('shows "thorough" when depth >= 2 and < 3', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ reviewDepthScore: 2.5 }),
			defaultThresholds,
		);
		assert.ok(card.includes('comments/PR (thorough)'));
	});

	it('shows "very thorough" when depth >= 3', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ reviewDepthScore: 4.0 }),
			defaultThresholds,
		);
		assert.ok(card.includes('comments/PR (very thorough)'));
	});
});

// ---------------------------------------------------------------------------
// Cycle time formatting in card
// ---------------------------------------------------------------------------

describe('renderHealthCard — cycle time display', () => {
	it('shows median and P90', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ cycleTimeMedianHours: 20, cycleTimeP90Hours: 30 }),
			defaultThresholds,
		);
		assert.ok(card.includes('20.0 hours'));
		assert.ok(card.includes('P90:'));
	});

	it('shows sub-hour cycle time in minutes', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ cycleTimeMedianHours: 0.5, cycleTimeP90Hours: 0.75 }),
			defaultThresholds,
		);
		assert.ok(card.includes('30 min'));
	});

	it('shows multi-day cycle time in days', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ cycleTimeMedianHours: 72, cycleTimeP90Hours: 168 }),
			defaultThresholds,
		);
		assert.ok(card.includes('3.0 days'));
		assert.ok(card.includes('7.0 days'));
	});
});

// ---------------------------------------------------------------------------
// Quick Wins generation
// ---------------------------------------------------------------------------

describe('renderHealthCard — quick wins', () => {
	it('shows no quick wins section when all metrics are healthy', () => {
		const card = renderHealthCard(makeConfig(), makeMetrics(), defaultThresholds);
		assert.ok(!card.includes('Quick Wins'));
	});

	it('shows cycle time warning tip', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ cycleTimeMedianHours: 80 }),
			defaultThresholds,
		);
		assert.ok(card.includes('Quick Wins'));
		assert.ok(card.includes('**Cycle time**'));
		assert.ok(card.includes('Smaller PRs'));
	});

	it('shows cycle time critical tip', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ cycleTimeMedianHours: 200 }),
			defaultThresholds,
		);
		assert.ok(card.includes('**Cycle time**'));
		assert.ok(card.includes('Long cycle times'));
	});

	it('shows P90 outlier tip when P90 >= 3x median', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ cycleTimeMedianHours: 10, cycleTimeP90Hours: 40 }),
			defaultThresholds,
		);
		assert.ok(card.includes('**P90 outliers**'));
	});

	it('does not show P90 outlier tip when P90 < 3x median', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ cycleTimeMedianHours: 10, cycleTimeP90Hours: 20 }),
			defaultThresholds,
		);
		assert.ok(!card.includes('P90 outliers'));
	});

	it('shows review speed warning tip', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ reviewTurnaroundMedianHours: 30 }),
			defaultThresholds,
		);
		assert.ok(card.includes('**Review speed**'));
		assert.ok(card.includes('Review delays compound'));
	});

	it('shows review speed critical tip', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ reviewTurnaroundMedianHours: 50 }),
			defaultThresholds,
		);
		assert.ok(card.includes('**Review speed**'));
		assert.ok(card.includes('Two-day review waits'));
	});

	it('shows WIP warning tip', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ wipCount: 8, collaboratorCount: 4 }),
			defaultThresholds,
		);
		assert.ok(card.includes('**WIP**'));
		assert.ok(card.includes('context-switching'));
	});

	it('shows WIP critical tip', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ wipCount: 15, collaboratorCount: 4 }),
			defaultThresholds,
		);
		assert.ok(card.includes('**WIP**'));
		assert.ok(card.includes('stop starting'));
	});

	it('shows concentration warning tip', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ concentrationRatio: 0.65 }),
			defaultThresholds,
		);
		assert.ok(card.includes('**Concentration**'));
		assert.ok(card.includes('Rotating reviewers'));
	});

	it('shows concentration critical tip', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ concentrationRatio: 0.8 }),
			defaultThresholds,
		);
		assert.ok(card.includes('**Concentration**'));
		assert.ok(card.includes('bus-factor'));
	});

	it('shows review depth light tip', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ reviewDepthScore: 0.3 }),
			defaultThresholds,
		);
		assert.ok(card.includes('**Review depth**'));
		assert.ok(card.includes('Light reviews'));
	});

	it('shows review depth critical tip (very few comments)', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ reviewDepthScore: 0.1 }),
			defaultThresholds,
		);
		assert.ok(card.includes('**Review depth**'));
		assert.ok(card.includes('Very few comments'));
	});

	it('shows review depth over-engineering tip', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ reviewDepthScore: 4.0 }),
			defaultThresholds,
		);
		assert.ok(card.includes('**Review depth**'));
		assert.ok(card.includes('diminishing returns'));
	});

	it('shows solo contributor tip', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ collaboratorCount: 1, concentrationRatio: 1.0, throughputCount: 3 }),
			defaultThresholds,
		);
		assert.ok(card.includes('**Collaboration**'));
		assert.ok(card.includes('Solo work'));
	});

	it('does not show solo contributor tip when throughput is 0', () => {
		const card = renderHealthCard(
			makeConfig(),
			makeMetrics({ collaboratorCount: 1, concentrationRatio: 1.0, throughputCount: 0 }),
			defaultThresholds,
		);
		assert.ok(!card.includes('Solo work'));
	});
});

// ---------------------------------------------------------------------------
// Quick wins with custom thresholds
// ---------------------------------------------------------------------------

describe('renderHealthCard — quick wins with custom thresholds', () => {
	it('triggers cycle time tip with tighter threshold', () => {
		const tightThresholds = { ...defaultThresholds, cycleTimeWarningHours: 10 };
		const card = renderHealthCard(
			makeConfig({ thresholds: tightThresholds }),
			makeMetrics({ cycleTimeMedianHours: 15 }),
			tightThresholds,
		);
		assert.ok(card.includes('**Cycle time**'));
	});

	it('does not trigger cycle time tip with relaxed threshold', () => {
		const relaxed = { ...defaultThresholds, cycleTimeWarningHours: 500 };
		const card = renderHealthCard(
			makeConfig({ thresholds: relaxed }),
			makeMetrics({ cycleTimeMedianHours: 100 }),
			relaxed,
		);
		assert.ok(!card.includes('**Cycle time**'));
	});
});
