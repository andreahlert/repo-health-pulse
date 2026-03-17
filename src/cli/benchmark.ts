#!/usr/bin/env node

/**
 * Generates a "perfect patient" reference SVG for comparison.
 * Usage: node dist-cli/benchmark.js --output generated/monitor/reference.svg
 */

import * as fs from 'fs';
import { HealthResult, MetricScores, RawMetrics } from '../core/types';
import { renderSvg } from '../svg/render';
import { buildSvgData } from '../svg/render';

const perfectMetrics: MetricScores = {
  ci: 95,
  pr: 90,
  releases: 90,
  response: 100,
};

const perfectRaw: RawMetrics = {
  ciPassRate: 98,
  ciTotalRuns: 30,
  prMergeTimeHours: 3.2,
  prMergedCount: 25,
  releasesPerWeek: 1.1,
  releaseCount: 14,
  releasePeriodDays: 90,
  responseTimeHours: 0.8,
  responseIsBotOnly: false,
  lastReleaseDate: new Date().toISOString(),
};

const perfectResult: HealthResult = {
  score: 94,
  state: 'healthy',
  bpm: '68',
  metrics: perfectMetrics,
  raw: perfectRaw,
};

function main() {
  const args = process.argv.slice(2);
  let outputDir = 'generated';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output-dir' && args[i + 1]) outputDir = args[++i];
  }

  const formats = ['monitor', 'mini', 'badge'] as const;
  const subdirs: Record<string, string> = { monitor: 'monitor', mini: 'mini', badge: 'badge' };

  for (const format of formats) {
    const dir = `${outputDir}/${subdirs[format]}`;
    fs.mkdirSync(dir, { recursive: true });
    const svg = renderSvg(format, perfectResult, 'reference', 'perfect-repo');
    const path = `${dir}/reference-perfect-repo.svg`;
    fs.writeFileSync(path, svg, 'utf-8');
    console.error(`Written: ${path}`);
  }

  console.error(`\nReference "perfect patient":`);
  console.error(`  Score:         94/100 (HEALTHY)`);
  console.error(`  CI Pass Rate:  98%`);
  console.error(`  PR Merge Time: 3.2h`);
  console.error(`  Releases:      1.1/wk`);
  console.error(`  Response Time: 0.8h`);
  console.error(`  BPM:           68 (resting, efficient)`);
}

main();
