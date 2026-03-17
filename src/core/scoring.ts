import { RawMetrics, MetricScores, HealthResult, HealthState } from './types';

// CI Pass Rate scoring
// Large repos often have flaky CI (infra issues, not code quality).
// 70% is common for big monorepos, shouldn't tank the whole score.
function scoreCi(passRate: number | null): number {
  if (passRate === null) return 50;
  if (passRate >= 98) return 100;
  if (passRate >= 95) return 95;
  if (passRate >= 90) return 85;
  if (passRate >= 80) return 70;
  if (passRate >= 70) return 55;
  if (passRate >= 60) return 40;
  if (passRate >= 50) return 25;
  return 10;
}

// PR Merge Time scoring
// Gradual curve instead of steep cliffs.
function scorePr(hours: number | null, count: number): number {
  if (hours === null || count === 0) return 30;
  if (hours < 2) return 100;
  if (hours < 8) return 90;
  if (hours < 24) return 80;
  if (hours < 48) return 65;
  if (hours < 72) return 50;
  if (hours < 168) return 30;
  if (hours < 336) return 15;
  return 5;
}

// Release Frequency scoring
function scoreReleases(perWeek: number): number {
  if (perWeek >= 2) return 100;
  if (perWeek >= 1) return 90;
  if (perWeek >= 0.5) return 75;
  if (perWeek >= 0.25) return 60;
  if (perWeek > 0) return 35;
  return 0;
}

// Response Time scoring
function scoreResponse(hours: number | null, isBotOnly: boolean): number {
  if (hours === null) return 40;
  const raw = scoreResponseRaw(hours);
  // Bots inflate the score. Cap it.
  if (isBotOnly) return Math.min(raw, 50);
  return raw;
}

function scoreResponseRaw(hours: number): number {
  if (hours < 1) return 100;
  if (hours < 4) return 90;
  if (hours < 12) return 75;
  if (hours < 24) return 60;
  if (hours < 48) return 45;
  if (hours < 168) return 25;
  return 5;
}

function stateFromScore(score: number): HealthState {
  if (score >= 75) return 'healthy';
  if (score >= 50) return 'stressed';
  if (score >= 20) return 'critical';
  return 'flatline';
}

function bpmFromScore(score: number): string {
  if (score >= 75) return String(65 + Math.round((score - 75) * 0.5));
  if (score >= 50) return String(85 + Math.round((75 - score) * 0.4));
  if (score >= 20) return String(105 + Math.round((50 - score) * 0.5));
  return '--';
}

// Detect truly dead repos that should be flatline regardless of other metrics
function isFlatline(raw: RawMetrics): boolean {
  // Zero releases for a long time + very few merged PRs = dead
  if (raw.releasesPerWeek === 0 && raw.prMergedCount <= 5) return true;

  // Last release over 6 months ago + negligible PR activity
  if (raw.lastReleaseDate) {
    const daysSinceRelease = (Date.now() - new Date(raw.lastReleaseDate).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceRelease > 180 && raw.prMergedCount <= 3) return true;
  }

  return false;
}

export function calculateScore(raw: RawMetrics): HealthResult {
  // Force flatline for truly dead repos
  if (isFlatline(raw)) {
    const metrics: MetricScores = {
      ci: scoreCi(raw.ciPassRate),
      pr: scorePr(raw.prMergeTimeHours, raw.prMergedCount),
      releases: 0,
      response: scoreResponse(raw.responseTimeHours, raw.responseIsBotOnly),
    };
    return { score: 10, state: 'flatline', bpm: '--', metrics, raw };
  }

  const metrics: MetricScores = {
    ci: scoreCi(raw.ciPassRate),
    pr: scorePr(raw.prMergeTimeHours, raw.prMergedCount),
    releases: scoreReleases(raw.releasesPerWeek),
    response: scoreResponse(raw.responseTimeHours, raw.responseIsBotOnly),
  };

  const score = Math.round(
    (metrics.ci + metrics.pr + metrics.releases + metrics.response) / 4
  );

  const state = stateFromScore(score);
  const bpm = bpmFromScore(score);

  return { score, state, bpm, metrics, raw };
}
