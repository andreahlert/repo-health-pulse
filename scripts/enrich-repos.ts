#!/usr/bin/env npx ts-node

/**
 * Enriches repos.json with extra fields from GitHub API:
 * - description, topics, forks, license, contributors estimate
 * - languages breakdown (top 3)
 *
 * Reads data/repos.json, adds fields, writes data/repos-enriched.json
 */

import * as fs from 'fs';
import { execSync } from 'child_process';
import { Octokit } from '@octokit/rest';

const token = process.env.GITHUB_TOKEN || execSync('gh auth token', { encoding: 'utf-8' }).trim();
const octokit = new Octokit({ auth: token });

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function enrichRepo(owner: string, repo: string): Promise<any> {
  const extra: any = {};

  // 1. Repo info (description, topics, forks, license)
  try {
    const { data } = await octokit.rest.repos.get({ owner, repo });
    extra.description = data.description || '';
    extra.topics = data.topics || [];
    extra.forks = data.forks_count;
    extra.license = data.license?.spdx_id || null;
    extra.has_discussions = data.has_discussions;
    extra.default_branch = data.default_branch;
  } catch { }

  // 2. Languages breakdown
  try {
    const { data } = await octokit.rest.repos.listLanguages({ owner, repo });
    const total = Object.values(data).reduce((a: number, b: any) => a + b, 0) as number;
    if (total > 0) {
      const sorted = Object.entries(data)
        .sort((a: any, b: any) => b[1] - a[1])
        .slice(0, 5)
        .map(([lang, bytes]: any) => ({
          lang,
          pct: Math.round((bytes / total) * 100),
        }));
      extra.languages = sorted;
    }
  } catch { }

  return extra;
}

async function main() {
  const repos = JSON.parse(fs.readFileSync('data/repos.json', 'utf-8'));
  process.stderr.write(`Enriching ${repos.length} repos...\n`);

  let done = 0;
  for (const repo of repos) {
    const [owner, name] = repo.repo.split('/');
    if (!owner || !name) continue;

    try {
      const extra = await enrichRepo(owner, name);
      Object.assign(repo, extra);
    } catch (e: any) {
      process.stderr.write(`  Error: ${repo.repo}: ${e.message}\n`);
    }

    done++;
    if (done % 50 === 0) {
      process.stderr.write(`  ${done}/${repos.length}\n`);
      try {
        const { data: rl } = await octokit.rest.rateLimit.get();
        process.stderr.write(`  Rate limit: ${rl.rate.remaining}\n`);
        if (rl.rate.remaining < 200) {
          const wait = (rl.rate.reset * 1000) - Date.now() + 5000;
          process.stderr.write(`  Low! Waiting ${Math.round(wait / 1000)}s\n`);
          await sleep(wait);
        }
      } catch { }
    }
    await sleep(100);
  }

  fs.writeFileSync('data/repos.json', JSON.stringify(repos, null, 2));
  fs.copyFileSync('data/repos.json', 'docs/repos.json');

  // Stats
  const withDesc = repos.filter((r: any) => r.description).length;
  const withLangs = repos.filter((r: any) => r.languages?.length > 0).length;
  const withTopics = repos.filter((r: any) => r.topics?.length > 0).length;
  process.stderr.write(`\nDone. ${done} repos enriched.\n`);
  process.stderr.write(`  With description: ${withDesc}\n`);
  process.stderr.write(`  With languages: ${withLangs}\n`);
  process.stderr.write(`  With topics: ${withTopics}\n`);
}

main().catch(e => { process.stderr.write(`Fatal: ${e.message}\n`); process.exit(1); });
