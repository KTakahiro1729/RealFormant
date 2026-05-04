export function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  const n = size - 1;
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / n));
  }
  return w;
}

export function applyWindow(out: Float32Array, input: Float32Array, window: Float32Array): void {
  const n = input.length;
  for (let i = 0; i < n; i++) {
    out[i] = input[i] * window[i];
  }
}

/** In-place pre-emphasis filter: y[n] = x[n] - a * x[n-1]. */
export function preEmphasize(buf: Float32Array, alpha: number): void {
  for (let i = buf.length - 1; i > 0; i--) {
    buf[i] = buf[i] - alpha * buf[i - 1];
  }
  // Index 0 stays as-is.
}
