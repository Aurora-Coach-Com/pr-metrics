import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';

// ---------------------------------------------------------------------------
// CJS cache mocking: inject fake module exports into require.cache
// before action.ts loads them. Each test file runs in its own worker,
// so these replacements are isolated.
// ---------------------------------------------------------------------------

const mockSetOutput = mock.fn();
const mockWrite = mock.fn();
const mockAddRaw = mock.fn(() => ({ write: mockWrite }));

// Replace @actions/core in cache
require.cache[require.resolve('@actions/core')] = {
	id: require.resolve('@actions/core'),
	filename: require.resolve('@actions/core'),
	loaded: true,
	children: [],
	path: '',
	paths: [],
	exports: {
		getInput: (name: string) => {
			const val = process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] || '';
			return val.trim();
		},
		setOutput: mockSetOutput,
		summary: { addRaw: mockAddRaw },
	},
} as any;

// Replace @actions/github in cache
require.cache[require.resolve('@actions/github')] = {
	id: require.resolve('@actions/github'),
	filename: require.resolve('@actions/github'),
	loaded: true,
	children: [],
	path: '',
	paths: [],
	exports: {
		getOctokit: mock.fn(() => ({})),
	},
} as any;

// Mock GitHubClient
const mockGetMergedPRs = mock.fn(async () => [] as any[]);
const mockGetReviewsForPRs = mock.fn(async () => new Map());
const mockGetOpenPRs = mock.fn(async () => 0);
const mockPostIssueComment = mock.fn(async () => undefined);

// Resolve the .ts path for our own module (tsx handles .ts resolution)
const ghClientPath = require.resolve('../github-client');
require.cache[ghClientPath] = {
	id: ghClientPath,
	filename: ghClientPath,
	loaded: true,
	children: [],
	path: '',
	paths: [],
	exports: {
		GitHubClient: class MockGitHubClient {
			getMergedPRs = mockGetMergedPRs;
			getReviewsForPRs = mockGetReviewsForPRs;
			getOpenPRs = mockGetOpenPRs;
			postIssueComment = mockPostIssueComment;
		},
	},
} as any;

// Mock fetch for Aurora
const mockFetch = mock.fn(async () => ({ ok: true, text: async () => '' }));
mock.method(globalThis, 'fetch', mockFetch);

// Now load action — gets mocked dependencies from cache
const { run } = require('../action');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setEnv(vars: Record<string, string>) {
	for (const [key, value] of Object.entries(vars)) {
		process.env[key] = value;
	}
}

function clearEnv(keys: string[]) {
	for (const key of keys) {
		delete process.env[key];
	}
}

const ALL_ENV_KEYS = [
	'GITHUB_ACTIONS', 'GITHUB_TOKEN', 'GITHUB_REPOSITORY',
	'INPUT_SPRINT_LENGTH_DAYS', 'INPUT_POST_AS', 'INPUT_ISSUE_NUMBER',
	'AURORA_API_KEY', 'AURORA_TEAM_ID',
	'INPUT_CYCLE_TIME_WARNING_HOURS', 'INPUT_CYCLE_TIME_CRITICAL_HOURS',
	'INPUT_REVIEW_WARNING_HOURS', 'INPUT_REVIEW_CRITICAL_HOURS',
	'INPUT_WIP_WARNING_RATIO', 'INPUT_WIP_CRITICAL_RATIO',
	'INPUT_GITHUB-TOKEN', 'INPUT_SPRINT-LENGTH-DAYS',
	'INPUT_POST-AS', 'INPUT_ISSUE-NUMBER',
	'INPUT_AURORA-API-KEY', 'INPUT_AURORA-TEAM-ID',
	'INPUT_CYCLE-TIME-WARNING-HOURS', 'INPUT_CYCLE-TIME-CRITICAL-HOURS',
	'INPUT_REVIEW-WARNING-HOURS', 'INPUT_REVIEW-CRITICAL-HOURS',
	'INPUT_WIP-WARNING-RATIO', 'INPUT_WIP-CRITICAL-RATIO',
];

function makePRData(count: number) {
	return Array.from({ length: count }, (_, i) => ({
		number: i + 1,
		title: `PR #${i + 1}`,
		createdAt: new Date('2025-01-01T00:00:00Z'),
		mergedAt: new Date('2025-01-02T00:00:00Z'),
		author: `user-${i}`,
	}));
}

