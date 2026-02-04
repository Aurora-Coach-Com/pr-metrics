import { describe, it } from 'node:test';
import assert from 'node:assert';
import { detectInsights, getHealthEmoji } from '../insights';
import { SprintMetrics } from '../metrics';
import { Thresholds } from '../config';

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

function makeMetrics(overrides: Partial<SprintMetrics> = {}): SprintMetrics {
	return {
		cycleTimeMedianHours: 20,
		cycleTimeP90Hours: 30,
		throughputCount: 5,
		wipCount: 2,
		reviewTurnaroundMedianHours: 8,
		collaboratorCount: 4,
		concentrationRatio: 0.3,
		reviewDepthScore: 2.0,
		cycleTimeTrend: 'stable',
		prNumbers: [1, 2, 3, 4, 5],
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// detectInsights — all healthy
// ---------------------------------------------------------------------------

describe('detectInsights — all healthy', () => {
	it('returns no insights when all metrics are within healthy range', () => {
		const insights = detectInsights(makeMetrics(), defaultThresholds);
		assert.deepStrictEqual(insights, []);
	});
});

// ---------------------------------------------------------------------------
// detectInsights — knowledge silo
// ---------------------------------------------------------------------------

describe('detectInsights — knowledge silo', () => {
	it('detects warning when concentration >= 0.6', () => {
		const insights = detectInsights(
			makeMetrics({ concentrationRatio: 0.6 }),
			defaultThresholds,
		);
		assert.strictEqual(insights.length, 1);
		assert.strictEqual(insights[0].type, 'knowledge-silo');
		assert.strictEqual(insights[0].severity, 'warning');
	});

	it('detects critical when concentration >= 0.75', () => {
		const insights = detectInsights(
			makeMetrics({ concentrationRatio: 0.8 }),
			defaultThresholds,
		);
		assert.strictEqual(insights.length, 1);
		assert.strictEqual(insights[0].type, 'knowledge-silo');
		assert.strictEqual(insights[0].severity, 'critical');
	});

	it('includes concentration percentage in message', () => {
		const insights = detectInsights(
			makeMetrics({ concentrationRatio: 0.8 }),
			defaultThresholds,
		);
		assert.ok(insights[0].message.includes('80%'));
	});
});

// ---------------------------------------------------------------------------
// detectInsights — cycle time regression
// ---------------------------------------------------------------------------

describe('detectInsights — cycle time regression', () => {
	it('detects warning when cycle time >= warning threshold', () => {
		const insights = detectInsights(
			makeMetrics({ cycleTimeMedianHours: 72 }),
			defaultThresholds,
		);
		assert.strictEqual(insights.length, 1);
		assert.strictEqual(insights[0].type, 'cycle-time-regression');
		assert.strictEqual(insights[0].severity, 'warning');
	});

	it('detects critical when cycle time >= critical threshold', () => {
		const insights = detectInsights(
			makeMetrics({ cycleTimeMedianHours: 200 }),
			defaultThresholds,
		);
		assert.strictEqual(insights.length, 1);
		assert.strictEqual(insights[0].type, 'cycle-time-regression');
		assert.strictEqual(insights[0].severity, 'critical');
	});

	it('critical message shows days', () => {
		const insights = detectInsights(
			makeMetrics({ cycleTimeMedianHours: 168 }),
			defaultThresholds,
		);
		assert.ok(insights[0].message.includes('7 days'));
	});
});

// ---------------------------------------------------------------------------
// detectInsights — WIP overload
// ---------------------------------------------------------------------------

describe('detectInsights — WIP overload', () => {
	it('detects warning when wip/collaborator >= warning ratio', () => {
		const insights = detectInsights(
			makeMetrics({ wipCount: 8, collaboratorCount: 4 }),
			defaultThresholds,
		);
		assert.strictEqual(insights.length, 1);
		assert.strictEqual(insights[0].type, 'wip-overload');
		assert.strictEqual(insights[0].severity, 'warning');
	});

	it('detects critical when wip/collaborator >= critical ratio', () => {
		const insights = detectInsights(
			makeMetrics({ wipCount: 12, collaboratorCount: 4 }),
			defaultThresholds,
		);
		assert.strictEqual(insights.length, 1);
		assert.strictEqual(insights[0].type, 'wip-overload');
		assert.strictEqual(insights[0].severity, 'critical');
	});

	it('reports 0 ratio when no collaborators', () => {
		const insights = detectInsights(
			makeMetrics({ wipCount: 10, collaboratorCount: 0 }),
			defaultThresholds,
		);
		const wipInsights = insights.filter(i => i.type === 'wip-overload');
		assert.strictEqual(wipInsights.length, 0);
	});
});

// ---------------------------------------------------------------------------
// detectInsights — review bottleneck
// ---------------------------------------------------------------------------

describe('detectInsights — review bottleneck', () => {
	it('detects warning when review turnaround >= warning hours', () => {
		const insights = detectInsights(
			makeMetrics({ reviewTurnaroundMedianHours: 24 }),
			defaultThresholds,
		);
		assert.strictEqual(insights.length, 1);
		assert.strictEqual(insights[0].type, 'review-bottleneck');
		assert.strictEqual(insights[0].severity, 'warning');
	});

	it('detects critical when review turnaround >= critical hours', () => {
		const insights = detectInsights(
			makeMetrics({ reviewTurnaroundMedianHours: 50 }),
			defaultThresholds,
		);
		assert.strictEqual(insights.length, 1);
		assert.strictEqual(insights[0].type, 'review-bottleneck');
		assert.strictEqual(insights[0].severity, 'critical');
	});
});

// ---------------------------------------------------------------------------
// detectInsights — shallow reviews
// ---------------------------------------------------------------------------

describe('detectInsights — shallow reviews', () => {
	it('detects warning (rubber-stamps) when depth <= critical threshold', () => {
		const insights = detectInsights(
			makeMetrics({ reviewDepthScore: 0.1, throughputCount: 5 }),
			defaultThresholds,
		);
		assert.strictEqual(insights.length, 1);
		assert.strictEqual(insights[0].type, 'shallow-reviews');
		assert.strictEqual(insights[0].severity, 'warning');
	});

	it('detects info when depth <= warning threshold but > critical', () => {
		const insights = detectInsights(
			makeMetrics({ reviewDepthScore: 0.4, throughputCount: 5 }),
			defaultThresholds,
		);
		assert.strictEqual(insights.length, 1);
		assert.strictEqual(insights[0].type, 'shallow-reviews');
		assert.strictEqual(insights[0].severity, 'info');
	});

	it('does not flag shallow reviews when throughput is 0', () => {
		const insights = detectInsights(
			makeMetrics({ reviewDepthScore: 0.1, throughputCount: 0 }),
			defaultThresholds,
		);
		const shallow = insights.filter(i => i.type === 'shallow-reviews');
		assert.strictEqual(shallow.length, 0);
	});

	it('flags when review depth is exactly 0 with throughput > 0', () => {
		// reviewDepthScore=0, throughputCount=5: condition is 5 > 0 && 0 <= 0.2 → true
		// The source treats zero-depth as shallow (rubber-stamp warning)
		const insights = detectInsights(
			makeMetrics({ reviewDepthScore: 0, throughputCount: 5 }),
			defaultThresholds,
		);
		const shallow = insights.filter(i => i.type === 'shallow-reviews');
		assert.strictEqual(shallow.length, 1);
		assert.strictEqual(shallow[0].severity, 'warning');
	});
});

// ---------------------------------------------------------------------------
// detectInsights — multiple insights, returns top 1
// ---------------------------------------------------------------------------

describe('detectInsights — priority and slicing', () => {
	it('returns only 1 insight even when multiple are triggered', () => {
		const insights = detectInsights(
			makeMetrics({
				cycleTimeMedianHours: 200,
				concentrationRatio: 0.8,
				reviewTurnaroundMedianHours: 50,
			}),
			defaultThresholds,
		);
		assert.strictEqual(insights.length, 1);
	});

	it('returns highest-severity insight first (critical > warning > info)', () => {
		const insights = detectInsights(
			makeMetrics({
				cycleTimeMedianHours: 200,         // critical
				reviewTurnaroundMedianHours: 24,   // warning
				reviewDepthScore: 0.4,             // info
			}),
			defaultThresholds,
		);
		assert.strictEqual(insights[0].severity, 'critical');
	});
});

// ---------------------------------------------------------------------------
// detectInsights — custom thresholds
// ---------------------------------------------------------------------------

describe('detectInsights — custom thresholds', () => {
	it('respects custom cycle time thresholds', () => {
		const tighterThresholds = { ...defaultThresholds, cycleTimeWarningHours: 10 };
		const insights = detectInsights(
			makeMetrics({ cycleTimeMedianHours: 15 }),
			tighterThresholds,
		);
		assert.strictEqual(insights.length, 1);
		assert.strictEqual(insights[0].type, 'cycle-time-regression');
	});

	it('does not trigger with relaxed thresholds', () => {
		const relaxedThresholds = {
			...defaultThresholds,
			cycleTimeWarningHours: 500,
			cycleTimeCriticalHours: 1000,
		};
		const insights = detectInsights(
			makeMetrics({ cycleTimeMedianHours: 200 }),
			relaxedThresholds,
		);
		assert.deepStrictEqual(insights, []);
	});

	it('respects custom WIP thresholds', () => {
		const tighterThresholds = { ...defaultThresholds, wipWarningRatio: 1 };
		const insights = detectInsights(
			makeMetrics({ wipCount: 5, collaboratorCount: 4 }),
			tighterThresholds,
		);
		assert.strictEqual(insights.length, 1);
		assert.strictEqual(insights[0].type, 'wip-overload');
	});

	it('respects custom review thresholds', () => {
		const tighterThresholds = { ...defaultThresholds, reviewWarningHours: 4 };
		const insights = detectInsights(
			makeMetrics({ reviewTurnaroundMedianHours: 5 }),
			tighterThresholds,
		);
		assert.strictEqual(insights.length, 1);
		assert.strictEqual(insights[0].type, 'review-bottleneck');
	});
});

// ---------------------------------------------------------------------------
// getHealthEmoji
// ---------------------------------------------------------------------------

describe('getHealthEmoji', () => {
	it('returns green when all metrics are healthy', () => {
		assert.strictEqual(getHealthEmoji(makeMetrics(), defaultThresholds), '🟢');
	});

	it('returns red when cycle time is critical', () => {
		assert.strictEqual(
			getHealthEmoji(makeMetrics({ cycleTimeMedianHours: 200 }), defaultThresholds),
			'🔴',
		);
	});

	it('returns red when WIP ratio is critical', () => {
		assert.strictEqual(
			getHealthEmoji(makeMetrics({ wipCount: 15, collaboratorCount: 4 }), defaultThresholds),
			'🔴',
		);
	});

	it('returns yellow when cycle time is at warning level', () => {
		assert.strictEqual(
			getHealthEmoji(makeMetrics({ cycleTimeMedianHours: 80 }), defaultThresholds),
			'🟡',
		);
	});

	it('returns yellow when WIP ratio is at warning level', () => {
		assert.strictEqual(
			getHealthEmoji(makeMetrics({ wipCount: 8, collaboratorCount: 4 }), defaultThresholds),
			'🟡',
		);
	});

	it('returns yellow when concentration is at warning level', () => {
		assert.strictEqual(
			getHealthEmoji(makeMetrics({ concentrationRatio: 0.65 }), defaultThresholds),
			'🟡',
		);
	});

	it('red takes precedence over yellow', () => {
		assert.strictEqual(
			getHealthEmoji(
				makeMetrics({ cycleTimeMedianHours: 200, concentrationRatio: 0.65 }),
				defaultThresholds,
			),
			'🔴',
		);
	});

	it('handles zero collaborators (wipRatio = 0)', () => {
		assert.strictEqual(
			getHealthEmoji(makeMetrics({ wipCount: 10, collaboratorCount: 0 }), defaultThresholds),
			'🟢',
		);
	});
});
