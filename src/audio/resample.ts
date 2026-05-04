/**
 * Polyphase decimation by an integer factor with a windowed-sinc low-pass
 * kernel. Cutoff is just below the new Nyquist (sr/factor/2) with a margin
 * to suppress aliasing.
 */

function sinc(x: number): number {
  if (x === 0) return 1;
  const px = Math.PI * x;
  return Math.sin(px) / px;
}

function blackman(n: number, N: number): number {
  return (
    0.42 -
    0.5 * Math.cos((2 * Math.PI * n) / (N - 1)) +
    0.08 * Math.cos((4 * Math.PI * n) / (N - 1))
  );
}

export class Decimator {
  private readonly kernel: Float32Array;
  readonly factor: number;
  readonly taps: number;

  constructor(factor: number, taps = 65) {
    if (factor < 2 || !Number.isInteger(factor)) {
      throw new Error(`Decimator factor must be integer >= 2, got ${factor}`);
    }
    if (taps % 2 === 0) taps += 1;
    this.factor = factor;
    this.taps = taps;

    const cutoff = 0.45 / factor; // normalized to input sample rate
    const k = new Float32Array(taps);
    const center = (taps - 1) / 2;
    let sum = 0;
    for (let i = 0; i < taps; i++) {
      const x = i - center;
      const v = 2 * cutoff * sinc(2 * cutoff * x) * blackman(i, taps);
      k[i] = v;
      sum += v;
    }
    for (let i = 0; i < taps; i++) k[i] /= sum;
    this.kernel = k;
  }

  /** Output length = floor(input.length / factor). Edge samples are zero-padded. */
  process(input: Float32Array): Float32Array {
    const f = this.factor;
    const k = this.kernel;
    const M = k.length;
    const center = (M - 1) >> 1;
    const N = input.length;
    const outLen = Math.floor(N / f);
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const baseIn = i * f;
      let s = 0;
      for (let m = 0; m < M; m++) {
        const idx = baseIn + (m - center);
        if (idx >= 0 && idx < N) s += k[m] * input[idx];
      }
      out[i] = s;
    }
    return out;
  }
}
