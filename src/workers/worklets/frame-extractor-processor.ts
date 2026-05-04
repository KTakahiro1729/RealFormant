/// <reference lib="webworker" />

// AudioWorkletProcessor that buffers mono input and emits fixed-size chunks
// (default 480 samples = one RNNoise frame at 48 kHz) to the main thread.
// All further buffering (overlap for analysis) happens downstream in the Worker.

interface ChunkEmitterOptions {
  chunkSize: number;
}

declare const sampleRate: number;
declare const currentFrame: number;

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: AudioWorkletNodeOptions);
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor,
): void;

class ChunkEmitterProcessor extends AudioWorkletProcessor {
  private readonly chunkSize: number;
  private buffer: Float32Array;
  private fill = 0;

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    const opts = (options?.processorOptions ?? {}) as Partial<ChunkEmitterOptions>;
    this.chunkSize = opts.chunkSize ?? 480;
    this.buffer = new Float32Array(this.chunkSize);
  }

  override process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    if (!input || input.length === 0) return true;

    const cs = this.chunkSize;
    let i = 0;
    while (i < input.length) {
      const remaining = cs - this.fill;
      const take = Math.min(remaining, input.length - i);
      this.buffer.set(input.subarray(i, i + take), this.fill);
      this.fill += take;
      i += take;
      if (this.fill === cs) {
        const out = this.buffer; // transfer current buffer
        const newBuf = new Float32Array(cs);
        this.buffer = newBuf;
        this.fill = 0;
        const ab = out.buffer;
        this.port.postMessage(
          { type: 'chunk', samples: out, sampleRate, timestamp: currentFrame },
          [ab],
        );
      }
    }
    return true;
  }
}

registerProcessor('frame-extractor', ChunkEmitterProcessor);
