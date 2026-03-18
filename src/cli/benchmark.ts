#!/usr/bin/env node

/**
 * Generates reference "normal patient" SVGs for each cohort.
 * Values are population medians (p50), not ideals.
 *
 * Usage: node dist-benchmark/index.js --output-dir generated
 */

import * as fs from 'fs';
import { HealthResult, MetricScores, RawMetrics } from '../core/types';
import { renderSvg } from '../svg/render';
import { calculateScore } from '../core/scoring';

interface CohortRef {
  name: string;
  slug: string;
  sizeKb: number;
  ci: number;
  prHours: number;
  relPerWeek: number;
  responseHours: number;
}

// All values are p50 (median) from the 286-repo population analysis.
// Response time uses the overall population median (2.4h) since it's
// not segmented by cohort.
const cohorts: CohortRef[] = [
  {
    name: 'Tiny Repo (<10MB)',
    slug: 'reference-tiny',
    sizeKb: 5000,
    ci: 55,
    prHours: 84,
    relPerWeek: 0,
    responseHours: 2.4,
  },
  {
    name: 'Medium Repo (10-100MB)',
    slug: 'reference-medium',
    sizeKb: 50000,
    ci: 80,
    prHours: 21,
    relPerWeek: 0,
    responseHours: 2.4,
  },
  {
    name: 'Big Repo (100-500MB)',
    slug: 'reference-big',
    sizeKb: 250000,
    ci: 80,
    prHours: 17,
    relPerWeek: 0.31,
    responseHours: 2.4,
  },
  {
    name: 'Huge Repo (500MB+)',
    slug: 'reference-huge',
    sizeKb: 800000,
    ci: 70,
    prHours: 18,
    relPerWeek: 0.31,
    responseHours: 2.4,
  },
];

// Overall population median as the main reference
const overall: CohortRef = {
  name: 'Population Median',
  slug: 'reference-population-median',
  sizeKb: 32000,
  ci: 75,        // p50 from 286 repos
  prHours: 27,   // p50
  relPerWeek: 0, // p50 (55% of repos don't use releases)
  responseHours: 2.4, // p50
};

function buildRaw(ref: CohortRef): RawMetrics {
  return {
    ciPassRate: ref.ci,
    ciTotalRuns: 20,
    prMergeTimeHours: ref.prHours,
    prMergedCount: 15,
    lastPrMergedDate: new Date().toISOString(),
    releasesPerWeek: ref.relPerWeek,
    releaseCount: ref.relPerWeek > 0 ? Math.round(ref.relPerWeek * 13) : 0,
    releasePeriodDays: 90,
    responseTimeHours: ref.responseHours,
    responseIsBotOnly: false,
    lastReleaseDate: ref.relPerWeek > 0 ? new Date().toISOString() : null,
    sizeKb: ref.sizeKb,
  };
}

function main() {
  const args = process.argv.slice(2);
  let outputDir = 'generated';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output-dir' && args[i + 1]) outputDir = args[++i];
  }

  const all = [overall, ...cohorts];
  const formats = ['monitor', 'mini', 'badge'] as const;

  for (const ref of all) {
    const raw = buildRaw(ref);
    const result = calculateScore(raw);

    console.error(`${ref.name} (${ref.slug}):`);
    console.error(`  Score: ${result.score}/100 (${result.state.toUpperCase()})`);
    console.error(`  CI: ${ref.ci}%  PR: ${ref.prHours}h  Rel: ${ref.relPerWeek}/wk  Resp: ${ref.responseHours}h`);
    console.error('');

    for (const format of formats) {
      const dir = `${outputDir}/${format}`;
      fs.mkdirSync(dir, { recursive: true });
      const [owner, repo] = ['reference', ref.slug.replace('reference-', '')];
      const svg = renderSvg(format, result, owner, repo);
      const path = `${dir}/${ref.slug}.svg`;
      fs.writeFileSync(path, svg, 'utf-8');
    }
  }

  console.error('Done.');
}

main();