function resetMocks() {
	mockGetMergedPRs.mock.resetCalls();
	mockGetReviewsForPRs.mock.resetCalls();
	mockGetOpenPRs.mock.resetCalls();
	mockPostIssueComment.mock.resetCalls();
	mockSetOutput.mock.resetCalls();
	mockAddRaw.mock.resetCalls();
	mockWrite.mock.resetCalls();
	mockFetch.mock.resetCalls();

	mockGetMergedPRs.mock.mockImplementation(async () => []);
	mockGetReviewsForPRs.mock.mockImplementation(async () => new Map());
	mockGetOpenPRs.mock.mockImplementation(async () => 0);
	mockPostIssueComment.mock.mockImplementation(async () => undefined);
	mockFetch.mock.mockImplementation(async () => ({ ok: true, text: async () => '' }));
}

// ---------------------------------------------------------------------------
// Empty sprint
// ---------------------------------------------------------------------------

describe('run — empty sprint', () => {
	beforeEach(() => {
		clearEnv(ALL_ENV_KEYS);
		setEnv({ GITHUB_TOKEN: 'test-token', GITHUB_REPOSITORY: 'owner/repo' });
		resetMocks();
	});
	afterEach(() => clearEnv(ALL_ENV_KEYS));

	it('completes without error', async () => {
		await run();
	});

	it('does not fetch reviews or open PRs when no merged PRs', async () => {
		await run();
		assert.strictEqual(mockGetReviewsForPRs.mock.callCount(), 0);
		assert.strictEqual(mockGetOpenPRs.mock.callCount(), 0);
	});

	it('sets health-card output in GitHub Actions mode', async () => {
		setEnv({ GITHUB_ACTIONS: 'true' });
		await run();
		const healthCardCall = mockSetOutput.mock.calls.find(
			(c: any) => c.arguments[0] === 'health-card'
		);
		assert.ok(healthCardCall, 'setOutput should be called with health-card');
		assert.ok(
			(healthCardCall.arguments[1] as string).includes('No pull requests merged'),
		);
	});

	it('does not set metric outputs when no PRs', async () => {
		setEnv({ GITHUB_ACTIONS: 'true' });
		await run();
		const cycleTimeCall = mockSetOutput.mock.calls.find(
			(c: any) => c.arguments[0] === 'cycle-time-hours'
		);
		assert.strictEqual(cycleTimeCall, undefined);
	});
});

// ---------------------------------------------------------------------------
// Sprint with merged PRs
// ---------------------------------------------------------------------------

describe('run — sprint with merged PRs', () => {
	beforeEach(() => {
		clearEnv(ALL_ENV_KEYS);
		setEnv({ GITHUB_TOKEN: 'test-token', GITHUB_REPOSITORY: 'owner/repo' });
		resetMocks();
		mockGetMergedPRs.mock.mockImplementation(async () => makePRData(3));
		mockGetReviewsForPRs.mock.mockImplementation(async () => new Map([
			[1, [{ prNumber: 1, submittedAt: new Date('2025-01-01T06:00:00Z'), author: 'reviewer', state: 'APPROVED', commentCount: 1 }]],
			[2, []],
			[3, []],
		]));
		mockGetOpenPRs.mock.mockImplementation(async () => 2);
	});
	afterEach(() => clearEnv(ALL_ENV_KEYS));

	it('fetches reviews and open PRs', async () => {
		await run();
		assert.strictEqual(mockGetReviewsForPRs.mock.callCount(), 1);
		assert.strictEqual(mockGetOpenPRs.mock.callCount(), 1);
	});

	it('sets all metric outputs in GitHub Actions mode', async () => {
		setEnv({ GITHUB_ACTIONS: 'true' });
		await run();
		const outputNames = mockSetOutput.mock.calls.map((c: any) => c.arguments[0]);
		assert.ok(outputNames.includes('health-card'));
		assert.ok(outputNames.includes('cycle-time-hours'));
		assert.ok(outputNames.includes('throughput'));
		assert.ok(outputNames.includes('review-turnaround-hours'));
	});

	it('does not set outputs in standalone mode', async () => {
		await run();
		assert.strictEqual(mockSetOutput.mock.callCount(), 0);
	});
});

// ---------------------------------------------------------------------------
// post-as: summary
// ---------------------------------------------------------------------------

