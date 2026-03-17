import { RawMetrics, MetricScores, HealthResult, HealthState } from './types';

// ---------------------------------------------------------------------------
// Population-based cohort scoring
//
// Instead of absolute thresholds, scores are derived from percentile rank
// within a population of 286 active GitHub repos. Each metric maps the raw
// value to an approximate percentile (0-100) using linear interpolation
// between known population percentile anchors.
//
// Score bands:
//   90+  = top 10% of population  -> healthy
//   70-89 = top 25%               -> healthy
//   50-69 = average (p25-p75)     -> stressed
//   30-49 = bottom 25%            -> critical
//   <30   = bottom 10%            -> flatline
// ---------------------------------------------------------------------------

// --- Cohort definitions (by repo disk size) --------------------------------

type SizeCohort = 'tiny' | 'medium' | 'big' | 'huge';

interface CohortPercentiles {
  // Each array: [p10, p25, p50, p75, p90]
  ci: [number, number, number, number, number];
  pr: [number, number, number, number, number]; // hours (lower is better)
  rel: [number, number, number, number, number];
}

const OVERALL: CohortPercentiles = {
  ci:  [20, 35, 75, 95, 100],
  pr:  [3, 7, 26.7, 118.9, 1104.6],
  rel: [0, 0, 0, 0.3, 1.0],
};

const COHORTS: Record<SizeCohort, CohortPercentiles> = {
  tiny: {
    ci:  [15, 30, 55, 85, 98],
    pr:  [5, 20, 84, 200, 1200],
    rel: [0, 0, 0, 0.1, 0.5],
  },
  medium: {
    ci:  [25, 40, 80, 95, 100],
    pr:  [3, 7, 20.9, 100, 800],
    rel: [0, 0, 0, 0.2, 0.8],
  },
  big: {
    ci:  [30, 45, 80, 95, 100],
    pr:  [2, 5, 17.2, 80, 600],
    rel: [0, 0, 0.31, 0.8, 2.0],
  },
  huge: {
    ci:  [25, 40, 70, 90, 98],
    pr:  [2, 5, 17.7, 80, 500],
    rel: [0, 0, 0.31, 0.8, 2.0],
  },
};

function detectCohort(sizeKb: number): SizeCohort {
  const mb = sizeKb / 1024;
  if (mb < 10) return 'tiny';
  if (mb < 100) return 'medium';
  if (mb < 500) return 'big';
  return 'huge';
}

// --- Percentile interpolation ----------------------------------------------

// Known percentile anchor points (the x-axis of the CDF)
const PCTL_ANCHORS = [10, 25, 50, 75, 90];

/**
 * Given a raw value and population percentile anchors, return the approximate
 * percentile score (0-100). Uses linear interpolation between anchors.
 *
 * `higherIsBetter`: when true (CI pass rate, releases), higher raw values
 * yield higher scores. When false (PR merge time), lower raw values are better.
 */
function percentileScore(
  value: number,
  anchors: [number, number, number, number, number],
  higherIsBetter: boolean,
): number {
  const vals = higherIsBetter ? anchors : [...anchors].reverse();
  const pcts = higherIsBetter ? PCTL_ANCHORS : [...PCTL_ANCHORS].reverse();

  // Below or equal to worst anchor
  if (higherIsBetter && value <= vals[0]) return pcts[0] * (value / Math.max(vals[0], 1));
  if (!higherIsBetter && value >= vals[0]) {
    // For inverted metrics, values worse than p10 get score approaching 0
    const ratio = vals[0] / Math.max(value, 0.01);
    return Math.max(pcts[0] * ratio, 2);
  }

  // Above or equal to best anchor
  if (higherIsBetter && value >= vals[vals.length - 1]) {
    return 95 + 5 * Math.min((value - vals[vals.length - 1]) / Math.max(vals[vals.length - 1], 1), 1);
  }
  if (!higherIsBetter && value <= vals[vals.length - 1]) {
    const best = vals[vals.length - 1];
    if (best <= 0) return 98;
    const ratio = Math.max(1 - value / best, 0);
    return 95 + 5 * ratio;
  }

  // Interpolate between anchors
  for (let i = 0; i < vals.length - 1; i++) {
    const lo = vals[i];
    const hi = vals[i + 1];
    if (
      (higherIsBetter && value >= lo && value <= hi) ||
      (!higherIsBetter && value <= lo && value >= hi)
    ) {
      const range = Math.abs(hi - lo);
      const dist = Math.abs(value - lo);
      const frac = range === 0 ? 0.5 : dist / range;
      const scoreLo = pcts[i];
      const scoreHi = pcts[i + 1];
      return scoreLo + frac * (scoreHi - scoreLo);
    }
  }

  return 50; // fallback
}

