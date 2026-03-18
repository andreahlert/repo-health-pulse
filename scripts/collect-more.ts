#!/usr/bin/env npx ts-node

/**
 * Collects more repos to reach ~1000 total.
 * Handles Search API rate limit (30 req/min) with retry/wait.
 * Appends to existing population.csv (skips already collected repos).
 */

import * as fs from 'fs';
import { execSync } from 'child_process';
import { Octokit } from '@octokit/rest';

const token = process.env.GITHUB_TOKEN || execSync('gh auth token', { encoding: 'utf-8' }).trim();
const octokit = new Octokit({ auth: token });

// Load existing repos to skip
const existing = new Set<string>();
if (fs.existsSync('data/population.csv')) {
  const lines = fs.readFileSync('data/population.csv', 'utf-8').split('\n');
  for (const line of lines.slice(1)) {
    const repo = line.split(',')[0];
    if (repo) existing.add(repo);
  }
}
process.stderr.write(`Already have ${existing.size} repos. Collecting more...\n\n`);

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function hoursBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 3600000;
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function searchRepos(query: string, page: number): Promise<any[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data } = await octokit.rest.search.repos({
        q: query,
        sort: 'stars',
        order: 'desc',
        per_page: 30,
        page,
      });
      return data.items || [];
    } catch (e: any) {
      if (e.status === 403 && e.message?.includes('rate limit')) {
        const waitSec = 65; // Search rate limit resets every 60s
        process.stderr.write(`  Search rate limit hit. Waiting ${waitSec}s...\n`);
        await sleep(waitSec * 1000);
        continue;
      }
      process.stderr.write(`  Search error: ${e.message}\n`);
      return [];
    }
  }
  return [];
}

async function collectMetrics(owner: string, repo: string) {
  let ci_pass: string = '';
  let ci_total = 0;
  let pr_hours: string = '';
  let pr_count = 0;
  let rel_wk = 0;
  let rel_count = 0;
  let has_actions = 0;

  // CI
  try {
    const { data } = await octokit.rest.actions.listWorkflowRunsForRepo({
      owner, repo, per_page: 20, status: 'completed' as any,
    });
    const runs = (data.workflow_runs || []).filter((r: any) =>
      r.conclusion === 'success' || r.conclusion === 'failure'
    );
    ci_total = runs.length;
    has_actions = runs.length > 0 ? 1 : 0;
    if (runs.length > 0) {
      const success = runs.filter((r: any) => r.conclusion === 'success').length;
      ci_pass = String(Math.round((success / runs.length) * 100));
    }
  } catch {}

  // PRs
  try {
    const { data } = await octokit.rest.pulls.list({
      owner, repo, state: 'closed', sort: 'updated', direction: 'desc', per_page: 20,
    });
    const merged = data.filter((pr: any) => pr.merged_at);
    pr_count = merged.length;
    if (merged.length > 0) {
      const times = merged.map((pr: any) => hoursBetween(pr.created_at, pr.merged_at));
      pr_hours = String(Math.round((median(times) ?? 0) * 10) / 10);
    }
  } catch {}

  // Releases
  try {
    const { data } = await octokit.rest.repos.listReleases({ owner, repo, per_page: 20 });
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
    const recent = data.filter((r: any) => r.published_at && r.published_at >= ninetyDaysAgo);
    rel_count = recent.length;
    rel_wk = Math.round((recent.length / (90 / 7)) * 100) / 100;
  } catch {}

  return { ci_pass, ci_total, pr_hours, pr_count, rel_wk, rel_count, has_actions };
}

async function main() {
  // Star ranges to fill the gaps (focus on ranges we didn't collect yet)
  const ranges = [
    // Ranges that hit rate limit before
    { min: 10000, max: 15000, pages: 15 },
    { min: 7500, max: 10000, pages: 15 },
    { min: 5000, max: 7500, pages: 15 },
    { min: 3500, max: 5000, pages: 15 },
    { min: 2000, max: 3500, pages: 15 },
    { min: 1500, max: 2000, pages: 10 },
    { min: 1000, max: 1500, pages: 10 },
  ];

  const newRepos: any[] = [];

  for (const range of ranges) {
    for (let page = 1; page <= range.pages; page++) {
      const repos = await searchRepos(
        `stars:${range.min}..${range.max} is:public archived:false`,
        page
      );
      for (const r of repos) {
        if (!existing.has(r.full_name)) {
          existing.add(r.full_name);
          newRepos.push(r);
        }
      }
      await sleep(2200); // Stay under 30 req/min for search
    }
    process.stderr.write(`Collected ${newRepos.length} new repos (stars ${range.min}-${range.max})\n`);
  }

  process.stderr.write(`\nTotal new repos: ${newRepos.length}. Collecting metrics...\n\n`);

  // Append to CSV
  const csvStream = fs.createWriteStream('data/population.csv', { flags: 'a' });
  let done = 0;

  for (const r of newRepos) {
    const [owner, repo] = r.full_name.split('/');
    const ageDays = Math.round((Date.now() - new Date(r.created_at).getTime()) / 86400000);

    try {
      const m = await collectMetrics(owner, repo);
      csvStream.write([
        r.full_name, r.stargazers_count, r.size, ageDays,
        r.open_issues_count, r.language || 'unknown',
        m.ci_pass, m.ci_total, m.pr_hours, m.pr_count,
        m.rel_wk, m.rel_count, m.has_actions
      ].join(',') + '\n');
    } catch (e: any) {
      process.stderr.write(`  Error: ${r.full_name}: ${e.message}\n`);
    }

    done++;
    if (done % 50 === 0) {
      process.stderr.write(`  Progress: ${done}/${newRepos.length}\n`);
      // Check rate limit
      try {
        const { data: rl } = await octokit.rest.rateLimit.get();
        process.stderr.write(`  Rate limit: ${rl.rate.remaining} remaining\n`);
        if (rl.rate.remaining < 200) {
          const waitMs = (rl.rate.reset * 1000) - Date.now() + 5000;
          process.stderr.write(`  Low! Waiting ${Math.round(waitMs / 1000)}s\n`);
          await sleep(waitMs);
        }
      } catch {}
    }
    await sleep(150);
  }

  csvStream.end();
  process.stderr.write(`\nDone. Added ${done} repos to population.csv\n`);
  process.stderr.write(`Total: ${existing.size} repos\n`);
}

main().catch(e => { process.stderr.write(`Fatal: ${e.message}\n`); process.exit(1); });
