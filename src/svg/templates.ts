import { SvgData } from '../core/types';
import { themes, valueColors } from './theme';

export function renderMonitor(d: SvgData, waveform: string): string {
  const t = themes[d.state];
  const statusLabel = d.state.toUpperCase();

  const blinkCss = d.state === 'critical' ? `
      @keyframes blink-crit {
        0%, 100% { opacity: 1; }
        30% { opacity: 0; }
        60% { opacity: 1; }
        80% { opacity: 0; }
      }
      @keyframes alert-flash {
        0%, 100% { fill: ${t.accent}; }
        50% { fill: ${t.accent}40; }
      }` : '';

  const flatNoiseCss = d.state === 'flatline' ? `
      .noise {
        fill: none;
        stroke: #374151;
        stroke-width: 0.8;
        stroke-dasharray: 1200;
        animation: ${t.animName} 8s linear infinite;
      }` : '';

  const flatNoisePath = d.state === 'flatline' ? `
  <path class="noise" d="
    M 0,110 L 50,110.5 L 100,109.5 L 150,110.3 L 200,109.7
    L 250,110.4 L 300,109.6 L 350,110.2 L 400,109.8
    L 450,110.3 L 500,109.7 L 555,110
  "/>` : '';

  const blinkClass = d.state === 'critical' ? 'animation: blink-crit 1.2s ease-in-out infinite;' : '';
  const statusBlink = d.state === 'critical'
    ? 'animation: blink-crit 0.6s ease-in-out infinite;'
    : d.state === 'flatline'
    ? 'animation: fade-slow 3s ease-in-out infinite;'
    : '';
  const dotAnim = d.state === 'critical'
    ? 'animation: alert-flash 0.4s ease-in-out infinite;'
    : d.state === 'flatline'
    ? 'animation: fade-slow 3s ease-in-out infinite;'
    : `animation: blink ${d.state === 'stressed' ? '0.8s' : '1.5s'} ease-in-out infinite;`;

  const heartAnim = d.state === 'critical'
    ? '0.4s'
    : d.state === 'stressed'
    ? '0.6s'
    : '1s';

  const footnoteEl = d.footnote
    ? `<text fill="#4b5563" font-family="ui-monospace, 'SF Mono', Consolas, monospace" font-size="8" x="555" y="205" text-anchor="end">${d.footnote}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="220" viewBox="0 0 800 220">
  <defs>
    <style>
      @keyframes ${t.animName} {
        0% { stroke-dashoffset: 2400; }
        100% { stroke-dashoffset: 0; }
      }
      @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
      @keyframes pulse-glow {
        0%, 100% { opacity: 0.5; }
        50% { opacity: 1; }
      }
      @keyframes fade-slow {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 0.7; }
      }${blinkCss}${flatNoiseCss}
      .bg { fill: #1a1c20; }
      .ecg-line {
        fill: none;
        stroke: ${t.accent};
        stroke-width: 2.5;
        stroke-linecap: round;
        stroke-linejoin: round;
        filter: drop-shadow(0 0 4px ${t.accentGlow});
        stroke-dasharray: 2400;
        animation: ${t.animName} ${t.animDuration} linear infinite;
      }
      .grid-line { stroke: #262a30; stroke-width: 0.5; }
      .label { fill: #94a3b8; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
      .val { fill: #e2e8f0; font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: 15px; font-weight: bold; }
      .val-unit { fill: #64748b; font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: 10px; }
      .val-ci { fill: ${valueColors[d.ciClass]}; font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: 15px; font-weight: bold; ${d.ciClass === 'crit' ? blinkClass : ''} }
      .val-pr { fill: ${valueColors[d.prClass]}; font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: 15px; font-weight: bold; }
      .val-rel { fill: ${valueColors[d.relClass]}; font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: 15px; font-weight: bold; }
      .val-resp { fill: ${valueColors[d.respClass]}; font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: 15px; font-weight: bold; }
      .repo-name { fill: #e2e8f0; font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: 14px; font-weight: bold; }
      .status-text { fill: ${t.accent}; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; font-size: 12px; font-weight: bold; ${statusBlink} }
      .status-dot { fill: ${t.accent}; ${dotAnim} }
      .divider { stroke: #2e3238; stroke-width: 1; }
      .bar-bg { fill: #262a30; rx: 3; }
      .bar-fill { fill: ${t.accent}; rx: 3; opacity: 0.85; }
      .border { fill: none; stroke: ${t.borderColor}; stroke-width: 1; rx: 8; }
      .heart { fill: ${t.accent}; animation: pulse-glow ${heartAnim} ease-in-out infinite; font-size: 18px; }
      .bpm { fill: ${t.accent}; font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: 22px; font-weight: bold; }
      .bpm-unit { fill: ${t.accentDim}; font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: 10px; }
    </style>
  </defs>

  <rect class="bg" width="800" height="220" rx="8"/>
  ${t.extraOverlay}
  <rect class="border" x="0.5" y="0.5" width="799" height="219"/>

  <g opacity="${d.state === 'flatline' ? '0.15' : '0.3'}">
    <line class="grid-line" x1="0" y1="44" x2="555" y2="44"/>
    <line class="grid-line" x1="0" y1="88" x2="555" y2="88"/>
    <line class="grid-line" x1="0" y1="132" x2="555" y2="132"/>
    <line class="grid-line" x1="0" y1="176" x2="555" y2="176"/>
  </g>

  <path class="ecg-line" d="${waveform}"/>
  ${flatNoisePath}

  <line class="divider" x1="570" y1="10" x2="570" y2="210"/>

  <text class="heart" x="585" y="33">&#x2665;</text>
  <text class="bpm" x="605" y="33">${d.bpm}</text>
  <text class="bpm-unit" x="${d.bpm === '--' ? '630' : '638'}" y="33">bpm</text>

  <text class="label" x="585" y="62">ci pass rate</text>
  <text class="val-ci" x="780" y="62" text-anchor="end">${d.ciDisplay}</text>

  <text class="label" x="585" y="88">pr merge time</text>
  <text class="val-pr" x="757" y="88" text-anchor="end">${d.prDisplay}</text>
  <text class="val-unit" x="762" y="88">${d.prUnit}</text>

  <text class="label" x="585" y="114">releases</text>
  <text class="val-rel" x="757" y="114" text-anchor="end">${d.relDisplay}</text>
  <text class="val-unit" x="762" y="114">/wk</text>

  <text class="label" x="585" y="140">response time</text>
  <text class="val-resp" x="757" y="140" text-anchor="end">${d.respDisplay}</text>
  <text class="val-unit" x="762" y="140">${d.respUnit}</text>

  <rect class="bar-bg" x="585" y="158" width="195" height="8"/>
  <rect class="bar-fill" x="585" y="158" width="${d.healthBarWidth}" height="8"/>

  <circle class="status-dot" cx="593" cy="183" r="3.5"/>
  <text class="status-text" x="603" y="187">${statusLabel}</text>
  <text class="val" x="757" y="187" text-anchor="end">${d.score}</text>
  <text class="val-unit" x="762" y="187">/100</text>

  <text class="repo-name" x="20" y="205">
    <tspan fill="#64748b">${d.owner}/</tspan>${d.repo}
  </text>
  ${footnoteEl}
</svg>`;
}
