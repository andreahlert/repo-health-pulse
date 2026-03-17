import { MetricScores } from '../core/types';

interface WaveformConfig {
  width: number;
  centerY: number;
  startX: number;
  amplitude: number; // R-wave peak amplitude in pixels
}

const MONITOR: WaveformConfig = { width: 555, centerY: 110, startX: 0, amplitude: 50 };
const MINI: WaveformConfig = { width: 370, centerY: 40, startX: 15, amplitude: 22 };
const BADGE: WaveformConfig = { width: 131, centerY: 16, startX: 95, amplitude: 10 };

// --- Seeded PRNG for deterministic output ---

function seededRandom(seed: number): () => number {
  let s = Math.abs(seed) || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hashString(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// --- Gaussian ECG Model ---
// Each wave (P, Q, R, S, T) is a Gaussian: a * exp(-(t-b)^2 / (2*c^2))
// t is normalized 0..1 within one beat cycle

interface GaussianWave {
  a: number;  // amplitude (positive=up, negative=down), relative to R=1.0
  b: number;  // center position in cycle (0..1)
  c: number;  // width (sigma)
  cRight?: number; // optional right-side sigma for asymmetric T wave
}

interface BeatProfile {
  waves: GaussianWave[];
  cyclePixels: number;      // total beat width in pixels
  baselineNoise: number;    // 0..1 noise amplitude on baseline
  fibrillation: boolean;    // replace P wave with f-waves
}

function gaussian(t: number, a: number, b: number, cLeft: number, cRight?: number): number {
  const c = (cRight !== undefined && t > b) ? cRight : cLeft;
  return a * Math.exp(-((t - b) ** 2) / (2 * c * c));
}

function sampleBeat(profile: BeatProfile, numPoints: number, rand: () => number): number[] {
  const values: number[] = [];
  for (let i = 0; i < numPoints; i++) {
    const t = i / numPoints;
    let y = 0;
    for (const w of profile.waves) {
      y += gaussian(t, w.a, w.b, w.c, w.cRight);
    }
    // Add baseline noise
    if (profile.baselineNoise > 0) {
      y += (rand() - 0.5) * profile.baselineNoise * 0.06;
    }
    // Add fibrillation noise (replaces P wave area, t < 0.20)
    if (profile.fibrillation && t < 0.20) {
      y += (rand() - 0.5) * 0.08 + Math.sin(t * 40 + rand() * 6) * 0.04;
    }
    values.push(y);
  }
  return values;
}

// --- Metric-driven beat profile ---

function metricsToProfile(scores: MetricScores, pixelsPerBeat: number, rand: () => number): BeatProfile {
  // Release frequency -> heart rate (cycle length)
  // High releases = fast heart = shorter cycle
  const relScore = scores.releases;
  // At 100: ~60px/beat (fast). At 0: ~180px/beat (slow/flatline)
  const baseCycle = 180 - relScore * 1.2;
  const cyclePixels = Math.max(50, Math.min(200, baseCycle * (pixelsPerBeat / 100)));

  // CI pass rate -> rhythm regularity & waveform integrity
  const ciScore = scores.ci;
  const arrhythmia = (100 - ciScore) / 100; // 0 = perfect, 1 = chaos

  // PR merge time -> T-wave stress
  const prScore = scores.pr;
  const tStress = (100 - prScore) / 100; // 0 = normal, 1 = extreme

  // Response time -> baseline noise
  const respScore = scores.response;
  const noise = (100 - respScore) / 100; // 0 = clean, 1 = noisy

  // --- Build PQRST waves ---

  const waves: GaussianWave[] = [];

  // P wave: small, rounded dome at ~12% of cycle
  // Disappears in severe arrhythmia (atrial fibrillation)
  if (ciScore > 35) {
    const pAmp = 0.12 * (1 - arrhythmia * 0.5); // gets smaller with arrhythmia
    waves.push({ a: pAmp, b: 0.12, c: 0.030 + arrhythmia * 0.01 });
  }

  // Q wave: small dip before R
  waves.push({ a: -0.08 - arrhythmia * 0.04, b: 0.22, c: 0.010 });

  // R wave: dominant sharp peak, always present
  // Gets slightly variable amplitude with arrhythmia
  const rAmp = 1.0 + (rand() - 0.5) * arrhythmia * 0.3;
  waves.push({ a: rAmp, b: 0.25, c: 0.015 });

  // S wave: dip below baseline after R
  waves.push({ a: -(0.12 + arrhythmia * 0.08), b: 0.28, c: 0.011 });

  // T wave: asymmetric rounded wave (gradual rise, steeper fall)
  // Elevated with PR stress, inverted in extreme stress
  let tAmp = 0.25 + tStress * 0.35; // 0.25 normal -> 0.60 very elevated
  if (prScore < 10) tAmp = -tAmp;    // inverted T in extreme stress
  waves.push({
    a: tAmp,
    b: 0.42 + tStress * 0.02,        // shifts slightly later under stress
    c: 0.045,                          // gradual rise (left sigma)
    cRight: 0.032,                     // steeper fall (right sigma)
  });

  // ST elevation for very low CI (simulates injury current / heart attack)
  if (ciScore < 30) {
    waves.push({ a: 0.15, b: 0.34, c: 0.040 });
  }

  return {
    waves,
    cyclePixels,
    baselineNoise: noise,
    fibrillation: ciScore < 35,
  };
}

// --- Path generation ---

function generatePath(config: WaveformConfig, scores: MetricScores, seed: string): string {
  const rand = seededRandom(hashString(seed));
  const profile = metricsToProfile(scores, config.amplitude, rand);

  const { width, centerY, startX, amplitude } = config;
  const endX = startX + width;

  // How many beats fit in the width
  const pointsPerBeat = Math.max(30, Math.round(profile.cyclePixels * 0.8));

  const parts: string[] = [`M ${startX},${centerY}`];
  let x = startX;

  // Jitter for arrhythmia (CI-driven)
  const ciScore = scores.ci;
  const arrhythmiaJitter = (100 - ciScore) / 100;

  while (x < endX - 5) {
    // Per-beat interval jitter
    const jitter = 1 + (rand() - 0.5) * arrhythmiaJitter * 0.6;
    const beatWidth = profile.cyclePixels * Math.max(0.6, jitter);

    // Sample the Gaussian model for this beat
    const samples = sampleBeat(profile, pointsPerBeat, rand);

    // Map samples to SVG coordinates
    const pxPerSample = beatWidth / pointsPerBeat;
    for (let i = 0; i < samples.length && x < endX; i++) {
      const px = x + i * pxPerSample;
      if (px > endX) break;
      // Negate because SVG y-axis is inverted (up = smaller y)
      const py = centerY - samples[i] * amplitude;
      parts.push(`L ${Math.round(px * 100) / 100},${Math.round(py * 100) / 100}`);
    }

    x += beatWidth;

    // TP segment (resting flat line between beats)
    // This is what compresses when heart rate increases (realistic)
    const tpBase = profile.cyclePixels * 0.3;
    const tp = Math.max(3, tpBase * jitter);
    if (x < endX) {
      const tpEnd = Math.min(x + tp, endX);
      if (profile.baselineNoise > 0.3) {
        // Wandering baseline
        const mid = x + (tpEnd - x) * 0.5;
        const drift1 = (rand() - 0.5) * profile.baselineNoise * amplitude * 0.04;
        const drift2 = (rand() - 0.5) * profile.baselineNoise * amplitude * 0.03;
        parts.push(`L ${Math.round(mid * 100) / 100},${Math.round((centerY + drift1) * 100) / 100}`);
        parts.push(`L ${Math.round(tpEnd * 100) / 100},${Math.round((centerY + drift2) * 100) / 100}`);
      } else {
        parts.push(`L ${Math.round(tpEnd * 100) / 100},${centerY}`);
      }
      x = tpEnd;
    }
  }

  // End at edge
  parts.push(`L ${endX},${centerY}`);
  return parts.join(' ');
}

// --- Flatline generator (special case) ---

function generateFlatline(config: WaveformConfig, seed: string): string {
  const rand = seededRandom(hashString(seed));
  const { width, centerY, startX } = config;
  const endX = startX + width;

  const parts: string[] = [`M ${startX},${centerY}`];
  // Slow wandering baseline + tiny noise (realistic asystole)
  const step = 8;
  for (let x = startX + step; x <= endX; x += step) {
    const wander = Math.sin(x * 0.015) * 1.5 * (config.amplitude / 50);
    const noise = (rand() - 0.5) * 0.8 * (config.amplitude / 50);
    parts.push(`L ${x},${Math.round((centerY + wander + noise) * 100) / 100}`);
  }
  parts.push(`L ${endX},${centerY}`);
  return parts.join(' ');
}

// --- Public API ---

function isEffectivelyFlatline(scores: MetricScores): boolean {
  return scores.releases === 0 && scores.pr <= 30;
}

export function generateMonitorWaveform(scores: MetricScores, repoSlug: string): string {
  if (isEffectivelyFlatline(scores)) return generateFlatline(MONITOR, repoSlug);
  return generatePath(MONITOR, scores, repoSlug);
}

export function generateMiniWaveform(scores: MetricScores, repoSlug: string): string {
  if (isEffectivelyFlatline(scores)) return generateFlatline(MINI, repoSlug + ':mini');
  return generatePath(MINI, scores, repoSlug + ':mini');
}

export function generateBadgeWaveform(scores: MetricScores, repoSlug: string): string {
  if (isEffectivelyFlatline(scores)) return generateFlatline(BADGE, repoSlug + ':badge');
  return generatePath(BADGE, scores, repoSlug + ':badge');
}
