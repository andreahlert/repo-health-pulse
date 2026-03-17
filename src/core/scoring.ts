import { RawMetrics, MetricScores, HealthResult, HealthState } from './types';

function scoreCi(passRate: number | null): number {
  if (passRate === null) return 50;
  if (passRate >= 98) return 100;
  if (passRate >= 90) return 75;
  if (passRate >= 80) return 50;
  if (passRate >= 70) return 25;
  return 10;
}

function scorePr(hours: number | null, count: number): number {
  if (hours === null || count === 0) return 50;
  if (hours < 4) return 100;
  if (hours < 24) return 75;
  if (hours < 72) return 50;
  if (hours < 168) return 25;
  return 0;
}

function scoreReleases(perWeek: number): number {
  if (perWeek >= 2) return 100;
  if (perWeek >= 0.8) return 80;
  if (perWeek >= 0.4) return 60;
  if (perWeek >= 0.2) return 40;
  if (perWeek > 0) return 20;
  return 0;
}

function scoreResponse(hours: number | null, isBotOnly: boolean): number {
  if (hours === null) return 50;
  if (isBotOnly) {
    return Math.min(scoreResponseRaw(hours), 60);
  }
  return scoreResponseRaw(hours);
}

function scoreResponseRaw(hours: number): number {
  if (hours < 2) return 100;
  if (hours < 12) return 75;
  if (hours < 48) return 50;
  if (hours < 168) return 25;
  return 0;
}

function stateFromScore(score: number): HealthState {
  if (score >= 80) return 'healthy';
  if (score >= 60) return 'stressed';
  if (score >= 20) return 'critical';
  return 'flatline';
}

function bpmFromScore(score: number): string {
  if (score >= 80) return String(68 + Math.round((score - 80) * 0.5));
  if (score >= 60) return String(85 + Math.round((80 - score) * 0.5));
  if (score >= 20) return String(110 + Math.round((60 - score) * 0.4));
  return '--';
}

export function calculateScore(raw: RawMetrics): HealthResult {
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
