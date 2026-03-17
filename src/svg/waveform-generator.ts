import { MetricScores } from '../core/types';

interface WaveformConfig {
  width: number;
  height: number;
  centerY: number;
  startX: number;
}

const MONITOR_CONFIG: WaveformConfig = { width: 555, height: 220, centerY: 110, startX: 0 };
const MINI_CONFIG: WaveformConfig = { width: 385, height: 80, centerY: 40, startX: 15 };
const BADGE_CONFIG: WaveformConfig = { width: 131, height: 32, centerY: 16, startX: 95 };

// Seeded random for deterministic waveforms per-repo
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

interface BeatParams {
  // Derived from metrics
  baseInterval: number;     // px between beats (from release frequency)
  intervalJitter: number;   // irregularity (from CI pass rate)
  qrsAmplitude: number;     // height of R peak (base)
  qrsDistortion: number;    // extra deflections in QRS (from CI)
  tWaveHeight: number;      // T-wave elevation (from PR merge time)
  tWaveInverted: boolean;   // T-wave flipped (extreme PR slowness)
  baselineNoise: number;    // wandering baseline (from response time)
  pWavePresent: boolean;    // P-wave disappears in severe arrhythmia
}

function metricsToParams(scores: MetricScores): BeatParams {
  // Release frequency → heart rate / beat interval
  // High releases = fast beat (short interval), low = slow beat (long interval)
  const relScore = scores.releases;
  const baseInterval = 180 - (relScore * 1.1); // 180px (slow) to 70px (fast)

  // CI pass rate → rhythm regularity
  // High CI = regular, low CI = arrhythmia
  const ciScore = scores.ci;
  const intervalJitter = ((100 - ciScore) / 100) * 0.5; // 0 (perfect) to 0.5 (chaotic)
  const qrsDistortion = (100 - ciScore) / 100; // 0 to 1

  // PR merge time → T-wave stress
  // Fast PRs = normal T-wave, slow = elevated/inverted
  const prScore = scores.pr;
  const tWaveHeight = 1.0 + ((100 - prScore) / 100) * 1.5; // 1.0 (normal) to 2.5 (very elevated)
  const tWaveInverted = prScore < 15;

  // Response time → baseline noise
  // Fast response = clean line, slow = noisy/wandering
  const respScore = scores.response;
  const baselineNoise = ((100 - respScore) / 100) * 0.8; // 0 (clean) to 0.8 (very noisy)

  return {
    baseInterval: Math.max(60, Math.min(180, baseInterval)),
    intervalJitter,
    qrsAmplitude: 1.0,
    qrsDistortion,
    tWaveHeight,
    tWaveInverted,
    baselineNoise,
    pWavePresent: ciScore > 30,
  };
}

