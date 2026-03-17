#!/usr/bin/env npx ts-node

/**
 * Collects health metrics from ~1000 popular GitHub repos for population analysis.
 * Outputs CSV to stdout. Progress to stderr.
 *
 * Usage: npx ts-node scripts/collect-population.ts > population.csv
 *
 * Rate limit: ~4 API calls per repo = ~4000 calls. GitHub allows 5000/hr with token.
 */

import { Octokit } from '@octokit/rest';
import { execSync } from 'child_process';

const token = process.env.GITHUB_TOKEN || execSync('gh auth token', { encoding: 'utf-8' }).trim();
const octokit = new Octokit({ auth: token, throttle: { enabled: false } });

interface RepoData {
  repo: string;
  stars: number;
  size_kb: number;
  age_days: number;
  open_issues: number;
  language: string;
  ci_pass_pct: number | null;
  ci_total: number;
  pr_merge_hours: number | null;
  pr_merged_count: number;
  releases_per_week: number;
  release_count_90d: number;
  has_actions: boolean;
}

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function hoursBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 3600000;
}

async function fetchRepos(page: number, perPage: number, minStars: number, maxStars: number): Promise<any[]> {
  try {
    const { data } = await octokit.rest.search.repos({
      q: `stars:${minStars}..${maxStars} is:public archived:false`,
      sort: 'stars',
      order: 'desc',
      per_page: perPage,
      page,
    });
    return data.items || [];
  } catch (e: any) {
    process.stderr.write(`  Search error: ${e.message}\n`);
    return [];
  }
}

async function collectMetrics(owner: string, repo: string): Promise<Partial<RepoData>> {
  const result: Partial<RepoData> = {
    ci_pass_pct: null,
    ci_total: 0,
    pr_merge_hours: null,
    pr_merged_count: 0,
    releases_per_week: 0,
    release_count_90d: 0,
    has_actions: false,
  };

  // CI pass rate
  try {
    const { data } = await octokit.rest.actions.listWorkflowRunsForRepo({
      owner, repo, per_page: 20, status: 'completed' as any,
    });
    const runs = data.workflow_runs || [];
    result.ci_total = runs.length;
    result.has_actions = runs.length > 0;
    if (runs.length > 0) {
      const success = runs.filter((r: any) => r.conclusion === 'success').length;
      result.ci_pass_pct = Math.round((success / runs.length) * 100);
    }
  } catch { /* no actions */ }

  // PR merge time
  try {
    const { data } = await octokit.rest.pulls.list({
      owner, repo, state: 'closed', sort: 'updated', direction: 'desc', per_page: 20,
    });
    const merged = data.filter((pr: any) => pr.merged_at);
    result.pr_merged_count = merged.length;
    if (merged.length > 0) {
      const times = merged.map((pr: any) => hoursBetween(pr.created_at, pr.merged_at));
      result.pr_merge_hours = Math.round((median(times) ?? 0) * 10) / 10;
    }
  } catch { /* no PRs */ }

  // Releases
  try {
    const { data } = await octokit.rest.repos.listReleases({ owner, repo, per_page: 20 });
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
    const recent = data.filter((r: any) => r.published_at && r.published_at >= ninetyDaysAgo);
    result.release_count_90d = recent.length;
    result.releases_per_week = Math.round((recent.length / (90 / 7)) * 100) / 100;
  } catch { /* no releases */ }

  return result;
}

async function main() {
  // Fetch repos in star ranges to get a diverse sample
  const starRanges = [
    // Top tier: 50k+ stars (fewer repos, all famous)
    { min: 100000, max: 500000, pages: 5 },  // ~50 repos
    { min: 50000, max: 100000, pages: 5 },    // ~50 repos
    // Upper mid: 10k-50k (bulk of well-known projects)
    { min: 30000, max: 50000, pages: 5 },     // ~50 repos
    { min: 20000, max: 30000, pages: 5 },     // ~50 repos
    { min: 15000, max: 20000, pages: 5 },     // ~50 repos
    { min: 10000, max: 15000, pages: 10 },    // ~100 repos
    // Mid tier: 5k-10k (solid established projects)
    { min: 7500, max: 10000, pages: 10 },     // ~100 repos
    { min: 5000, max: 7500, pages: 10 },      // ~100 repos
    // Lower mid: 2k-5k (healthy smaller projects)
    { min: 3500, max: 5000, pages: 10 },      // ~100 repos
    { min: 2000, max: 3500, pages: 10 },      // ~100 repos
    // Smaller: 1k-2k (many libs and tools)
    { min: 1500, max: 2000, pages: 10 },      // ~100 repos
    { min: 1000, max: 1500, pages: 10 },      // ~100 repos
  ];

  // Collect repo list
  const allRepos: any[] = [];
  const seen = new Set<string>();

  for (const range of starRanges) {
    for (let page = 1; page <= range.pages; page++) {
      const repos = await fetchRepos(page, 10, range.min, range.max);
      for (const r of repos) {
        if (!seen.has(r.full_name)) {
          seen.add(r.full_name);
          allRepos.push(r);
        }
      }
      // Small delay to avoid secondary rate limits
      await new Promise(r => setTimeout(r, 200));
    }
    process.stderr.write(`Collected ${allRepos.length} repos (stars ${range.min}-${range.max})\n`);
  }

  process.stderr.write(`\nTotal repos: ${allRepos.length}. Collecting metrics...\n\n`);

  // CSV header
  console.log('repo,stars,size_kb,age_days,open_issues,language,ci_pass_pct,ci_total,pr_merge_hours,pr_merged_count,releases_per_week,release_count_90d,has_actions');

  let done = 0;
  let errors = 0;

  for (const r of allRepos) {
    const [owner, repo] = r.full_name.split('/');
    const ageDays = Math.round((Date.now() - new Date(r.created_at).getTime()) / 86400000);

    try {
      const metrics = await collectMetrics(owner, repo);

      console.log([
        r.full_name,
        r.stargazers_count,
        r.size,
        ageDays,
        r.open_issues_count,
        r.language || 'unknown',
        metrics.ci_pass_pct ?? '',
        metrics.ci_total,
        metrics.pr_merge_hours ?? '',
        metrics.pr_merged_count,
        metrics.releases_per_week,
        metrics.release_count_90d,
        metrics.has_actions ? 1 : 0,
      ].join(','));
    } catch (e: any) {
      errors++;
      process.stderr.write(`  Error on ${r.full_name}: ${e.message}\n`);
    }

    done++;
    if (done % 25 === 0) {
      process.stderr.write(`  Progress: ${done}/${allRepos.length} (${errors} errors)\n`);

      // Check rate limit
      try {
        const { data: rl } = await octokit.rest.rateLimit.get();
        const remaining = rl.rate.remaining;
        const resetAt = new Date(rl.rate.reset * 1000);
        process.stderr.write(`  Rate limit: ${remaining} remaining, resets at ${resetAt.toISOString()}\n`);

        if (remaining < 200) {
          const waitMs = (rl.rate.reset * 1000) - Date.now() + 5000;
          process.stderr.write(`  Rate limit low! Waiting ${Math.round(waitMs / 1000)}s...\n`);
          await new Promise(r => setTimeout(r, waitMs));
        }
      } catch {}
    }

    // Throttle: ~150ms between repos to stay well under secondary limits
    await new Promise(r => setTimeout(r, 150));
  }

  process.stderr.write(`\nDone. ${done} repos processed, ${errors} errors.\n`);
}

main().catch(e => { process.stderr.write(`Fatal: ${e.message}\n`); process.exit(1); });
