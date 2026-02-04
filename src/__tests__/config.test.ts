import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { getConfig } from '../config';

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

// All env keys that getConfig might read (standalone + action mode INPUT_ vars)
const ALL_ENV_KEYS = [
	'GITHUB_ACTIONS',
	'GITHUB_TOKEN',
	'GITHUB_REPOSITORY',
	'INPUT_SPRINT_LENGTH_DAYS',
	'INPUT_POST_AS',
	'INPUT_ISSUE_NUMBER',
	'AURORA_API_KEY',
	'AURORA_TEAM_ID',
	'INPUT_CYCLE_TIME_WARNING_HOURS',
	'INPUT_CYCLE_TIME_CRITICAL_HOURS',
	'INPUT_REVIEW_WARNING_HOURS',
	'INPUT_REVIEW_CRITICAL_HOURS',
	'INPUT_WIP_WARNING_RATIO',
	'INPUT_WIP_CRITICAL_RATIO',
	// GitHub Action mode (core.getInput reads INPUT_<UPPERCASE-NAME>)
	'INPUT_GITHUB-TOKEN',
	'INPUT_SPRINT-LENGTH-DAYS',
	'INPUT_POST-AS',
	'INPUT_ISSUE-NUMBER',
	'INPUT_AURORA-API-KEY',
	'INPUT_AURORA-TEAM-ID',
	'INPUT_CYCLE-TIME-WARNING-HOURS',
	'INPUT_CYCLE-TIME-CRITICAL-HOURS',
	'INPUT_REVIEW-WARNING-HOURS',
	'INPUT_REVIEW-CRITICAL-HOURS',
	'INPUT_WIP-WARNING-RATIO',
	'INPUT_WIP-CRITICAL-RATIO',
];

// ---------------------------------------------------------------------------
// Standalone mode (no GITHUB_ACTIONS)
// ---------------------------------------------------------------------------