function generateBeat(
  x: number,
  centerY: number,
  scale: number,
  params: BeatParams,
  rand: () => number,
): { path: string; width: number } {
  const amp = 50 * scale;
  const noise = () => (rand() - 0.5) * params.baselineNoise * amp * 0.4;
  const points: string[] = [];

  let cx = x;

  // Flat lead-in with baseline noise
  const leadIn = 5 * scale + noise() * 0.3;
  if (Math.abs(noise()) > 0.5) {
    const n1 = noise() * 0.3;
    const n2 = noise() * 0.3;
    points.push(`L ${cx + leadIn * 0.3},${centerY + n1}`);
    points.push(`L ${cx + leadIn * 0.7},${centerY + n2}`);
  }
  cx += leadIn;

  // P-wave (small atrial bump)
  if (params.pWavePresent) {
    const pHeight = 5 * scale * (1 + params.baselineNoise * 0.3);
    points.push(`L ${cx},${centerY + noise()}`);
    points.push(`L ${cx + 3 * scale},${centerY - pHeight + noise()}`);
    points.push(`L ${cx + 7 * scale},${centerY + pHeight * 0.5 + noise()}`);
    points.push(`L ${cx + 10 * scale},${centerY + noise()}`);
    cx += 10 * scale;
  }

  // PR segment (flat, short)
  const prSeg = (3 + rand() * 2) * scale;
  points.push(`L ${cx + prSeg},${centerY + noise()}`);
  cx += prSeg;

  // QRS complex
  const qrsBase = amp * params.qrsAmplitude;

  // Q dip
  const qDepth = qrsBase * 0.15 * (1 + params.qrsDistortion * rand());
  points.push(`L ${cx},${centerY + noise()}`);
  points.push(`L ${cx + 2 * scale},${centerY + qDepth + noise()}`);
  cx += 2 * scale;

  // R peak (main spike up)
  const rHeight = qrsBase * (0.9 + params.qrsDistortion * rand() * 0.4);
  points.push(`L ${cx + 2 * scale},${centerY - rHeight}`);
  cx += 2 * scale;

  // S dip (below baseline)
  const sDepth = qrsBase * (0.5 + params.qrsDistortion * rand() * 0.3);
  points.push(`L ${cx + 2 * scale},${centerY + sDepth}`);
  cx += 2 * scale;

  // Extra distortion deflections for low CI
  if (params.qrsDistortion > 0.4 && rand() < params.qrsDistortion) {
    const extraAmp = qrsBase * 0.3 * rand();
    const dir = rand() > 0.5 ? -1 : 1;
    points.push(`L ${cx + 1.5 * scale},${centerY + dir * extraAmp}`);
    cx += 1.5 * scale;
  }

  // Return to baseline
  const returnNoise = noise() * 0.3;
  points.push(`L ${cx + 2 * scale},${centerY + returnNoise}`);
  cx += 2 * scale;

  // ST segment
  const stSeg = (3 + rand() * 2) * scale;
  const stElevation = params.qrsDistortion > 0.5 ? noise() * 0.5 : 0;
  points.push(`L ${cx + stSeg},${centerY + stElevation + noise() * 0.2}`);
  cx += stSeg;

  // T-wave
  const tHeight = 10 * scale * params.tWaveHeight;
  const tDir = params.tWaveInverted ? 1 : -1;
  const tWidth = 12 * scale;
  points.push(`L ${cx + tWidth * 0.2},${centerY + tDir * tHeight * 0.4 + noise() * 0.2}`);
  points.push(`L ${cx + tWidth * 0.5},${centerY + tDir * tHeight + noise() * 0.2}`);
  points.push(`L ${cx + tWidth * 0.8},${centerY + tDir * tHeight * 0.4 + noise() * 0.2}`);
  points.push(`L ${cx + tWidth},${centerY + noise() * 0.3}`);
  cx += tWidth;

  // Flat trail
  const trail = (3 + rand() * 3) * scale;
  if (params.baselineNoise > 0.3) {
    points.push(`L ${cx + trail * 0.5},${centerY + noise() * 0.4}`);
  }
  points.push(`L ${cx + trail},${centerY + noise() * 0.2}`);
  cx += trail;

  return {
    path: points.join(' '),
    width: cx - x,
  };
}

function generateWaveformPath(
  config: WaveformConfig,
  params: BeatParams,
  rand: () => number,
): string {
  const { width, centerY, startX } = config;
  const endX = startX + width;
  const scale = config.height / 220; // scale relative to monitor size

  const parts: string[] = [`M ${startX},${centerY}`];
  let x = startX;

  while (x < endX - 10) {
    // Jitter the interval between beats
    const jitter = 1 + (rand() - 0.5) * params.intervalJitter * 2;
    const interval = params.baseInterval * scale * Math.max(0.5, jitter);

    const beat = generateBeat(x, centerY, scale, params, rand);
    parts.push(beat.path);
    x += beat.width;

    // Flat gap between beats (diastole) with possible noise
    const gap = Math.max(5, interval - beat.width);
    if (gap > 0 && x < endX) {
      const gapEnd = Math.min(x + gap, endX);
      if (params.baselineNoise > 0.3 && gap > 10) {
        // Add wandering baseline between beats
        const mid = x + (gapEnd - x) * 0.5;
        const n1 = (rand() - 0.5) * params.baselineNoise * 3 * scale;
        const n2 = (rand() - 0.5) * params.baselineNoise * 2 * scale;
        parts.push(`L ${mid},${centerY + n1}`);
        parts.push(`L ${gapEnd},${centerY + n2}`);
      } else {
        parts.push(`L ${gapEnd},${centerY}`);
      }
      x = gapEnd;
    }
  }

  // End at the edge
  parts.push(`L ${endX},${centerY}`);

  return parts.join(' ');
}

export function generateMonitorWaveform(scores: MetricScores, repoSlug: string): string {
  const params = metricsToParams(scores);
  const rand = seededRandom(hashString(repoSlug));
  return generateWaveformPath(MONITOR_CONFIG, params, rand);
}

export function generateMiniWaveform(scores: MetricScores, repoSlug: string): string {
  const params = metricsToParams(scores);
  const rand = seededRandom(hashString(repoSlug + ':mini'));
  return generateWaveformPath(MINI_CONFIG, params, rand);
}

export function generateBadgeWaveform(scores: MetricScores, repoSlug: string): string {
  const params = metricsToParams(scores);
  const rand = seededRandom(hashString(repoSlug + ':badge'));
  return generateWaveformPath(BADGE_CONFIG, params, rand);
}
