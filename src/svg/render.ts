import { HealthResult, HealthState, RenderFormat, SvgData } from '../core/types';
import { renderMonitor } from './templates';
import { renderMini } from './template-mini';
import { renderBadge } from './template-badge';
import { generateMonitorWaveform, generateMiniWaveform, generateBadgeWaveform } from './waveform-generator';

const VALUE_CLASS_MAP: Record<HealthState, 'good' | 'warn' | 'crit' | 'dead'> = {
  healthy: 'good',
  stressed: 'warn',
  critical: 'crit',
  flatline: 'dead',
};

function formatTime(hours: number | null): { display: string; unit: string } {
  if (hours === null) return { display: '--', unit: '' };
  if (hours < 1 / 60) return { display: '&lt;1', unit: 'min' };
  if (hours < 1) return { display: String(Math.round(hours * 60)), unit: 'min' };
  if (hours < 24) return { display: String(Math.round(hours * 10) / 10), unit: 'hrs' };
  return { display: String(Math.round(hours / 24 * 10) / 10), unit: 'days' };
}

// Color classes based on the percentile SCORE (0-100), not the raw value.
// This way colors are relative to the cohort, not absolute thresholds.
// A CI of 75% that scores 50 in its cohort shows as neutral, not red.
function classFromScore(score: number): 'good' | 'warn' | 'crit' | 'dead' {
  if (score >= 65) return 'good';
  if (score >= 40) return 'warn';
  if (score >= 15) return 'crit';
  return 'dead';
}

function buildFootnote(result: HealthResult): string | null {
  const parts: string[] = [];

  if (result.raw.responseIsBotOnly) {
    parts.push('* bot auto-reply');
  }

  if (result.raw.lastReleaseDate && result.raw.releasesPerWeek === 0) {
    const daysAgo = Math.round(
      (Date.now() - new Date(result.raw.lastReleaseDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    parts.push(`last release: ${daysAgo}d ago`);
  }

  return parts.length > 0 ? parts.join(' | ') : null;
}

export function buildSvgData(result: HealthResult, owner: string, repo: string): SvgData {
  const raw = result.raw;
  const pr = formatTime(raw.prMergeTimeHours);
  const resp = formatTime(raw.responseTimeHours);

  return {
    owner,
    repo,
    score: result.score,
    state: result.state,
    bpm: result.bpm,
    ciDisplay: raw.ciPassRate !== null ? `${raw.ciPassRate}%` : 'N/A',
    ciClass: classFromScore(result.metrics.ci),
    prDisplay: pr.display,
    prUnit: pr.unit,
    prClass: classFromScore(result.metrics.pr),
    relDisplay: String(raw.releasesPerWeek),
    relClass: classFromScore(result.metrics.releases),
    respDisplay: resp.display,
    respUnit: resp.unit + (raw.responseIsBotOnly ? '*' : ''),
    respClass: classFromScore(result.metrics.response),
    footnote: buildFootnote(result),
    healthBarWidth: Math.round((result.score / 100) * 195),
  };
}

export function renderSvg(
  format: RenderFormat,
  result: HealthResult,
  owner: string,
  repo: string
): string {
  const data = buildSvgData(result, owner, repo);
  const slug = `${owner}/${repo}`;

  // Generate unique waveform based on individual metrics
  const waveform = format === 'monitor'
    ? generateMonitorWaveform(result.metrics, slug)
    : format === 'mini'
    ? generateMiniWaveform(result.metrics, slug)
    : generateBadgeWaveform(result.metrics, slug);

  switch (format) {
    case 'monitor':
      return renderMonitor(data, waveform);
    case 'mini':
      return renderMini(data, waveform);
    case 'badge':
      return renderBadge(data, waveform);
  }
}
