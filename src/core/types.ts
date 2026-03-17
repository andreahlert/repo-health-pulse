export type HealthState = 'healthy' | 'stressed' | 'critical' | 'flatline';
export type RenderFormat = 'monitor' | 'mini' | 'badge';

export interface RawMetrics {
  ciPassRate: number | null;
  ciTotalRuns: number;
  prMergeTimeHours: number | null;
  prMergedCount: number;
  releasesPerWeek: number;
  releaseCount: number;
  releasePeriodDays: number;
  responseTimeHours: number | null;
  responseIsBotOnly: boolean;
  lastReleaseDate: string | null;
}

export interface MetricScores {
  ci: number;
  pr: number;
  releases: number;
  response: number;
}

export interface HealthResult {
  score: number;
  state: HealthState;
  bpm: string;
  metrics: MetricScores;
  raw: RawMetrics;
}

export interface SvgData {
  owner: string;
  repo: string;
  score: number;
  state: HealthState;
  bpm: string;
  ciDisplay: string;
  ciClass: 'good' | 'warn' | 'crit' | 'dead';
  prDisplay: string;
  prUnit: string;
  prClass: 'good' | 'warn' | 'crit' | 'dead';
  relDisplay: string;
  relClass: 'good' | 'warn' | 'crit' | 'dead';
  respDisplay: string;
  respUnit: string;
  respClass: 'good' | 'warn' | 'crit' | 'dead';
  footnote: string | null;
  healthBarWidth: number;
}
