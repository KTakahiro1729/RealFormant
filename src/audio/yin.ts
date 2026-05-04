/**
 * YIN pitch detection (de Cheveigné & Kawahara, 2002).
 * Returns f0 in Hz, or null if unvoiced / below confidence.
 */
export function yin(
  buf: Float32Array,
  sampleRate: number,
  opts: { threshold?: number; minHz?: number; maxHz?: number } = {},
): number | null {
  const threshold = opts.threshold ?? 0.15;
  const minHz = opts.minHz ?? 70;
  const maxHz = opts.maxHz ?? 1000;

  const tauMin = Math.max(2, Math.floor(sampleRate / maxHz));
  const tauMax = Math.min(buf.length >> 1, Math.floor(sampleRate / minHz));
  if (tauMax <= tauMin) return null;

  // Difference function d(tau).
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let s = 0;
    const limit = buf.length - tau;
    for (let j = 0; j < limit; j++) {
      const diff = buf[j] - buf[j + tau];
      s += diff * diff;
    }
    d[tau] = s;
  }

  // Cumulative mean normalized difference dPrime(tau).
  const dp = new Float32Array(tauMax + 1);
  dp[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau];
    dp[tau] = (d[tau] * tau) / running;
  }

  // Find first tau >= tauMin where dp[tau] < threshold and is local minimum.
  let tauEstimate = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (dp[tau] < threshold) {
      while (tau + 1 <= tauMax && dp[tau + 1] < dp[tau]) tau++;
      tauEstimate = tau;
      break;
    }
  }
  if (tauEstimate < 0) return null;

  // Parabolic interpolation around tauEstimate.
  const t = tauEstimate;
  let betterTau = t;
  if (t > tauMin && t < tauMax) {
    const s0 = dp[t - 1];
    const s1 = dp[t];
    const s2 = dp[t + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) betterTau = t + (s2 - s0) / denom;
  }

  const f0 = sampleRate / betterTau;
  if (f0 < minHz || f0 > maxHz) return null;
  return f0;
}
