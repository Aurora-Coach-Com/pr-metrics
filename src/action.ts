/**
 * Main action logic
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { getConfig, Config } from './config';
import { GitHubClient } from './github-client';
import { calculateMetrics, SprintMetrics } from './metrics';
import { renderHealthCard, AURORA_LOGO } from './card';

export async function run(): Promise<void> {
	const config = getConfig();

	console.log(`📊 Sprint Health Card`);
	console.log(`   Repository: ${config.owner}/${config.repo}`);
	console.log(`   Sprint length: ${config.sprintLengthDays} days`);
	console.log(`   Period: ${config.periodStart.toISOString().split('T')[0]} to ${config.periodEnd.toISOString().split('T')[0]}`);
	console.log('');

	// Initialize GitHub client
	const client = new GitHubClient(config.token, config.owner, config.repo);

	// Fetch PR data
	console.log('📥 Fetching pull request data...');
	const pullRequests = await client.getMergedPRs(config.periodStart, config.periodEnd);
	console.log(`   Found ${pullRequests.length} merged PRs in period`);

	if (pullRequests.length === 0) {
		console.log('⚠️  No merged PRs found in this period');
		const emptyCard = renderEmptyCard(config);
		outputResults(config, emptyCard, null);
		return;
	}

	// Fetch review data for each PR
	console.log('📥 Fetching review data...');
	const reviews = await client.getReviewsForPRs(pullRequests.map((pr) => pr.number));

	// Fetch open PRs for WIP calculation
	console.log('📥 Fetching open PRs for WIP...');
	const openPRs = await client.getOpenPRs();

	// Calculate metrics
	console.log('🧮 Calculating metrics...');
	const metrics = calculateMetrics(pullRequests, reviews, openPRs);

	// Render health card
	const healthCard = renderHealthCard(config, metrics, config.thresholds);

	// Output results
	outputResults(config, healthCard, metrics);

	// Post the card if configured
	await postHealthCard(config, client, healthCard);

	// Push to Aurora if configured
	if (config.auroraApiKey && config.auroraTeamId) {
		await pushToAurora(config, metrics);
	}
}

function renderEmptyCard(config: Config): string {
	return `
\`\`\`text
${AURORA_LOGO}
\`\`\`

## 📊 Sprint Health — ${formatDateRange(config.periodStart, config.periodEnd)}

No pull requests merged during this period.

---
*Powered by [Aurora Coach](https://aurora-coach.com) — The AI Coach for Software Engineering Teams*
`.trim();
}

function formatDateRange(start: Date, end: Date): string {
	const formatDate = (d: Date) =>
		d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	return `${formatDate(start)} – ${formatDate(end)}`;
}

function outputResults(config: Config, healthCard: string, metrics: SprintMetrics | null): void {
	// Always log the card to console
	console.log('\n' + '='.repeat(60));
	console.log(healthCard);
	console.log('='.repeat(60) + '\n');

	// Set GitHub Action outputs if running as action
	if (process.env.GITHUB_ACTIONS) {
		core.setOutput('health-card', healthCard);
		if (metrics) {
			core.setOutput('cycle-time-hours', metrics.cycleTimeMedianHours.toFixed(1));
			core.setOutput('throughput', metrics.throughputCount);
			core.setOutput('review-turnaround-hours', metrics.reviewTurnaroundMedianHours.toFixed(1));
		}
	}
}

async function postHealthCard(config: Config, client: GitHubClient, healthCard: string): Promise<void> {
	if (config.postAs === 'summary') {
		// Job summary (default) - only works in GitHub Actions
		if (process.env.GITHUB_ACTIONS) {
			core.summary.addRaw(healthCard).write();
			console.log('✅ Posted to job summary');
		} else {
			console.log('ℹ️  Job summary only available in GitHub Actions');
		}
	} else if (config.postAs === 'issue-comment' && config.issueNumber) {
		await client.postIssueComment(config.issueNumber, healthCard);
		console.log(`✅ Posted to issue #${config.issueNumber}`);
	}
}

async function pushToAurora(config: Config, metrics: SprintMetrics): Promise<void> {
	if (!config.auroraApiKey || !config.auroraTeamId) {
		return;
	}

	console.log('📤 Pushing metrics to Aurora Coach...');

	const url = `https://app.aurora-coach.com/api/teams/${config.auroraTeamId}/metrics`;

	const payload = {
		source: 'github',
		periodStart: config.periodStart.toISOString().split('T')[0],
		periodEnd: config.periodEnd.toISOString().split('T')[0],
		delivery: {
			cycleTimeMedianHours: metrics.cycleTimeMedianHours,
			cycleTimeP90Hours: metrics.cycleTimeP90Hours,
			throughputCount: metrics.throughputCount,
			wipCount: metrics.wipCount,
		},
		collaboration: {
			reviewTurnaroundHours: metrics.reviewTurnaroundMedianHours,
			collaboratorCount: metrics.collaboratorCount,
			concentrationRatio: metrics.concentrationRatio,
		},
		raw: {
			repoName: `${config.owner}/${config.repo}`,
			prNumbers: metrics.prNumbers,
		},
	};

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 15000);

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${config.auroraApiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload),
			signal: controller.signal,
		});

		clearTimeout(timeout);

		if (response.ok) {
			console.log('✅ Metrics pushed to Aurora Coach');
		} else {
			const errorText = await response.text();
			console.warn(`⚠️  Failed to push to Aurora: ${response.status} ${errorText}`);
		}
	} catch (error) {
		console.warn(`⚠️  Failed to push to Aurora: ${error}`);
	}
}
