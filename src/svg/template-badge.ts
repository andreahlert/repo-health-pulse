import { SvgData } from '../core/types';
import { themes } from './theme';

export function renderBadge(d: SvgData, waveform: string): string {
  const t = themes[d.state];

  const blinkCss = d.state === 'critical' ? `
      @keyframes badge-blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }` : '';

  const valueBlink = d.state === 'critical'
    ? 'animation: badge-blink 1s ease-in-out infinite;'
    : '';
  const heartAnim = d.state === 'flatline'
    ? ''
    : d.state === 'critical'
    ? 'animation: badge-blink 0.4s ease-in-out infinite;'
    : `animation: badge-pulse ${d.state === 'stressed' ? '0.6s' : '1s'} ease-in-out infinite;`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="32" viewBox="0 0 280 32">
  <defs>
    <style>
      @keyframes badge-trace {
        0% { stroke-dashoffset: 200; }
        100% { stroke-dashoffset: 0; }
      }
      @keyframes badge-pulse {
        0%, 100% { opacity: 0.7; }
        50% { opacity: 1; }
      }${blinkCss}
      .badge-bg-left { fill: #1a1c20; }
      .badge-bg-right { fill: ${t.bgRight}; }
      .badge-text { fill: #e2e8f0; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; font-size: 11px; }
      .badge-value { fill: ${t.accent}; font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: 11px; font-weight: bold; ${valueBlink} }
      .badge-ecg {
        fill: none;
        stroke: ${t.accent};
        stroke-width: 1.8;
        stroke-linecap: round;
        /* no filter - avoids render glitch */
        stroke-dasharray: 200;
        animation: badge-trace ${t.animDuration} linear infinite;
      }
      .badge-heart { fill: ${d.state === 'flatline' ? '#4b5563' : t.accent}; font-size: 10px; ${heartAnim} }
    </style>
  </defs>

  <rect class="badge-bg-left" width="90" height="32" rx="4"/>
  <rect class="badge-bg-right" x="90" width="190" height="32" rx="0"/>
  <rect class="badge-bg-right" x="276" width="4" height="32" rx="4"/>
  <rect fill="none" stroke="${t.borderColor}" stroke-width="1" x="0.5" y="0.5" width="279" height="31" rx="4"/>

  <text class="badge-text" x="10" y="20">health</text>

  <path class="badge-ecg" d="${waveform}"/>

  <text class="badge-value" x="${d.score < 10 ? '240' : '232'}" y="20">${d.score}/100</text>
  <text class="badge-heart" x="268" y="20">&#x2665;</text>
</svg>`;
}