// --- Individual metric scorers ---------------------------------------------

function scoreCi(passRate: number | null, cohort: CohortPercentiles): number {
  if (passRate === null) return 50; // no data = neutral
  return percentileScore(passRate, cohort.ci, true);
}

function scorePr(
  hours: number | null,
  count: number,
  cohort: CohortPercentiles,
): number {
  if (hours === null || count === 0) return 30; // no data = below average
  return percentileScore(hours, cohort.pr, false);
}

/**
 * Release scoring with special handling:
 * - 55% of repos don't use GitHub Releases at all.
 * - If a repo has zero releases AND no release history, treat as neutral (50).
 * - Only penalize if the repo clearly used releases before but stopped.
 */
function scoreReleases(
  perWeek: number,
  releaseCount: number,
  lastReleaseDate: string | null,
  cohort: CohortPercentiles,
): number {
  const hasReleaseHistory = releaseCount > 0 || lastReleaseDate !== null;

  if (perWeek === 0 && !hasReleaseHistory) {
    // Repo never used releases, don't penalize
    return 50;
  }

  if (perWeek === 0 && hasReleaseHistory) {
    // Used to release but stopped. Check how long ago.
    if (lastReleaseDate) {
      const daysSince =
        (Date.now() - new Date(lastReleaseDate).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince > 180) return 15;
      if (daysSince > 90) return 25;
      return 35;
    }
    return 20;
  }

  return percentileScore(perWeek, cohort.rel, true);
}

function scoreResponse(hours: number | null, isBotOnly: boolean): number {
  if (hours === null) return 40;
  // Response time uses the overall population (no cohort-specific data yet)
  const raw = percentileScore(hours, [168, 48, 12, 4, 1], false);
  if (isBotOnly) return Math.min(raw, 50);
  return raw;
}

// --- Weights ---------------------------------------------------------------
// Releases get lower weight (15%) since 55% of repos don't use them.

const WEIGHTS = {
  ci: 0.30,
  pr: 0.30,
  releases: 0.15,
  response: 0.25,
};

// --- State and BPM mapping -------------------------------------------------

function stateFromScore(score: number): HealthState {
  if (score >= 70) return 'healthy';
  if (score >= 50) return 'stressed';
  if (score >= 30) return 'critical';
  return 'flatline';
}

function bpmFromScore(score: number): string {
  if (score >= 70) return String(60 + Math.round((score - 70) * 0.5));
  if (score >= 50) return String(80 + Math.round((70 - score) * 0.5));
  if (score >= 30) return String(100 + Math.round((50 - score) * 0.75));
  return '--';
}

// --- Flatline detection ----------------------------------------------------

function isFlatline(raw: RawMetrics): boolean {
  // Zero releases for a long time + very few merged PRs = dead
  if (raw.releasesPerWeek === 0 && raw.prMergedCount <= 5) return true;

  // Last release over 6 months ago + negligible PR activity
  if (raw.lastReleaseDate) {
    const daysSinceRelease =
      (Date.now() - new Date(raw.lastReleaseDate).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceRelease > 180 && raw.prMergedCount <= 3) return true;
  }

  return false;
}

// --- Main scoring function -------------------------------------------------

export function calculateScore(raw: RawMetrics): HealthResult {
  const cohortKey = detectCohort(raw.sizeKb);
  const cohort = COHORTS[cohortKey];

  // Force flatline for truly dead repos
  if (isFlatline(raw)) {
    const metrics: MetricScores = {
      ci: scoreCi(raw.ciPassRate, cohort),
      pr: scorePr(raw.prMergeTimeHours, raw.prMergedCount, cohort),
      releases: 0,
      response: scoreResponse(raw.responseTimeHours, raw.responseIsBotOnly),
    };
    return { score: 10, state: 'flatline', bpm: '--', metrics, raw };
  }

  const metrics: MetricScores = {
    ci: scoreCi(raw.ciPassRate, cohort),
    pr: scorePr(raw.prMergeTimeHours, raw.prMergedCount, cohort),
    releases: scoreReleases(
      raw.releasesPerWeek,
      raw.releaseCount,
      raw.lastReleaseDate,
      cohort,
    ),
    response: scoreResponse(raw.responseTimeHours, raw.responseIsBotOnly),
  };

  const score = Math.round(
    metrics.ci * WEIGHTS.ci +
    metrics.pr * WEIGHTS.pr +
    metrics.releases * WEIGHTS.releases +
    metrics.response * WEIGHTS.response,
  );

  const state = stateFromScore(score);
  const bpm = bpmFromScore(score);

  return { score, state, bpm, metrics, raw };
}
