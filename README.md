# PR Metrics Health Card

A GitHub Action that calculates aggregate PR metrics for a configurable time period and renders them as a health card.

It measures how long PRs take to merge, how quickly reviews happen, how many PRs are in flight, and how evenly work is distributed across contributors.

## What it measures

- **PR Cycle Time** — Time from PR creation to merge (median + P90 for outlier detection)
- **Review Speed** — Median time from PR creation to first non-author review
- **Review Depth** — Average non-author comments per PR
- **Throughput** — Number of PRs merged in the period
- **WIP Pressure** — Open PRs relative to the number of active contributors in the period (not total team size)
- **Collaboration** — How evenly PRs are distributed across contributors (concentration ratio)

Metrics that exceed configurable thresholds are flagged with contextual **Quick Wins** — short coaching tips.

## Usage

Add to your repository's `.github/workflows/pr-metrics.yml`:

```yaml
name: PR Metrics
on:
  schedule:
    - cron: '0 9 * * 1'  # Every Monday at 9am
  workflow_dispatch:       # Manual trigger

jobs:
  metrics:
    runs-on: ubuntu-latest
    steps:
      - uses: aurora-coach-com/pr-metrics@v1
        with:
          sprint-length-days: 14
```

## Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `github-token` | GitHub token for API access | `${{ github.token }}` |
| `sprint-length-days` | Number of days to analyze | `14` |
| `post-as` | Where to post: `summary` or `issue-comment` | `summary` |
| `issue-number` | Issue to comment on (required if `post-as: issue-comment`) | - |

### Threshold Configuration

Adjust thresholds to match your team's context:

| Input | Description | Default |
|-------|-------------|---------|
| `cycle-time-warning-hours` | PR cycle time warning threshold | `72` (3 days) |
| `cycle-time-critical-hours` | PR cycle time critical threshold | `168` (7 days) |
| `review-warning-hours` | Review turnaround warning threshold | `24` |
| `review-critical-hours` | Review turnaround critical threshold | `48` |
| `wip-warning-ratio` | WIP per active contributor warning ratio | `2` |
| `wip-critical-ratio` | WIP per active contributor critical ratio | `3` |

### Aurora Coach Integration

An upcoming feature of this Action is integration with [Aurora Coach](https://aurora-coach.com), the AI coach for software engineering teams, where you can push these metrics to include as context for coaching, continuous improvement analysis, and recommendations.

These inputs are available but not yet active:
| Input | Description |
|-------|-------------|
| `aurora-api-key` | Aurora Coach API key (sends metrics to Aurora) |
| `aurora-team-id` | Aurora Coach team ID (required if api key is set) |

## Outputs

| Output | Description |
|--------|-------------|
| `health-card` | The generated markdown health card |
| `cycle-time-hours` | Median PR cycle time in hours |
| `throughput` | Number of PRs merged |
| `review-turnaround-hours` | Median time to first review in hours |

## Example Output

```
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
░▓███████████████████▓░
```

### 🟡 Sprint Health — Jan 20 – Feb 3

| Metric | Value |
|--------|-------|
| PR Cycle Time | 5.9 hours (P90: 10.2 days) |
| Review Speed | 5.9 hours |
| Review Depth | 1.0 comments/PR (moderate) |
| Throughput | 63 PRs |
| WIP | 64 open (overloaded) |
| Collaboration | 23 contributors (balanced) |

#### Quick Wins

- **P90 outliers** — When P90 is much higher than median, a few PRs are getting stuck. These outliers often reveal external blockers worth investigating.
- **WIP** — High WIP often means context-switching. Finishing one thing before starting the next improves flow.

## Limitations

- **WIP denominator** is the number of people who merged PRs in the period, not your full team size. Small teams or quiet sprints will skew this ratio.
- **Collaboration** measures PR authorship concentration, not code ownership. A high concentration ratio means one person authored most PRs — it does not measure knowledge distribution across code areas.
- **Cycle time trend** is not yet implemented. The trend field exists in the data model but always returns `stable`.
- **Open PR count** is used as-is from the GitHub API without deep pagination. Repositories with very large numbers of open PRs may see an approximate count.

## Development

```bash
# Install dependencies
npm install

# Run locally (create .env with GITHUB_TOKEN and GITHUB_REPOSITORY)
npm run dev

# Build for distribution
npm run build

# Type check
npm run typecheck
```

## License

MIT
