import FFT from 'fft.js';

/**
 * Real-input FFT helper. Computes magnitude spectrum into `out` of length size/2+1.
 */
export class RealFFT {
  private readonly fft: FFT;
  private readonly buf: Float64Array;
  private readonly tmp: Float64Array;
  readonly size: number;

  constructor(size: number) {
    this.fft = new FFT(size);
    this.size = size;
    this.buf = this.fft.createComplexArray();
    this.tmp = new Float64Array(size);
  }

  /** Computes magnitude spectrum (linear) into `magOut` of length size/2+1. */
  magnitude(input: Float32Array, magOut: Float32Array): void {
    const n = this.size;
    for (let i = 0; i < n; i++) this.tmp[i] = input[i] ?? 0;
    this.fft.realTransform(this.buf, this.tmp);
    const half = n / 2;
    // fft.js packs real spectrum without the symmetric half; complete it.
    // Use indices 0..half: real=buf[2k], imag=buf[2k+1].
    for (let k = 0; k <= half; k++) {
      const re = this.buf[2 * k];
      const im = this.buf[2 * k + 1];
      magOut[k] = Math.sqrt(re * re + im * im);
    }
  }
}
