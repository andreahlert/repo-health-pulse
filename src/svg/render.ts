import { HealthResult, HealthState, RenderFormat, SvgData } from '../core/types';
import { renderMonitor } from './templates';
import { renderMini } from './template-mini';
import { renderBadge } from './template-badge';

const VALUE_CLASS_MAP: Record<HealthState, 'good' | 'warn' | 'crit' | 'dead'> = {
  healthy: 'good',
  stressed: 'warn',
  critical: 'crit',
  flatline: 'dead',
};

function formatTime(hours: number | null): { display: string; unit: string } {
  if (hours === null) return { display: '--', unit: '' };
  if (hours < 1 / 60) return { display: '<1', unit: 'min' };
  if (hours < 1) return { display: String(Math.round(hours * 60)), unit: 'min' };
  if (hours < 24) return { display: String(Math.round(hours * 10) / 10), unit: 'hrs' };
  return { display: String(Math.round(hours / 24 * 10) / 10), unit: 'days' };
}

function classForCi(rate: number | null): 'good' | 'warn' | 'crit' | 'dead' {
  if (rate === null) return 'dead';
  if (rate >= 95) return 'good';
  if (rate >= 80) return 'warn';
  return 'crit';
}

function classForPr(hours: number | null): 'good' | 'warn' | 'crit' | 'dead' {
  if (hours === null) return 'dead';
  if (hours < 24) return 'good';
  if (hours < 72) return 'warn';
  return 'crit';
}

function classForReleases(perWeek: number): 'good' | 'warn' | 'crit' | 'dead' {
  if (perWeek >= 0.8) return 'good';
  if (perWeek >= 0.3) return 'warn';
  if (perWeek > 0) return 'crit';
  return 'dead';
}

function classForResponse(hours: number | null): 'good' | 'warn' | 'crit' | 'dead' {
  if (hours === null) return 'dead';
  if (hours < 12) return 'good';
  if (hours < 48) return 'warn';
  return 'crit';
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
    ciClass: classForCi(raw.ciPassRate),
    prDisplay: pr.display,
    prUnit: pr.unit,
    prClass: classForPr(raw.prMergeTimeHours),
    relDisplay: String(raw.releasesPerWeek),
    relClass: classForReleases(raw.releasesPerWeek),
    respDisplay: resp.display,
    respUnit: resp.unit + (raw.responseIsBotOnly ? '*' : ''),
    respClass: classForResponse(raw.responseTimeHours),
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

  switch (format) {
    case 'monitor':
      return renderMonitor(data);
    case 'mini':
      return renderMini(data);
    case 'badge':
      return renderBadge(data);
  }
}
