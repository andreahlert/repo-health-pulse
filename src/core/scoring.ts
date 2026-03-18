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

// Population data from 1069 code repos (non-code repos excluded).
// Each array: [p10, p25, p50, p75, p90]
const OVERALL: CohortPercentiles = {
  ci:  [25, 60, 87, 100, 100],
  pr:  [0.5, 4.7, 22.1, 99.1, 455.5],
  rel: [0, 0, 0, 0.2, 0.8],
};

const COHORTS: Record<SizeCohort, CohortPercentiles> = {
  tiny: {
    ci:  [20, 55, 90, 100, 100],
    pr:  [0.5, 4.8, 34.9, 170.4, 800],
    rel: [0, 0, 0, 0, 0.4],
  },
  medium: {
    ci:  [25, 60, 87, 100, 100],
    pr:  [0.5, 4.1, 21.8, 93.8, 500],
    rel: [0, 0, 0, 0.21, 0.8],
  },
  big: {
    ci:  [30, 60, 85, 100, 100],
    pr:  [0.5, 6.1, 17.7, 74.2, 400],
    rel: [0, 0, 0.08, 0.47, 1.5],
  },
  huge: {
    ci:  [30, 58, 85, 95, 100],
    pr:  [0.3, 2.4, 17.7, 65.5, 300],
    rel: [0, 0, 0.08, 0.70, 2.0],
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
  // For "lower is better" metrics (PR time, response time), we keep the
  // original anchor order [p10, p25, p50, p75, p90] where p10 is the worst
  // (highest value) and p90 is the best (lowest value).
  //
  // We pair each anchor with its corresponding score:
  //   p10 anchor -> score 10, p25 -> 25, p50 -> 50, p75 -> 75, p90 -> 90

  const pairs: Array<{ val: number; score: number }> = anchors.map((v, i) => ({
    val: v,
    score: PCTL_ANCHORS[i],
  }));

  // Sort pairs so val is ascending
  if (!higherIsBetter) {
    pairs.reverse(); // anchors for "lower is better" are [worst..best], reverse to [best..worst] = [low..high]
  }
  // Now pairs are sorted by val ascending, with correct scores

  const first = pairs[0];
  const last = pairs[pairs.length - 1];

  // Below lowest anchor
  if (value <= first.val) {
    if (higherIsBetter) {
      // Below worst: extrapolate down from score 10
      return Math.max(first.score * (value / Math.max(first.val, 0.01)), 2);
    } else {
      // Below best (very good): extrapolate up from score 90
      if (first.val <= 0) return 98;
      return 95 + 5 * Math.max(1 - value / first.val, 0);
    }
  }

  // Above highest anchor
  if (value >= last.val) {
    if (higherIsBetter) {
      // Above best: extrapolate up from score 90
      return 95 + 5 * Math.min((value - last.val) / Math.max(last.val, 1), 1);
    } else {
      // Above worst (very bad): extrapolate down from score 10
      const ratio = last.val / Math.max(value, 0.01);
      return Math.max(last.score * ratio, 2);
    }
  }

  // Interpolate between adjacent anchors
  for (let i = 0; i < pairs.length - 1; i++) {
    const lo = pairs[i];
    const hi = pairs[i + 1];
    if (value >= lo.val && value <= hi.val) {
      const range = hi.val - lo.val;
      const frac = range === 0 ? 0.5 : (value - lo.val) / range;
      return lo.score + frac * (hi.score - lo.score);
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
  prMergedCount: number,
  cohort: CohortPercentiles,
): number {
  const hasReleaseHistory = releaseCount > 0 || lastReleaseDate !== null;

  if (perWeek === 0 && !hasReleaseHistory) {
    // Repo never used releases. If it has active PRs, it's just using
    // a different distribution mechanism (tags, channels, etc.) - neutral.
    // If it has no PRs either, slightly below average.
    return prMergedCount >= 10 ? 50 : 40;
  }

  if (perWeek === 0 && hasReleaseHistory) {
    // Used to release but stopped. But if PRs are very active, the repo
    // likely moved to a different release mechanism - don't penalize hard.
    if (prMergedCount >= 15) return 45;

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

function hasRecentPrActivity(raw: RawMetrics): boolean {
  if (!raw.lastPrMergedDate) return false;
  const daysSince = (Date.now() - new Date(raw.lastPrMergedDate).getTime()) / (1000 * 60 * 60 * 24);
  return daysSince < 30;
}

function stateFromScore(score: number, raw: RawMetrics): HealthState {
  if (score >= 70) return 'healthy';
  if (score >= 50) return 'stressed';
  // A repo with PRs merged in the last 30 days is alive, not dead.
  // Flatline means abandoned. Recent activity = critical at worst.
  if (score >= 30 || hasRecentPrActivity(raw)) return 'critical';
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
  const recentPr = hasRecentPrActivity(raw);

  // If there are PRs merged in the last 30 days, the repo is alive
  if (recentPr) return false;

  // No recent releases AND no recent PRs = dead
  if (raw.releasesPerWeek === 0 && !recentPr) return true;

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
      raw.prMergedCount,
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

  const state = stateFromScore(score, raw);
  const bpm = bpmFromScore(score);

  return { score, state, bpm, metrics, raw };
}