describe('run — post-as: summary', () => {
	beforeEach(() => {
		clearEnv(ALL_ENV_KEYS);
		setEnv({ GITHUB_TOKEN: 'test-token', GITHUB_REPOSITORY: 'owner/repo' });
		resetMocks();
		mockGetMergedPRs.mock.mockImplementation(async () => makePRData(1));
	});
	afterEach(() => clearEnv(ALL_ENV_KEYS));

	it('writes to job summary in GitHub Actions mode', async () => {
		setEnv({ GITHUB_ACTIONS: 'true', INPUT_POST_AS: 'summary' });
		await run();
		assert.ok(mockAddRaw.mock.callCount() > 0, 'summary.addRaw should be called');
		assert.ok(mockWrite.mock.callCount() > 0, 'summary.write should be called');
	});

	it('does not write job summary in standalone mode', async () => {
		setEnv({ INPUT_POST_AS: 'summary' });
		await run();
		assert.strictEqual(mockAddRaw.mock.callCount(), 0);
	});

	it('does not post issue comment', async () => {
		setEnv({ GITHUB_ACTIONS: 'true', INPUT_POST_AS: 'summary' });
		await run();
		assert.strictEqual(mockPostIssueComment.mock.callCount(), 0);
	});
});

// ---------------------------------------------------------------------------
// post-as: issue-comment
// ---------------------------------------------------------------------------

describe('run — post-as: issue-comment', () => {
	beforeEach(() => {
		clearEnv(ALL_ENV_KEYS);
		setEnv({ GITHUB_TOKEN: 'test-token', GITHUB_REPOSITORY: 'owner/repo' });
		resetMocks();
		mockGetMergedPRs.mock.mockImplementation(async () => makePRData(1));
	});
	afterEach(() => clearEnv(ALL_ENV_KEYS));

	it('posts comment to issue when issue-number is provided', async () => {
		setEnv({ INPUT_POST_AS: 'issue-comment', INPUT_ISSUE_NUMBER: '42' });
		await run();
		assert.strictEqual(mockPostIssueComment.mock.callCount(), 1);
		assert.strictEqual(mockPostIssueComment.mock.calls[0].arguments[0], 42);
	});

	it('does not post comment when issue-number is missing', async () => {
		setEnv({ INPUT_POST_AS: 'issue-comment' });
		await run();
		assert.strictEqual(mockPostIssueComment.mock.callCount(), 0);
	});

	it('does not write job summary when posting as issue-comment', async () => {
		setEnv({ INPUT_POST_AS: 'issue-comment', INPUT_ISSUE_NUMBER: '42' });
		await run();
		assert.strictEqual(mockAddRaw.mock.callCount(), 0);
	});
});

// ---------------------------------------------------------------------------
// Aurora integration
// ---------------------------------------------------------------------------

describe('run — Aurora integration', () => {
	beforeEach(() => {
		clearEnv(ALL_ENV_KEYS);
		setEnv({ GITHUB_TOKEN: 'test-token', GITHUB_REPOSITORY: 'owner/repo' });
		resetMocks();
		mockGetMergedPRs.mock.mockImplementation(async () => makePRData(2));
		mockGetOpenPRs.mock.mockImplementation(async () => 1);
	});
	afterEach(() => clearEnv(ALL_ENV_KEYS));

	it('pushes to Aurora when both keys are set', async () => {
		setEnv({ AURORA_API_KEY: 'ak-123', AURORA_TEAM_ID: 'team-456' });
		await run();
		assert.strictEqual(mockFetch.mock.callCount(), 1);
		const [url, opts] = mockFetch.mock.calls[0].arguments;
		assert.strictEqual(url, 'https://app.aurora-coach.com/api/teams/team-456/metrics');
		assert.strictEqual(opts.method, 'POST');
		assert.strictEqual(opts.headers['Authorization'], 'Bearer ak-123');
	});

	it('sends correct payload shape', async () => {
		setEnv({ AURORA_API_KEY: 'ak-123', AURORA_TEAM_ID: 'team-456' });
		await run();
		const body = JSON.parse(mockFetch.mock.calls[0].arguments[1].body);
		assert.strictEqual(body.source, 'github');
		assert.ok(body.periodStart);
		assert.ok(body.periodEnd);
		assert.ok(body.delivery);
		assert.ok(body.delivery.cycleTimeMedianHours !== undefined);
		assert.ok(body.collaboration);
		assert.strictEqual(body.raw.repoName, 'owner/repo');
	});

	it('does not push when API key is missing', async () => {
		setEnv({ AURORA_TEAM_ID: 'team-456' });
		await run();
		assert.strictEqual(mockFetch.mock.callCount(), 0);
	});

	it('does not push when team ID is missing', async () => {
		setEnv({ AURORA_API_KEY: 'ak-123' });
		await run();
		assert.strictEqual(mockFetch.mock.callCount(), 0);
	});

	it('does not push when neither key is set', async () => {
		await run();
		assert.strictEqual(mockFetch.mock.callCount(), 0);
	});

	it('does not push when sprint is empty', async () => {
		mockGetMergedPRs.mock.mockImplementation(async () => []);
		setEnv({ AURORA_API_KEY: 'ak-123', AURORA_TEAM_ID: 'team-456' });
		await run();
		assert.strictEqual(mockFetch.mock.callCount(), 0);
	});

	it('handles Aurora push failure gracefully', async () => {
		setEnv({ AURORA_API_KEY: 'ak-123', AURORA_TEAM_ID: 'team-456' });
		mockFetch.mock.mockImplementation(async () => ({
			ok: false, status: 500, text: async () => 'Internal error',
		}));
		const warnMock = mock.method(console, 'warn', () => {});
		await run();
		assert.ok(warnMock.mock.callCount() > 0);
		warnMock.mock.restore();
	});

	it('handles Aurora network error gracefully', async () => {
		setEnv({ AURORA_API_KEY: 'ak-123', AURORA_TEAM_ID: 'team-456' });
		mockFetch.mock.mockImplementation(async () => { throw new Error('Network error'); });
		const warnMock = mock.method(console, 'warn', () => {});
		await run();
		assert.ok(warnMock.mock.callCount() > 0);
		warnMock.mock.restore();
	});
});

