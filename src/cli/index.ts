#!/usr/bin/env node

import * as fs from 'fs';
import { execSync } from 'child_process';
import { Octokit } from '@octokit/rest';
import { collectMetrics } from '../core/metrics';
import { calculateScore } from '../core/scoring';
import { renderSvg } from '../svg/render';
import { RenderFormat } from '../core/types';

function usage(): never {
  console.error(`Usage: repopulse [owner/repo] [options]

Options:
  --format <monitor|mini|badge>   SVG format (default: monitor)
  --output <path>                 Output file (default: stdout)
  --token <token>                 GitHub token (default: GITHUB_TOKEN env or gh auth)

Examples:
  repopulse apache/airflow
  repopulse microsoft/vscode --format mini --output health.svg
  repopulse                      # detects from git remote`);
  process.exit(1);
}

function parseArgs(argv: string[]): { repo: string | null; format: RenderFormat; output: string | null; token: string | null } {
  let repo: string | null = null;
  let format: RenderFormat = 'monitor';
  let output: string | null = null;
  let token: string | null = null;

  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--format' && args[i + 1]) {
      format = args[++i] as RenderFormat;
    } else if (arg === '--output' && args[i + 1]) {
      output = args[++i];
    } else if (arg === '--token' && args[i + 1]) {
      token = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      usage();
    } else if (!arg.startsWith('-') && arg.includes('/')) {
      repo = arg;
    }
  }

  return { repo, format, output, token };
}

function detectRepo(): string | null {
  try {
    const remote = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
    const match = remote.match(/[:/]([^/]+\/[^/.]+?)(?:\.git)?$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function getToken(explicit: string | null): string {
  if (explicit) return explicit;

  const envToken = process.env.GITHUB_TOKEN;
  if (envToken) return envToken;

  try {
    return execSync('gh auth token', { encoding: 'utf-8' }).trim();
  } catch {
    console.error('Error: No GitHub token found.');
    console.error('Set GITHUB_TOKEN env, pass --token, or login with `gh auth login`.');
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const { repo: repoArg, format, output, token: tokenArg } = parseArgs(process.argv);

  const repoSlug = repoArg || detectRepo();
  if (!repoSlug) {
    console.error('Error: Could not detect repository. Pass owner/repo as argument.');
    usage();
  }

  const [owner, repo] = repoSlug.split('/');
  if (!owner || !repo) {
    console.error(`Error: Invalid repository format "${repoSlug}". Use owner/repo.`);
    process.exit(1);
  }

  const token = getToken(tokenArg);
  const octokit = new Octokit({ auth: token });

  console.error(`Collecting metrics for ${owner}/${repo}...`);
  const raw = await collectMetrics(octokit as any, owner, repo);
  const result = calculateScore(raw);

  console.error(`\nHealth: ${result.state.toUpperCase()} (${result.score}/100)`);
  console.error(`  CI Pass Rate:   ${raw.ciPassRate ?? 'N/A'}%`);
  console.error(`  PR Merge Time:  ${raw.prMergeTimeHours ?? 'N/A'}h (median)`);
  console.error(`  Releases/week:  ${raw.releasesPerWeek}`);
  console.error(`  Response Time:  ${raw.responseTimeHours ?? 'N/A'}h`);
  console.error('');

  const svg = renderSvg(format, result, owner, repo);

  if (output) {
    const dir = require('path').dirname(output);
    if (dir && dir !== '.') {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(output, svg, 'utf-8');
    console.error(`SVG written to ${output}`);
  } else {
    process.stdout.write(svg);
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message || err);
  process.exit(1);
});
