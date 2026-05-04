/**
 * Long-Term Average Spectrum accumulator.
 * Sums the magnitude (or power) over many frames; on demand, returns the
 * averaged magnitude spectrum.
 */
export class Ltas {
  private accum: Float32Array | null = null;
  private count = 0;

  reset(): void {
    if (this.accum) this.accum.fill(0);
    this.count = 0;
  }

  /** Accumulate squared magnitude (power) of one frame. */
  add(spectrum: Float32Array): void {
    if (!this.accum || this.accum.length !== spectrum.length) {
      this.accum = new Float32Array(spectrum.length);
      this.count = 0;
    }
    for (let i = 0; i < spectrum.length; i++) {
      this.accum[i] += spectrum[i] * spectrum[i];
    }
    this.count++;
  }

  /** Return averaged magnitude spectrum, or null if no frames accumulated. */
  current(): { spectrum: Float32Array; count: number } | null {
    if (!this.accum || this.count === 0) return null;
    const out = new Float32Array(this.accum.length);
    const inv = 1 / this.count;
    for (let i = 0; i < this.accum.length; i++) {
      out[i] = Math.sqrt(this.accum[i] * inv);
    }
    return { spectrum: out, count: this.count };
  }

  get frames(): number {
    return this.count;
  }
}
