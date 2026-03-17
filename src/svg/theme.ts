import { HealthState } from '../core/types';

export interface Theme {
  accent: string;
  accentDim: string;
  accentGlow: string;
  bgRight: string;
  animName: string;
  animDuration: string;
  borderColor: string;
  extraOverlay: string;
}

export const themes: Record<HealthState, Theme> = {
  healthy: {
    accent: '#4ade80',
    accentDim: '#4ade8099',
    accentGlow: '#4ade8050',
    bgRight: '#1e2420',
    animName: 'trace',
    animDuration: '4s',
    borderColor: '#2e3238',
    extraOverlay: '',
  },
  stressed: {
    accent: '#eab308',
    accentDim: '#eab30899',
    accentGlow: '#eab30850',
    bgRight: '#24221a',
    animName: 'trace-fast',
    animDuration: '2.5s',
    borderColor: '#2e3238',
    extraOverlay: '',
  },
  critical: {
    accent: '#ef4444',
    accentDim: '#ef444499',
    accentGlow: '#ef444460',
    bgRight: '#241a1a',
    animName: 'trace-erratic',
    animDuration: '3.5s',
    borderColor: '#ef444425',
    extraOverlay: '<rect width="800" height="220" rx="8" fill="#ef4444" opacity="0.02"/>',
  },
  flatline: {
    accent: '#6b7280',
    accentDim: '#4b5563',
    accentGlow: '#6b728030',
    bgRight: '#1e1e20',
    animName: 'flat-sweep',
    animDuration: '6s',
    borderColor: '#2e3238',
    extraOverlay: '',
  },
};

export const valueColors = {
  good: '#4ade80',
  warn: '#f59e0b',
  crit: '#ef4444',
  dead: '#6b7280',
};
