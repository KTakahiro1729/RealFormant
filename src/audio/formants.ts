import type { Formant } from '../types/analysis';
import { rootsDurandKerner } from './lpc';

/**
 * Extract formants from LPC coefficients (a[0] = 1, A(z) = sum a[k] z^-k).
 * The polynomial roots in z give angles -> frequencies and radii -> bandwidths.
 *
 * Filters out:
 * - Roots with negative imaginary part (each pole appears twice; keep upper).
 * - Roots outside the unit circle (numerical artifacts).
 * - Frequencies below minHz or above maxHz.
 * - Bandwidths above maxBw (typically 600 Hz).
 */
export function extractFormants(
  lpcCoeffs: Float64Array,
  sampleRate: number,
  opts: { minHz?: number; maxHz?: number; maxBwHz?: number; max?: number } = {},
): Formant[] {
  const minHz = opts.minHz ?? 90;
  const maxHz = opts.maxHz ?? sampleRate / 2 - 200;
  const maxBwHz = opts.maxBwHz ?? 600;
  const maxN = opts.max ?? 4;

  // Reverse coefficients so the polynomial is in z (positive powers).
  const order = lpcCoeffs.length - 1;
  const reversed = new Float64Array(order + 1);
  for (let i = 0; i <= order; i++) reversed[i] = lpcCoeffs[order - i];

  const roots = rootsDurandKerner(reversed);
  const found: Formant[] = [];

  for (const z of roots) {
    if (z.im <= 1e-6) continue; // keep upper half
    const r = Math.hypot(z.re, z.im);
    if (r >= 1.0) continue; // ignore unstable roots
    const theta = Math.atan2(z.im, z.re);
    const f = (theta * sampleRate) / (2 * Math.PI);
    if (f < minHz || f > maxHz) continue;
    const bw = (-Math.log(r) * sampleRate) / Math.PI;
    if (bw > maxBwHz) continue;
    found.push({ frequency: f, bandwidth: bw });
  }

  found.sort((a, b) => a.frequency - b.frequency);
  return found.slice(0, maxN);
}
