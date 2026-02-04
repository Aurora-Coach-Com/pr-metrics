/**
 * Sprint Health Action - Entry Point
 *
 * Calculates sprint health metrics from GitHub PR activity and generates
 * a markdown health card.
 *
 * Can run:
 * 1. As GitHub Action (uses @actions/core for inputs/outputs)
 * 2. Standalone via ts-node (uses environment variables)
 */

import * as fs from 'fs';
import * as path from 'path';
import { run } from './action';

// Detect if running as GitHub Action or standalone
const isGitHubAction = !!process.env.GITHUB_ACTIONS;

if (isGitHubAction) {
	// Running as GitHub Action
	run().catch((error) => {
		console.error('Action failed:', error);
		process.exit(1);
	});
} else {
	// Running standalone (dev mode) - load .env file
	const envPath = path.join(process.cwd(), '.env');
	if (fs.existsSync(envPath)) {
		const envContent = fs.readFileSync(envPath, 'utf-8');
		for (const line of envContent.split('\n')) {
			const trimmed = line.trim();
			if (trimmed && !trimmed.startsWith('#')) {
				const [key, ...valueParts] = trimmed.split('=');
				const value = valueParts.join('=');
				if (key && value && !process.env[key]) {
					process.env[key] = value;
				}
			}
		}
	}

	console.log('🔧 Running in development mode\n');

	// Validate required env vars
	if (!process.env.GITHUB_TOKEN) {
		console.error('❌ GITHUB_TOKEN environment variable required');
		console.error('   Get one at: https://github.com/settings/tokens');
		process.exit(1);
	}

	if (!process.env.GITHUB_REPOSITORY) {
		console.error('❌ GITHUB_REPOSITORY environment variable required');
		console.error('   Format: owner/repo (e.g., octocat/hello-world)');
		process.exit(1);
	}

	run()
		.then(() => {
			console.log('\n✅ Done');
		})
		.catch((error) => {
			console.error('\n❌ Failed:', error.message);
			process.exit(1);
		});
}