describe('getConfig — standalone mode', () => {
	beforeEach(() => clearEnv(ALL_ENV_KEYS));
	afterEach(() => clearEnv(ALL_ENV_KEYS));

	it('reads token from GITHUB_TOKEN env var', () => {
		setEnv({ GITHUB_TOKEN: 'my-token', GITHUB_REPOSITORY: 'owner/repo' });
		const config = getConfig();
		assert.strictEqual(config.token, 'my-token');
	});

	it('parses owner and repo from GITHUB_REPOSITORY', () => {
		setEnv({ GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'acme/widgets' });
		const config = getConfig();
		assert.strictEqual(config.owner, 'acme');
		assert.strictEqual(config.repo, 'widgets');
	});

	it('throws when GITHUB_REPOSITORY is missing', () => {
		setEnv({ GITHUB_TOKEN: 't' });
		assert.throws(() => getConfig(), { message: /Could not parse GITHUB_REPOSITORY/ });
	});

	it('throws when GITHUB_REPOSITORY has no slash', () => {
		setEnv({ GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'noslash' });
		assert.throws(() => getConfig(), { message: /Could not parse GITHUB_REPOSITORY/ });
	});

	it('uses default sprint length of 14 days', () => {
		setEnv({ GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r' });
		const config = getConfig();
		assert.strictEqual(config.sprintLengthDays, 14);
	});

	it('reads custom sprint length from INPUT_SPRINT_LENGTH_DAYS', () => {
		setEnv({
			GITHUB_TOKEN: 't',
			GITHUB_REPOSITORY: 'o/r',
			INPUT_SPRINT_LENGTH_DAYS: '7',
		});
		const config = getConfig();
		assert.strictEqual(config.sprintLengthDays, 7);
	});

	it('computes periodStart as sprintLengthDays before periodEnd', () => {
		setEnv({
			GITHUB_TOKEN: 't',
			GITHUB_REPOSITORY: 'o/r',
			INPUT_SPRINT_LENGTH_DAYS: '7',
		});
		const config = getConfig();
		const diffMs = config.periodEnd.getTime() - config.periodStart.getTime();
		const diffDays = diffMs / (1000 * 60 * 60 * 24);
		assert.ok(Math.abs(diffDays - 7) < 0.1, `Expected ~7 days, got ${diffDays}`);
	});

	it('defaults post-as to summary', () => {
		setEnv({ GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r' });
		const config = getConfig();
		assert.strictEqual(config.postAs, 'summary');
	});

	it('reads post-as from INPUT_POST_AS', () => {
		setEnv({
			GITHUB_TOKEN: 't',
			GITHUB_REPOSITORY: 'o/r',
			INPUT_POST_AS: 'issue-comment',
		});
		const config = getConfig();
		assert.strictEqual(config.postAs, 'issue-comment');
	});

	it('falls back to summary for invalid post-as', () => {
		setEnv({
			GITHUB_TOKEN: 't',
			GITHUB_REPOSITORY: 'o/r',
			INPUT_POST_AS: 'invalid-value',
		});
		const warnMock = mock.method(console, 'warn', () => {});
		const config = getConfig();
		assert.strictEqual(config.postAs, 'summary');
		assert.ok(warnMock.mock.callCount() > 0);
		warnMock.mock.restore();
	});

	it('parses issue-number from INPUT_ISSUE_NUMBER', () => {
		setEnv({
			GITHUB_TOKEN: 't',
			GITHUB_REPOSITORY: 'o/r',
			INPUT_ISSUE_NUMBER: '42',
		});
		const config = getConfig();
		assert.strictEqual(config.issueNumber, 42);
	});

	it('returns undefined issue-number when not set', () => {
		setEnv({ GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r' });
		const config = getConfig();
		assert.strictEqual(config.issueNumber, undefined);
	});

	it('reads Aurora API key from AURORA_API_KEY', () => {
		setEnv({
			GITHUB_TOKEN: 't',
			GITHUB_REPOSITORY: 'o/r',
			AURORA_API_KEY: 'ak-123',
		});
		const config = getConfig();
		assert.strictEqual(config.auroraApiKey, 'ak-123');
	});

	it('reads Aurora team ID from AURORA_TEAM_ID', () => {
		setEnv({
			GITHUB_TOKEN: 't',
			GITHUB_REPOSITORY: 'o/r',
			AURORA_TEAM_ID: 'team-456',
		});
		const config = getConfig();
		assert.strictEqual(config.auroraTeamId, 'team-456');
	});

	it('returns undefined for missing Aurora keys', () => {
		setEnv({ GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r' });
		const config = getConfig();
		assert.strictEqual(config.auroraApiKey, undefined);
		assert.strictEqual(config.auroraTeamId, undefined);
	});
});

// ---------------------------------------------------------------------------
// Standalone mode — thresholds
// ---------------------------------------------------------------------------

describe('getConfig — standalone thresholds', () => {
	beforeEach(() => {
		clearEnv(ALL_ENV_KEYS);
		setEnv({ GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r' });
	});
	afterEach(() => clearEnv(ALL_ENV_KEYS));

	it('uses default threshold values', () => {
		const config = getConfig();
		assert.strictEqual(config.thresholds.cycleTimeWarningHours, 72);
		assert.strictEqual(config.thresholds.cycleTimeCriticalHours, 168);
		assert.strictEqual(config.thresholds.reviewWarningHours, 24);
		assert.strictEqual(config.thresholds.reviewCriticalHours, 48);
		assert.strictEqual(config.thresholds.wipWarningRatio, 2);
		assert.strictEqual(config.thresholds.wipCriticalRatio, 3);
	});

	it('has fixed concentration thresholds', () => {
		const config = getConfig();
		assert.strictEqual(config.thresholds.concentrationWarning, 0.6);
		assert.strictEqual(config.thresholds.concentrationCritical, 0.75);
	});

	it('has fixed review depth thresholds', () => {
		const config = getConfig();
		assert.strictEqual(config.thresholds.reviewDepthWarning, 0.5);
		assert.strictEqual(config.thresholds.reviewDepthCritical, 0.2);
	});

	it('reads custom cycle time thresholds from env', () => {
		setEnv({
			INPUT_CYCLE_TIME_WARNING_HOURS: '36',
			INPUT_CYCLE_TIME_CRITICAL_HOURS: '96',
		});
		const config = getConfig();
		assert.strictEqual(config.thresholds.cycleTimeWarningHours, 36);
		assert.strictEqual(config.thresholds.cycleTimeCriticalHours, 96);
	});

	it('reads custom review thresholds from env', () => {
		setEnv({
			INPUT_REVIEW_WARNING_HOURS: '12',
			INPUT_REVIEW_CRITICAL_HOURS: '36',
		});
		const config = getConfig();
		assert.strictEqual(config.thresholds.reviewWarningHours, 12);
		assert.strictEqual(config.thresholds.reviewCriticalHours, 36);
	});

	it('reads custom WIP thresholds from env', () => {
		setEnv({
			INPUT_WIP_WARNING_RATIO: '1.5',
			INPUT_WIP_CRITICAL_RATIO: '2.5',
		});
		const config = getConfig();
		assert.strictEqual(config.thresholds.wipWarningRatio, 1.5);
		assert.strictEqual(config.thresholds.wipCriticalRatio, 2.5);
	});
});

// ---------------------------------------------------------------------------
// GitHub Action mode — core.getInput reads INPUT_<NAME> env vars
// ---------------------------------------------------------------------------

describe('getConfig — GitHub Action mode', () => {
	beforeEach(() => {
		clearEnv(ALL_ENV_KEYS);
		setEnv({
			GITHUB_ACTIONS: 'true',
			GITHUB_REPOSITORY: 'org/app',
		});
	});
	afterEach(() => clearEnv(ALL_ENV_KEYS));

	it('reads token from INPUT_GITHUB-TOKEN', () => {
		setEnv({ 'INPUT_GITHUB-TOKEN': 'action-token' });
		const config = getConfig();
		assert.strictEqual(config.token, 'action-token');
	});

	it('falls back to GITHUB_TOKEN when input is empty', () => {
		setEnv({ GITHUB_TOKEN: 'env-token' });
		const config = getConfig();
		assert.strictEqual(config.token, 'env-token');
	});

	it('reads sprint-length-days from INPUT_SPRINT-LENGTH-DAYS', () => {
		setEnv({ 'INPUT_SPRINT-LENGTH-DAYS': '21' });
		const config = getConfig();
		assert.strictEqual(config.sprintLengthDays, 21);
	});

	it('reads post-as from INPUT_POST-AS', () => {
		setEnv({ 'INPUT_POST-AS': 'issue-comment' });
		const config = getConfig();
		assert.strictEqual(config.postAs, 'issue-comment');
	});

	it('reads issue-number from INPUT_ISSUE-NUMBER', () => {
		setEnv({ 'INPUT_ISSUE-NUMBER': '99' });
		const config = getConfig();
		assert.strictEqual(config.issueNumber, 99);
	});

	it('reads aurora keys from INPUT_ env vars', () => {
		setEnv({
			'INPUT_AURORA-API-KEY': 'ak-action',
			'INPUT_AURORA-TEAM-ID': 'team-action',
		});
		const config = getConfig();
		assert.strictEqual(config.auroraApiKey, 'ak-action');
		assert.strictEqual(config.auroraTeamId, 'team-action');
	});

	it('reads all threshold inputs', () => {
		setEnv({
			'INPUT_CYCLE-TIME-WARNING-HOURS': '50',
			'INPUT_CYCLE-TIME-CRITICAL-HOURS': '100',
			'INPUT_REVIEW-WARNING-HOURS': '10',
			'INPUT_REVIEW-CRITICAL-HOURS': '30',
			'INPUT_WIP-WARNING-RATIO': '1.5',
			'INPUT_WIP-CRITICAL-RATIO': '2.5',
		});
		const config = getConfig();
		assert.strictEqual(config.thresholds.cycleTimeWarningHours, 50);
		assert.strictEqual(config.thresholds.cycleTimeCriticalHours, 100);
		assert.strictEqual(config.thresholds.reviewWarningHours, 10);
		assert.strictEqual(config.thresholds.reviewCriticalHours, 30);
		assert.strictEqual(config.thresholds.wipWarningRatio, 1.5);
		assert.strictEqual(config.thresholds.wipCriticalRatio, 2.5);
	});
});

// ---------------------------------------------------------------------------
// Configuration matrix: post-as × issue-number
// ---------------------------------------------------------------------------

describe('getConfig — post-as × issue-number matrix', () => {
	beforeEach(() => {
		clearEnv(ALL_ENV_KEYS);
		setEnv({ GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r' });
	});
	afterEach(() => clearEnv(ALL_ENV_KEYS));

	it('summary + no issue-number → valid', () => {
		setEnv({ INPUT_POST_AS: 'summary' });
		const config = getConfig();
		assert.strictEqual(config.postAs, 'summary');
		assert.strictEqual(config.issueNumber, undefined);
	});

	it('summary + issue-number → valid (issue-number present but unused)', () => {
		setEnv({ INPUT_POST_AS: 'summary', INPUT_ISSUE_NUMBER: '10' });
		const config = getConfig();
		assert.strictEqual(config.postAs, 'summary');
		assert.strictEqual(config.issueNumber, 10);
	});

	it('issue-comment + issue-number → valid', () => {
		setEnv({ INPUT_POST_AS: 'issue-comment', INPUT_ISSUE_NUMBER: '10' });
		const config = getConfig();
		assert.strictEqual(config.postAs, 'issue-comment');
		assert.strictEqual(config.issueNumber, 10);
	});

	it('issue-comment + no issue-number → valid config (runtime handles the gap)', () => {
		setEnv({ INPUT_POST_AS: 'issue-comment' });
		const config = getConfig();
		assert.strictEqual(config.postAs, 'issue-comment');
		assert.strictEqual(config.issueNumber, undefined);
	});
});

// ---------------------------------------------------------------------------
// Configuration matrix: Aurora key combinations
// ---------------------------------------------------------------------------

describe('getConfig — Aurora key combinations', () => {
	beforeEach(() => {
		clearEnv(ALL_ENV_KEYS);
		setEnv({ GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r' });
	});
	afterEach(() => clearEnv(ALL_ENV_KEYS));

	it('both keys set → both available', () => {
		setEnv({ AURORA_API_KEY: 'key', AURORA_TEAM_ID: 'team' });
		const config = getConfig();
		assert.strictEqual(config.auroraApiKey, 'key');
		assert.strictEqual(config.auroraTeamId, 'team');
	});

	it('only API key set → team ID undefined', () => {
		setEnv({ AURORA_API_KEY: 'key' });
		const config = getConfig();
		assert.strictEqual(config.auroraApiKey, 'key');
		assert.strictEqual(config.auroraTeamId, undefined);
	});

	it('only team ID set → API key undefined', () => {
		setEnv({ AURORA_TEAM_ID: 'team' });
		const config = getConfig();
		assert.strictEqual(config.auroraApiKey, undefined);
		assert.strictEqual(config.auroraTeamId, 'team');
	});

	it('neither set → both undefined', () => {
		const config = getConfig();
		assert.strictEqual(config.auroraApiKey, undefined);
		assert.strictEqual(config.auroraTeamId, undefined);
	});
});

// ---------------------------------------------------------------------------
// Sprint length edge cases
// ---------------------------------------------------------------------------

describe('getConfig — sprint length edge cases', () => {
	beforeEach(() => {
		clearEnv(ALL_ENV_KEYS);
		setEnv({ GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r' });
	});
	afterEach(() => clearEnv(ALL_ENV_KEYS));

	it('sprint length 1 day', () => {
		setEnv({ INPUT_SPRINT_LENGTH_DAYS: '1' });
		const config = getConfig();
		assert.strictEqual(config.sprintLengthDays, 1);
	});

	it('sprint length 30 days', () => {
		setEnv({ INPUT_SPRINT_LENGTH_DAYS: '30' });
		const config = getConfig();
		assert.strictEqual(config.sprintLengthDays, 30);
	});
});
