import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateMetrics, formatDuration } from '../metrics';
import { PullRequest, Review } from '../github-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePR(overrides: Partial<PullRequest> & { number: number }): PullRequest {
	return {
		title: `PR #${overrides.number}`,
		createdAt: new Date('2025-01-01T00:00:00Z'),
		mergedAt: new Date('2025-01-02T00:00:00Z'),
		author: 'alice',
		...overrides,
	};
}

function makeReview(overrides: Partial<Review> & { prNumber: number }): Review {
	return {
		submittedAt: new Date('2025-01-01T12:00:00Z'),
		author: 'bob',
		state: 'APPROVED',
		commentCount: 0,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// formatDuration
// ---------------------------------------------------------------------------

describe('formatDuration', () => {
	it('formats sub-hour as minutes', () => {
		assert.strictEqual(formatDuration(0.5), '30 min');
	});

	it('formats exactly 0 hours as 0 min', () => {
		assert.strictEqual(formatDuration(0), '0 min');
	});

	it('formats hours (< 24)', () => {
		assert.strictEqual(formatDuration(5.3), '5.3 hours');
	});

	it('formats exactly 1 hour', () => {
		assert.strictEqual(formatDuration(1), '1.0 hours');
	});

	it('formats 23.9 hours as hours', () => {
		assert.strictEqual(formatDuration(23.9), '23.9 hours');
	});

	it('formats 24+ hours as days', () => {
		assert.strictEqual(formatDuration(48), '2.0 days');
	});

	it('formats fractional days', () => {
		assert.strictEqual(formatDuration(36), '1.5 days');
	});
});

// ---------------------------------------------------------------------------
// calculateMetrics — empty sprint
// ---------------------------------------------------------------------------

describe('calculateMetrics — empty sprint', () => {
	it('returns zeroed metrics for no PRs', () => {
		const metrics = calculateMetrics([], new Map(), 0);

		assert.strictEqual(metrics.cycleTimeMedianHours, 0);
		assert.strictEqual(metrics.cycleTimeP90Hours, 0);
		assert.strictEqual(metrics.throughputCount, 0);
		assert.strictEqual(metrics.wipCount, 0);
		assert.strictEqual(metrics.reviewTurnaroundMedianHours, 0);
		assert.strictEqual(metrics.collaboratorCount, 0);
		assert.strictEqual(metrics.concentrationRatio, 0);
		assert.strictEqual(metrics.reviewDepthScore, 0);
		assert.deepStrictEqual(metrics.prNumbers, []);
	});

	it('reports open PRs as WIP even with no merged PRs', () => {
		const metrics = calculateMetrics([], new Map(), 5);
		assert.strictEqual(metrics.wipCount, 5);
	});
});

// ---------------------------------------------------------------------------
// calculateMetrics — single PR
// ---------------------------------------------------------------------------

describe('calculateMetrics — single PR', () => {
	it('computes cycle time from created → merged', () => {
		const pr = makePR({
			number: 1,
			createdAt: new Date('2025-01-01T00:00:00Z'),
			mergedAt: new Date('2025-01-01T12:00:00Z'),
		});

		const metrics = calculateMetrics([pr], new Map(), 0);

		assert.strictEqual(metrics.cycleTimeMedianHours, 12);
		assert.strictEqual(metrics.cycleTimeP90Hours, 12);
		assert.strictEqual(metrics.throughputCount, 1);
		assert.deepStrictEqual(metrics.prNumbers, [1]);
	});

	it('single contributor has concentration ratio of 1', () => {
		const pr = makePR({ number: 1, author: 'alice' });
		const metrics = calculateMetrics([pr], new Map(), 0);

		assert.strictEqual(metrics.collaboratorCount, 1);
		assert.strictEqual(metrics.concentrationRatio, 1);
	});

	it('ignores self-reviews for turnaround', () => {
		const pr = makePR({ number: 1, author: 'alice' });
		const reviews = new Map<number, Review[]>([
			[1, [makeReview({ prNumber: 1, author: 'alice' })]],
		]);

		const metrics = calculateMetrics([pr], reviews, 0);
		assert.strictEqual(metrics.reviewTurnaroundMedianHours, 0);
	});

	it('calculates review turnaround from external review', () => {
		const pr = makePR({
			number: 1,
			createdAt: new Date('2025-01-01T00:00:00Z'),
			author: 'alice',
		});
		const reviews = new Map<number, Review[]>([
			[1, [makeReview({
				prNumber: 1,
				author: 'bob',
				submittedAt: new Date('2025-01-01T06:00:00Z'),
			})]],
		]);

		const metrics = calculateMetrics([pr], reviews, 0);
		assert.strictEqual(metrics.reviewTurnaroundMedianHours, 6);
	});
});

// ---------------------------------------------------------------------------
// calculateMetrics — multiple PRs
// ---------------------------------------------------------------------------

describe('calculateMetrics — multiple PRs', () => {
	const prs: PullRequest[] = [
		makePR({
			number: 1,
			author: 'alice',
			createdAt: new Date('2025-01-01T00:00:00Z'),
			mergedAt: new Date('2025-01-01T10:00:00Z'), // 10h
		}),
		makePR({
			number: 2,
			author: 'bob',
			createdAt: new Date('2025-01-02T00:00:00Z'),
			mergedAt: new Date('2025-01-03T00:00:00Z'), // 24h
		}),
		makePR({
			number: 3,
			author: 'carol',
			createdAt: new Date('2025-01-03T00:00:00Z'),
			mergedAt: new Date('2025-01-05T00:00:00Z'), // 48h
		}),
	];

	it('computes correct median cycle time (odd count)', () => {
		const metrics = calculateMetrics(prs, new Map(), 0);
		// sorted: [10, 24, 48] → median = 24
		assert.strictEqual(metrics.cycleTimeMedianHours, 24);
	});

	it('computes correct P90 cycle time', () => {
		const metrics = calculateMetrics(prs, new Map(), 0);
		// P90 of [10, 24, 48]: ceil(0.9*3)-1 = 2, so sorted[2] = 48
		assert.strictEqual(metrics.cycleTimeP90Hours, 48);
	});

	it('computes median for even number of PRs', () => {
		const fourPrs = [
			...prs,
			makePR({
				number: 4,
				author: 'dave',
				createdAt: new Date('2025-01-04T00:00:00Z'),
				mergedAt: new Date('2025-01-04T06:00:00Z'), // 6h
			}),
		];
		const metrics = calculateMetrics(fourPrs, new Map(), 0);
		// sorted: [6, 10, 24, 48] → median = (10+24)/2 = 17
		assert.strictEqual(metrics.cycleTimeMedianHours, 17);
	});

	it('counts unique contributors', () => {
		const metrics = calculateMetrics(prs, new Map(), 0);
		assert.strictEqual(metrics.collaboratorCount, 3);
	});

	it('computes balanced concentration ratio', () => {
		const metrics = calculateMetrics(prs, new Map(), 0);
		// 3 PRs by 3 authors → each has 1/3
		assert.ok(Math.abs(metrics.concentrationRatio - 1 / 3) < 0.01);
	});

	it('computes concentrated ratio when one author dominates', () => {
		const skewedPrs = [
			makePR({ number: 1, author: 'alice' }),
			makePR({ number: 2, author: 'alice' }),
			makePR({ number: 3, author: 'alice' }),
			makePR({ number: 4, author: 'bob' }),
		];
		const metrics = calculateMetrics(skewedPrs, new Map(), 0);
		assert.strictEqual(metrics.concentrationRatio, 0.75);
	});

	it('computes throughput as merged PR count', () => {
		const metrics = calculateMetrics(prs, new Map(), 0);
		assert.strictEqual(metrics.throughputCount, 3);
	});

	it('reports open PRs as WIP', () => {
		const metrics = calculateMetrics(prs, new Map(), 7);
		assert.strictEqual(metrics.wipCount, 7);
	});

	it('tracks PR numbers', () => {
		const metrics = calculateMetrics(prs, new Map(), 0);
		assert.deepStrictEqual(metrics.prNumbers, [1, 2, 3]);
	});
});

// ---------------------------------------------------------------------------
// calculateMetrics — review turnaround with multiple reviews
// ---------------------------------------------------------------------------

describe('calculateMetrics — review turnaround', () => {
	it('uses earliest non-author review for turnaround', () => {
		const pr = makePR({
			number: 1,
			author: 'alice',
			createdAt: new Date('2025-01-01T00:00:00Z'),
		});
		const reviews = new Map<number, Review[]>([
			[1, [
				makeReview({ prNumber: 1, author: 'bob', submittedAt: new Date('2025-01-01T10:00:00Z') }),
				makeReview({ prNumber: 1, author: 'carol', submittedAt: new Date('2025-01-01T04:00:00Z') }),
			]],
		]);

		const metrics = calculateMetrics([pr], reviews, 0);
		// carol reviewed at 4h, bob at 10h → first = 4h
		assert.strictEqual(metrics.reviewTurnaroundMedianHours, 4);
	});

	it('computes median turnaround across multiple PRs', () => {
		const prs = [
			makePR({ number: 1, author: 'alice', createdAt: new Date('2025-01-01T00:00:00Z') }),
			makePR({ number: 2, author: 'bob', createdAt: new Date('2025-01-02T00:00:00Z') }),
			makePR({ number: 3, author: 'carol', createdAt: new Date('2025-01-03T00:00:00Z') }),
		];
		const reviews = new Map<number, Review[]>([
			[1, [makeReview({ prNumber: 1, author: 'bob', submittedAt: new Date('2025-01-01T02:00:00Z') })]],  // 2h
			[2, [makeReview({ prNumber: 2, author: 'alice', submittedAt: new Date('2025-01-02T08:00:00Z') })]], // 8h
			[3, [makeReview({ prNumber: 3, author: 'alice', submittedAt: new Date('2025-01-03T20:00:00Z') })]], // 20h
		]);

		const metrics = calculateMetrics(prs, reviews, 0);
		// sorted turnarounds: [2, 8, 20] → median = 8
		assert.strictEqual(metrics.reviewTurnaroundMedianHours, 8);
	});

	it('skips PRs with no external reviews in turnaround', () => {
		const prs = [
			makePR({ number: 1, author: 'alice', createdAt: new Date('2025-01-01T00:00:00Z') }),
			makePR({ number: 2, author: 'bob', createdAt: new Date('2025-01-02T00:00:00Z') }),
		];
		const reviews = new Map<number, Review[]>([
			[1, [makeReview({ prNumber: 1, author: 'alice' })]],  // self-review only
			[2, [makeReview({ prNumber: 2, author: 'alice', submittedAt: new Date('2025-01-02T06:00:00Z') })]],  // 6h
		]);

		const metrics = calculateMetrics(prs, reviews, 0);
		assert.strictEqual(metrics.reviewTurnaroundMedianHours, 6);
	});
});

// ---------------------------------------------------------------------------
// calculateMetrics — review depth
// ---------------------------------------------------------------------------

describe('calculateMetrics — review depth', () => {
	it('returns 0 when no reviews exist', () => {
		const pr = makePR({ number: 1 });
		const metrics = calculateMetrics([pr], new Map(), 0);
		assert.strictEqual(metrics.reviewDepthScore, 0);
	});

	it('returns 0 when only self-reviews exist', () => {
		const pr = makePR({ number: 1, author: 'alice' });
		const reviews = new Map<number, Review[]>([
			[1, [makeReview({ prNumber: 1, author: 'alice', commentCount: 5 })]],
		]);
		const metrics = calculateMetrics([pr], reviews, 0);
		assert.strictEqual(metrics.reviewDepthScore, 0);
	});

	it('computes average comments per PR from external reviews', () => {
		const prs = [
			makePR({ number: 1, author: 'alice' }),
			makePR({ number: 2, author: 'alice' }),
		];
		const reviews = new Map<number, Review[]>([
			[1, [makeReview({ prNumber: 1, author: 'bob', commentCount: 4 })]],
			[2, [
				makeReview({ prNumber: 2, author: 'bob', commentCount: 2 }),
				makeReview({ prNumber: 2, author: 'carol', commentCount: 2 }),
			]],
		]);

		const metrics = calculateMetrics(prs, reviews, 0);
		// PR 1: 4 comments, PR 2: 2+2=4 comments → avg = (4+4)/2 = 4
		assert.strictEqual(metrics.reviewDepthScore, 4);
	});

	it('excludes self-review comments from depth', () => {
		const pr = makePR({ number: 1, author: 'alice' });
		const reviews = new Map<number, Review[]>([
			[1, [
				makeReview({ prNumber: 1, author: 'alice', commentCount: 10 }),
				makeReview({ prNumber: 1, author: 'bob', commentCount: 2 }),
			]],
		]);

		const metrics = calculateMetrics([pr], reviews, 0);
		// Only bob's review counts: 2 comments on 1 PR
		assert.strictEqual(metrics.reviewDepthScore, 2);
	});
});

// ---------------------------------------------------------------------------
// calculateMetrics — cycle time trend
// ---------------------------------------------------------------------------

describe('calculateMetrics — trend', () => {
	it('defaults to stable (TODO in source)', () => {
		const pr = makePR({ number: 1 });
		const metrics = calculateMetrics([pr], new Map(), 0);
		assert.strictEqual(metrics.cycleTimeTrend, 'stable');
	});
});