// ---------------------------------------------------------------------------
// Custom thresholds end-to-end
// ---------------------------------------------------------------------------

describe('run — custom thresholds', () => {
	beforeEach(() => {
		clearEnv(ALL_ENV_KEYS);
		setEnv({
			GITHUB_TOKEN: 'test-token',
			GITHUB_REPOSITORY: 'owner/repo',
			GITHUB_ACTIONS: 'true',
		});
		resetMocks();
	});
	afterEach(() => clearEnv(ALL_ENV_KEYS));

	it('custom thresholds affect health card emoji', async () => {
		setEnv({
			'INPUT_CYCLE-TIME-WARNING-HOURS': '10',
			'INPUT_CYCLE-TIME-CRITICAL-HOURS': '20',
		});
		mockGetMergedPRs.mock.mockImplementation(async () => [{
			number: 1,
			title: 'PR #1',
			createdAt: new Date('2025-01-01T00:00:00Z'),
			mergedAt: new Date('2025-01-02T00:00:00Z'),
			author: 'alice',
		}]);

		await run();

		const healthCardCall = mockSetOutput.mock.calls.find(
			(c: any) => c.arguments[0] === 'health-card'
		);
		assert.ok(healthCardCall);
		assert.ok(
			(healthCardCall.arguments[1] as string).includes('🔴'),
			'Should show red emoji with tight thresholds',
		);
	});
});

// ---------------------------------------------------------------------------
// Full configuration matrix
// ---------------------------------------------------------------------------

describe('run — full configuration matrix', () => {
	beforeEach(() => {
		clearEnv(ALL_ENV_KEYS);
		setEnv({ GITHUB_TOKEN: 'test-token', GITHUB_REPOSITORY: 'owner/repo' });
		resetMocks();
	});
	afterEach(() => clearEnv(ALL_ENV_KEYS));

	const configs = [
		{ postAs: 'summary', aurora: false, prCount: 0, label: 'summary, no aurora, 0 PRs' },
		{ postAs: 'summary', aurora: false, prCount: 3, label: 'summary, no aurora, 3 PRs' },
		{ postAs: 'summary', aurora: true, prCount: 0, label: 'summary, aurora, 0 PRs' },
		{ postAs: 'summary', aurora: true, prCount: 3, label: 'summary, aurora, 3 PRs' },
		{ postAs: 'issue-comment', aurora: false, prCount: 0, label: 'issue-comment, no aurora, 0 PRs' },
		{ postAs: 'issue-comment', aurora: false, prCount: 3, label: 'issue-comment, no aurora, 3 PRs' },
		{ postAs: 'issue-comment', aurora: true, prCount: 0, label: 'issue-comment, aurora, 0 PRs' },
		{ postAs: 'issue-comment', aurora: true, prCount: 3, label: 'issue-comment, aurora, 3 PRs' },
	];

	for (const cfg of configs) {
		it(`${cfg.label} → runs without error`, async () => {
			setEnv({ INPUT_POST_AS: cfg.postAs });
			if (cfg.postAs === 'issue-comment') {
				setEnv({ INPUT_ISSUE_NUMBER: '1' });
			}
			if (cfg.aurora) {
				setEnv({ AURORA_API_KEY: 'ak-1', AURORA_TEAM_ID: 'tm-1' });
			}

			mockGetMergedPRs.mock.mockImplementation(async () => makePRData(cfg.prCount));
			mockGetOpenPRs.mock.mockImplementation(async () => cfg.prCount);

			await run();
		});
	}
});
