import { SvgData } from '../core/types';
import { themes } from './theme';
import { miniWaveforms } from './waveforms';

export function renderMini(d: SvgData): string {
  const t = themes[d.state];
  const waveform = miniWaveforms[d.state];
  const statusLabel = d.state;

  const blinkCss = d.state === 'critical' ? `
      @keyframes blink-crit {
        0%, 100% { opacity: 1; }
        30% { opacity: 0; }
        60% { opacity: 1; }
        80% { opacity: 0; }
      }` : '';

  const statusAnim = d.state === 'critical'
    ? 'animation: blink-crit 0.8s ease-in-out infinite;'
    : d.state === 'flatline'
    ? 'animation: fade 3s ease-in-out infinite;'
    : '';
  const dotAnim = d.state === 'critical'
    ? 'animation: blink-crit 0.5s ease-in-out infinite;'
    : d.state === 'flatline'
    ? 'animation: fade 3s ease-in-out infinite;'
    : `animation: pulse ${d.state === 'stressed' ? '0.7s' : '1.5s'} ease-in-out infinite;`;

  const critOverlay = d.state === 'critical'
    ? '<rect width="480" height="80" rx="6" fill="#ef4444" opacity="0.02"/>'
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="80" viewBox="0 0 480 80">
  <defs>
    <style>
      @keyframes ${t.animName} {
        0% { stroke-dashoffset: 1000; }
        100% { stroke-dashoffset: 0; }
      }
      @keyframes pulse {
        0%, 100% { opacity: 0.6; }
        50% { opacity: 1; }
      }
      @keyframes fade {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 0.7; }
      }${blinkCss}
      .bg { fill: #1a1c20; }
      .ecg {
        fill: none;
        stroke: ${t.accent};
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
        filter: drop-shadow(0 0 3px ${t.accentGlow});
        stroke-dasharray: 1000;
        animation: ${t.animName} ${t.animDuration} linear infinite;
      }
      .repo { fill: ${d.state === 'flatline' ? '#6b7280' : '#e2e8f0'}; font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: 12px; }
      .repo-dim { fill: ${d.state === 'flatline' ? '#4b5563' : '#64748b'}; }
      .score { fill: ${t.accent}; font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: 20px; font-weight: bold; }
      .score-unit { fill: ${d.state === 'flatline' ? '#4b5563' : '#94a3b8'}; font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: 11px; }
      .status { fill: ${t.accent}; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; ${statusAnim} }
      .dot { fill: ${t.accent}; ${dotAnim} }
      .border { fill: none; stroke: ${t.borderColor}; stroke-width: 1; rx: 6; }
    </style>
  </defs>

  <rect class="bg" width="480" height="80" rx="6"/>
  ${critOverlay}
  <rect class="border" x="0.5" y="0.5" width="479" height="79"/>

  <path class="ecg" d="${waveform}"/>

  <text class="repo" x="15" y="68">
    <tspan class="repo-dim">${d.owner}/</tspan>${d.repo}
  </text>

  <circle class="dot" cx="410" cy="28" r="3"/>
  <text class="status" x="418" y="32">${statusLabel}</text>

  <text class="score" x="410" y="58">${d.score}</text>
  <text class="score-unit" x="${d.score >= 100 ? '446' : '438'}" y="58">/100</text>
</svg>`;
}
