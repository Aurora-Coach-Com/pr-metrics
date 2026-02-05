/**
 * Configuration handling
 *
 * Reads from GitHub Action inputs when running as action,
 * or from environment variables when running standalone.
 */

import * as core from '@actions/core';

export interface Thresholds {
	cycleTimeWarningHours: number;
	cycleTimeCriticalHours: number;
	reviewWarningHours: number;
	reviewCriticalHours: number;
	wipWarningRatio: number;
	wipCriticalRatio: number;
	// These remain fixed (less context-dependent)
	concentrationWarning: number;
	concentrationCritical: number;
	reviewDepthWarning: number;
	reviewDepthCritical: number;
	prSizeWarning: number;
	prSizeCritical: number;
	buildSuccessWarning: number;
	buildSuccessCritical: number;
}

export interface Config {
	// GitHub
	token: string;
	owner: string;
	repo: string;

	// Sprint settings
	sprintLengthDays: number;
	periodStart: Date;
	periodEnd: Date;

	// Output settings
	postAs: 'summary' | 'issue-comment';
	issueNumber?: number;

	// Aurora integration (optional)
	auroraApiKey?: string;
	auroraTeamId?: string;

	// Filters
	workflowFilter?: string;
	deploymentEnvironment?: string;

	// Thresholds (configurable)
	thresholds: Thresholds;
}

export function getConfig(): Config {
	const isGitHubAction = !!process.env.GITHUB_ACTIONS;

	// Get token
	const token = isGitHubAction
		? core.getInput('github-token') || process.env.GITHUB_TOKEN!
		: process.env.GITHUB_TOKEN!;

	// Parse repository
	const repoFull = process.env.GITHUB_REPOSITORY || '';
	const [owner, repo] = repoFull.split('/');

	if (!owner || !repo) {
		throw new Error('Could not parse GITHUB_REPOSITORY. Expected format: owner/repo');
	}

	// Sprint length
	const sprintLengthDays = isGitHubAction
		? parseInt(core.getInput('sprint-length-days') || '14', 10)
		: parseInt(process.env.INPUT_SPRINT_LENGTH_DAYS || '14', 10);

	// Calculate period (end is now, start is sprint-length days ago)
	const periodEnd = new Date();
	const periodStart = new Date(periodEnd);
	periodStart.setDate(periodStart.getDate() - sprintLengthDays);

	// Output settings
	const postAsInput = isGitHubAction
		? core.getInput('post-as') || 'summary'
		: process.env.INPUT_POST_AS || 'summary';

	const postAs = validatePostAs(postAsInput);

	const issueNumberStr = isGitHubAction
		? core.getInput('issue-number')
		: process.env.INPUT_ISSUE_NUMBER;

	const issueNumber = issueNumberStr ? parseInt(issueNumberStr, 10) : undefined;

	// Aurora integration
	const auroraApiKey = isGitHubAction
		? core.getInput('aurora-api-key')
		: process.env.AURORA_API_KEY;

	const auroraTeamId = isGitHubAction
		? core.getInput('aurora-team-id')
		: process.env.AURORA_TEAM_ID;

	// Filters
	const workflowFilter = isGitHubAction
		? core.getInput('workflow-filter')
		: process.env.INPUT_WORKFLOW_FILTER;

	const deploymentEnvironment = isGitHubAction
		? core.getInput('deployment-environment')
		: process.env.INPUT_DEPLOYMENT_ENVIRONMENT;

	// Thresholds (configurable with sensible defaults)
	const thresholds: Thresholds = {
		cycleTimeWarningHours: parseFloat(
			isGitHubAction
				? core.getInput('cycle-time-warning-hours') || '72'
				: process.env.INPUT_CYCLE_TIME_WARNING_HOURS || '72'
		),
		cycleTimeCriticalHours: parseFloat(
			isGitHubAction
				? core.getInput('cycle-time-critical-hours') || '168'
				: process.env.INPUT_CYCLE_TIME_CRITICAL_HOURS || '168'
		),
		reviewWarningHours: parseFloat(
			isGitHubAction
				? core.getInput('review-warning-hours') || '24'
				: process.env.INPUT_REVIEW_WARNING_HOURS || '24'
		),
		reviewCriticalHours: parseFloat(
			isGitHubAction
				? core.getInput('review-critical-hours') || '48'
				: process.env.INPUT_REVIEW_CRITICAL_HOURS || '48'
		),
		wipWarningRatio: parseFloat(
			isGitHubAction
				? core.getInput('wip-warning-ratio') || '2'
				: process.env.INPUT_WIP_WARNING_RATIO || '2'
		),
		wipCriticalRatio: parseFloat(
			isGitHubAction
				? core.getInput('wip-critical-ratio') || '3'
				: process.env.INPUT_WIP_CRITICAL_RATIO || '3'
		),
		// Fixed thresholds (less context-dependent)
		concentrationWarning: 0.6,
		concentrationCritical: 0.75,
		reviewDepthWarning: 0.5,
		reviewDepthCritical: 0.2,
		prSizeWarning: 400,
		prSizeCritical: 1000,
		buildSuccessWarning: 90,
		buildSuccessCritical: 75,
	};

	return {
		token,
		owner,
		repo,
		sprintLengthDays,
		periodStart,
		periodEnd,
		postAs,
		issueNumber,
		auroraApiKey: auroraApiKey || undefined,
		auroraTeamId: auroraTeamId || undefined,
		workflowFilter: workflowFilter || undefined,
		deploymentEnvironment: deploymentEnvironment || undefined,
		thresholds,
	};
}

function validatePostAs(input: string): 'summary' | 'issue-comment' {
	const valid = ['summary', 'issue-comment'];
	if (valid.includes(input)) {
		return input as 'summary' | 'issue-comment';
	}
	console.warn(`Invalid post-as value: ${input}. Defaulting to 'summary'`);
	return 'summary';
}
