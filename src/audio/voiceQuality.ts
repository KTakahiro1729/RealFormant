/**
 * Voice quality scalars derived from a magnitude spectrum.
 *
 * - H1-H2 (dB): peak amplitude near f0 minus peak near 2*f0. Higher values
 *   indicate breathier voice; lower (or negative) values indicate pressed/
 *   modal voice.
 * - Spectral slope (dB/oct): linear regression of log10|S(f)| vs log2(f) over
 *   a chosen band, scaled so the slope is in dB per octave. More negative ==
 *   softer/breathier; less negative == more vocal effort.
 * - Singer's formant ratio (SPR): peak dB in 2.0-4.0 kHz minus peak dB in
 *   0.05-2.0 kHz. Higher == more singer's formant presence.
 */

const EPS = 1e-12;

function magToDb(m: number): number {
  return 20 * Math.log10(Math.max(m, EPS));
}

/** Find the maximum magnitude bin within [fLo, fHi]. Returns null if empty. */
function maxInBand(
  spectrum: Float32Array,
  binHz: number,
  fLo: number,
  fHi: number,
): { bin: number; mag: number } | null {
  const kLo = Math.max(1, Math.floor(fLo / binHz));
  const kHi = Math.min(spectrum.length - 1, Math.ceil(fHi / binHz));
  if (kHi <= kLo) return null;
  let best = -Infinity;
  let bestK = kLo;
  for (let k = kLo; k <= kHi; k++) {
    const m = spectrum[k];
    if (m > best) {
      best = m;
      bestK = k;
    }
  }
  return { bin: bestK, mag: best };
}

export function h1MinusH2Db(
  spectrum: Float32Array,
  sampleRate: number,
  fftSize: number,
  f0: number | null,
): number | null {
  if (!f0 || f0 <= 0) return null;
  const binHz = sampleRate / fftSize;
  const tol = 0.2; // ±20% search window around each harmonic
  const h1 = maxInBand(spectrum, binHz, f0 * (1 - tol), f0 * (1 + tol));
  const h2 = maxInBand(spectrum, binHz, 2 * f0 * (1 - tol), 2 * f0 * (1 + tol));
  if (!h1 || !h2) return null;
  return magToDb(h1.mag) - magToDb(h2.mag);
}

export function spectralSlopeDbPerOct(
  spectrum: Float32Array,
  sampleRate: number,
  fftSize: number,
  fLo = 100,
  fHi = 5000,
): number | null {
  const binHz = sampleRate / fftSize;
  const kLo = Math.max(1, Math.floor(fLo / binHz));
  const kHi = Math.min(spectrum.length - 1, Math.ceil(fHi / binHz));
  if (kHi - kLo < 8) return null;

  // Fit y = a*x + b where x = log2(f), y = 20*log10(|S|).
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  let n = 0;
  for (let k = kLo; k <= kHi; k++) {
    const f = k * binHz;
    if (f <= 0) continue;
    const x = Math.log2(f);
    const y = magToDb(spectrum[k]);
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
    n++;
  }
  if (n < 4) return null;
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  return (n * sxy - sx * sy) / denom; // dB per (log2 unit) = dB per octave
}

export function singersFormantRatioDb(
  spectrum: Float32Array,
  sampleRate: number,
  fftSize: number,
): number | null {
  const binHz = sampleRate / fftSize;
  const low = maxInBand(spectrum, binHz, 50, 2000);
  const high = maxInBand(spectrum, binHz, 2500, 4000);
  if (!low || !high) return null;
  return magToDb(high.mag) - magToDb(low.mag);
}
