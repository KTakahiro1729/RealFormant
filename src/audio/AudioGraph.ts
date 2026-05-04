import type { AnalysisFrame, AnalysisSettings } from '../types/analysis';
import frameExtractorUrl from '../workers/worklets/frame-extractor-processor.ts?worker&url';
import AnalysisWorker from '../workers/analysis.worker.ts?worker';

export interface AudioGraphCallbacks {
  onFrame(frame: AnalysisFrame): void;
  onError(message: string): void;
  onDenoiseState?(state: { enabled: boolean; ready: boolean }): void;
  onLtas?(snap: { spectrum: Float32Array; count: number; sampleRate: number }): void;
}

export interface StartOptions {
  deviceId?: string;
  settings: AnalysisSettings;
  denoiseEnabled: boolean;
}

export class AudioGraph {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private extractor: AudioWorkletNode | null = null;
  private worker: Worker | null = null;
  private settings: AnalysisSettings | null = null;

  constructor(private readonly cb: AudioGraphCallbacks) {}

  async start(opts: StartOptions): Promise<void> {
    await this.stop();
    this.settings = opts.settings;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: opts.deviceId ? { exact: opts.deviceId } : undefined,
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });
    this.stream = stream;

    const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
    this.ctx = ctx;
    if (ctx.state === 'suspended') await ctx.resume();

    await ctx.audioWorklet.addModule(frameExtractorUrl);

    const source = ctx.createMediaStreamSource(stream);
    this.source = source;

    const extractor = new AudioWorkletNode(ctx, 'frame-extractor', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      processorOptions: {
        chunkSize: 480,
      },
    });
    this.extractor = extractor;

    const worker = new AnalysisWorker();
    this.worker = worker;
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'analysis') {
        this.cb.onFrame(msg.frame as AnalysisFrame);
      } else if (msg?.type === 'denoiseReady') {
        this.cb.onDenoiseState?.({ enabled: opts.denoiseEnabled, ready: true });
      } else if (msg?.type === 'denoiseError') {
        this.cb.onError(`denoise: ${msg.message}`);
      } else if (msg?.type === 'denoiseState') {
        this.cb.onDenoiseState?.({ enabled: msg.enabled, ready: msg.ready });
      } else if (msg?.type === 'ltas') {
        this.cb.onLtas?.({
          spectrum: msg.spectrum as Float32Array,
          count: msg.count,
          sampleRate: msg.sampleRate,
        });
      }
    };
    worker.onerror = (e: ErrorEvent) => {
      this.cb.onError(`worker: ${e.message}`);
    };
    worker.postMessage({
      type: 'init',
      settings: opts.settings,
      sampleRate: ctx.sampleRate,
    });
    worker.postMessage({ type: 'denoise', enabled: opts.denoiseEnabled });

    extractor.port.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'chunk') {
        const samples = msg.samples as Float32Array;
        worker.postMessage(
          {
            type: 'chunk',
            samples,
            sampleRate: msg.sampleRate,
          },
          [samples.buffer],
        );
      }
    };

    source.connect(extractor);
  }

  setDenoise(enabled: boolean): void {
    this.worker?.postMessage({ type: 'denoise', enabled });
  }

  setLtasEnabled(enabled: boolean): void {
    this.worker?.postMessage({ type: 'ltasMode', enabled });
  }

  resetLtas(): void {
    this.worker?.postMessage({ type: 'ltasReset' });
  }

  updateSettings(settings: AnalysisSettings): void {
    this.settings = settings;
    if (this.worker) {
      this.worker.postMessage({ type: 'settings', settings });
    }
  }

  async stop(): Promise<void> {
    try {
      this.source?.disconnect();
    } catch {
      // ignore
    }
    this.source = null;

    if (this.extractor) {
      try {
        this.extractor.port.onmessage = null;
        this.extractor.disconnect();
      } catch {
        // ignore
      }
      this.extractor = null;
    }

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }

    if (this.ctx) {
      try {
        await this.ctx.close();
      } catch {
        // ignore
      }
      this.ctx = null;
    }
  }

  getSampleRate(): number | null {
    return this.ctx?.sampleRate ?? null;
  }

  getCurrentSettings(): AnalysisSettings | null {
    return this.settings;
  }
}
