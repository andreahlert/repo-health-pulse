#!/usr/bin/env npx ts-node

/**
 * Reads population.csv and generates:
 * 1. data/repos.json - structured data for the GitHub Pages site
 * 2. docs/mini/*.svg - mini SVGs for each repo (for the mosaic)
 *
 * Usage: npx ts-node scripts/generate-site-data.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { Octokit } from '@octokit/rest';
import { execSync } from 'child_process';
import { calculateScore } from '../src/core/scoring';
import { renderSvg } from '../src/svg/render';
import { RawMetrics } from '../src/core/types';

interface CsvRow {
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

function parseCsv(filePath: string): CsvRow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');

  return lines.slice(1).map(line => {
    const vals = line.split(',');
    return {
      repo: vals[0],
      stars: parseInt(vals[1]) || 0,
      size_kb: parseInt(vals[2]) || 0,
      age_days: parseInt(vals[3]) || 0,
      open_issues: parseInt(vals[4]) || 0,
      language: vals[5] || 'unknown',
      ci_pass_pct: vals[6] ? parseFloat(vals[6]) : null,
      ci_total: parseInt(vals[7]) || 0,
      pr_merge_hours: vals[8] ? parseFloat(vals[8]) : null,
      pr_merged_count: parseInt(vals[9]) || 0,
      releases_per_week: parseFloat(vals[10]) || 0,
      release_count_90d: parseInt(vals[11]) || 0,
      has_actions: vals[12]?.trim() === '1',
    };
  }).filter(r => r.repo && r.stars > 0);
}

function csvToRawMetrics(row: CsvRow): RawMetrics {
  return {
    ciPassRate: row.ci_pass_pct,
    ciTotalRuns: row.ci_total,
    prMergeTimeHours: row.pr_merge_hours,
    prMergedCount: row.pr_merged_count,
    releasesPerWeek: row.releases_per_week,
    releaseCount: row.release_count_90d,
    releasePeriodDays: 90,
    responseTimeHours: null, // not collected in bulk
    responseIsBotOnly: false,
    lastReleaseDate: row.release_count_90d > 0 ? new Date().toISOString() : null,
    lastPrMergedDate: row.pr_merged_count > 0 ? new Date().toISOString() : null,
    sizeKb: row.size_kb,
  };
}

function main() {
  const csvPath = 'data/population.csv';
  if (!fs.existsSync(csvPath)) {
    console.error('Error: data/population.csv not found. Run collect-population.ts first.');
    process.exit(1);
  }

  const rows = parseCsv(csvPath);
  console.error(`Loaded ${rows.length} repos from CSV`);

  // Filter active repos
  const active = rows.filter(r => r.has_actions || r.pr_merged_count > 0 || r.release_count_90d > 0);
  console.error(`Active repos: ${active.length}`);

  // Generate scores and SVGs
  const docsDir = 'docs/mini';
  fs.mkdirSync(docsDir, { recursive: true });
  fs.mkdirSync('data', { recursive: true });

  const repoData: any[] = [];
  let generated = 0;

  for (const row of active) {
    const [owner, repo] = row.repo.split('/');
    if (!owner || !repo) continue;

    const raw = csvToRawMetrics(row);
    const result = calculateScore(raw);

    // Generate mini SVG
    const slug = row.repo.replace('/', '-');
    try {
      const svg = renderSvg('mini', result, owner, repo);
      fs.writeFileSync(`${docsDir}/${slug}.svg`, svg, 'utf-8');
    } catch (e: any) {
      console.error(`  SVG error for ${row.repo}: ${e.message}`);
    }

    repoData.push({
      repo: row.repo,
      slug,
      score: result.score,
      state: result.state,
      bpm: result.bpm,
      ci: row.ci_pass_pct,
      pr_hours: row.pr_merge_hours,
      pr_count: row.pr_merged_count,
      releases_per_week: row.releases_per_week,
      releases_90d: row.release_count_90d,
      response_hours: null,
      stars: row.stars,
      size_kb: row.size_kb,
      age_days: row.age_days,
      language: row.language,
      open_issues: row.open_issues,
    });

    generated++;
    if (generated % 50 === 0) {
      console.error(`  Generated ${generated}/${active.length}`);
    }
  }

  // Write JSON
  fs.writeFileSync('data/repos.json', JSON.stringify(repoData, null, 2));
  console.error(`\nDone. ${generated} repos processed.`);
  console.error(`  data/repos.json: ${repoData.length} entries`);
  console.error(`  docs/mini/: ${generated} SVGs`);

  // Stats
  const states: Record<string, number> = {};
  for (const r of repoData) {
    states[r.state] = (states[r.state] || 0) + 1;
  }
  console.error(`\nDistribution:`);
  for (const [state, count] of Object.entries(states).sort((a, b) => b[1] - a[1])) {
    console.error(`  ${state}: ${count} (${Math.round(100 * count / repoData.length)}%)`);
  }
}

main();
