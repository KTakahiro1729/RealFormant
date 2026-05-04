/**
 * LPC analysis via autocorrelation + Levinson-Durbin recursion, plus polynomial
 * root finding (Durand-Kerner) for formant extraction.
 */

export interface LpcResult {
  /** Coefficients a[0..order], with a[0] = 1. A(z) = sum a[k] z^-k. */
  coeffs: Float64Array;
  /** Prediction error (residual energy / autocorrelation[0]). */
  error: number;
  /** Estimated gain G such that filter is G / A(z). */
  gain: number;
}

export interface ComplexRoot {
  re: number;
  im: number;
}

/** Compute autocorrelation r[0..order] of windowed buffer. */
export function autocorrelate(buf: Float32Array, order: number): Float64Array {
  const N = buf.length;
  const r = new Float64Array(order + 1);
  for (let k = 0; k <= order; k++) {
    let s = 0;
    for (let i = 0; i < N - k; i++) s += buf[i] * buf[i + k];
    r[k] = s;
  }
  return r;
}

/** Levinson-Durbin. Returns LPC coefficients (a[0]=1) and final error. */
export function levinsonDurbin(r: Float64Array, order: number): LpcResult {
  const a = new Float64Array(order + 1);
  const aPrev = new Float64Array(order + 1);
  a[0] = 1;
  let E = r[0];
  if (E <= 0) {
    // Silent / degenerate.
    return { coeffs: a, error: 0, gain: 0 };
  }
  for (let i = 1; i <= order; i++) {
    let acc = r[i];
    for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
    const k = -acc / E;
    aPrev.set(a.subarray(0, i));
    for (let j = 1; j < i; j++) a[j] = aPrev[j] + k * aPrev[i - j];
    a[i] = k;
    E = E * (1 - k * k);
    if (E <= 0) break;
  }
  const gain = Math.sqrt(Math.max(E, 0));
  return { coeffs: a, error: E, gain };
}

/**
 * Find roots of polynomial a[0] + a[1] z + a[2] z^2 + ... + a[n] z^n
 * using Durand-Kerner iteration.
 *
 * NOTE: LPC produces A(z) = a[0] + a[1] z^-1 + ... + a[p] z^-p. To use the
 * direct-form coefficients here, pass them reversed so the resulting roots
 * are the values of z (not z^-1) at which A vanishes.
 */
export function rootsDurandKerner(coeffs: Float64Array, maxIter = 200, tol = 1e-10): ComplexRoot[] {
  const n = coeffs.length - 1;
  if (n <= 0) return [];
  // Normalize so leading coefficient is 1.
  const lead = coeffs[n];
  if (lead === 0) return [];
  const c = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) c[i] = coeffs[i] / lead;

  // Initial guesses: spread around unit circle slightly off-radius.
  const roots: ComplexRoot[] = [];
  const r0 = 0.9;
  for (let i = 0; i < n; i++) {
    const theta = (2 * Math.PI * i) / n + 0.4;
    roots.push({ re: r0 * Math.cos(theta), im: r0 * Math.sin(theta) });
  }

  // p(z) = sum c[k] z^k. Horner.
  function eval_(zRe: number, zIm: number): { re: number; im: number } {
    let re = c[n];
    let im = 0;
    for (let k = n - 1; k >= 0; k--) {
      const nr = re * zRe - im * zIm + c[k];
      const ni = re * zIm + im * zRe;
      re = nr;
      im = ni;
    }
    return { re, im };
  }

  for (let iter = 0; iter < maxIter; iter++) {
    let maxDelta = 0;
    for (let i = 0; i < n; i++) {
      const z = roots[i];
      const p = eval_(z.re, z.im);
      // Denominator: prod_{j != i} (z_i - z_j)
      let dRe = 1,
        dIm = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const dx = z.re - roots[j].re;
        const dy = z.im - roots[j].im;
        const nr = dRe * dx - dIm * dy;
        const ni = dRe * dy + dIm * dx;
        dRe = nr;
        dIm = ni;
      }
      const denom = dRe * dRe + dIm * dIm;
      if (denom === 0) continue;
      const corrRe = (p.re * dRe + p.im * dIm) / denom;
      const corrIm = (p.im * dRe - p.re * dIm) / denom;
      z.re -= corrRe;
      z.im -= corrIm;
      const d = Math.hypot(corrRe, corrIm);
      if (d > maxDelta) maxDelta = d;
    }
    if (maxDelta < tol) break;
  }
  return roots;
}

/**
 * Evaluate H(omega) = G / |A(e^{j omega})| at numBins linearly spaced bins
 * from 0 to Nyquist (numBins = fftSize/2 + 1).
 */
export function lpcEnvelope(
  coeffs: Float64Array,
  gain: number,
  fftSize: number,
  out: Float32Array,
): void {
  const order = coeffs.length - 1;
  const half = fftSize / 2;
  for (let k = 0; k <= half; k++) {
    const omega = (Math.PI * k) / half;
    let re = 0;
    let im = 0;
    for (let n = 0; n <= order; n++) {
      const a = coeffs[n];
      re += a * Math.cos(-omega * n);
      im += a * Math.sin(-omega * n);
    }
    const mag = Math.hypot(re, im);
    out[k] = mag > 0 ? gain / mag : 0;
  }
}
