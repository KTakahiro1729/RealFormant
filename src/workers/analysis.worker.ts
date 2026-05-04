/// <reference lib="webworker" />

import { Rnnoise } from '@shiguredo/rnnoise-wasm';
import type { DenoiseState } from '@shiguredo/rnnoise-wasm';
import { RealFFT } from '../audio/fft';
import { hannWindow, applyWindow, preEmphasize } from '../audio/windowing';
import { autocorrelate, levinsonDurbin } from '../audio/lpc';
import { extractFormants } from '../audio/formants';
import { yin } from '../audio/yin';
import { Decimator } from '../audio/resample';
import {
  h1MinusH2Db,
  spectralSlopeDbPerOct,
  singersFormantRatioDb,
} from '../audio/voiceQuality';
import { Ltas } from '../audio/ltas';
import type { AnalysisFrame, AnalysisSettings, Formant } from '../types/analysis';

interface InitMsg {
  type: 'init';
  settings: AnalysisSettings;
  sampleRate: number;
}

interface ChunkMsg {
  type: 'chunk';
  samples: Float32Array;
  sampleRate: number;
}

interface SettingsMsg {
  type: 'settings';
  settings: AnalysisSettings;
}

interface DenoiseToggleMsg {
  type: 'denoise';
  enabled: boolean;
}

interface LtasResetMsg {
  type: 'ltasReset';
}

interface LtasModeMsg {
  type: 'ltasMode';
  enabled: boolean;
}

type InMsg =
  | InitMsg
  | ChunkMsg
  | SettingsMsg
  | DenoiseToggleMsg
  | LtasResetMsg
  | LtasModeMsg;

let settings: AnalysisSettings | null = null;
let inputSampleRate = 48000;
const lpcSampleRateTarget = 16000;
const RNN_FRAME = 480;
const PCM16_SCALE = 32768;

let fft: RealFFT | null = null;
let window: Float32Array | null = null;
let windowedBuf: Float32Array | null = null;
let magnitude: Float32Array | null = null;
let decimator: Decimator | null = null;

let rnnoise: Rnnoise | null = null;
let denoise: DenoiseState | null = null;
let rnnoiseReady = false;
let denoiseEnabled = true;

const ltas = new Ltas();
let ltasAccumulating = false;

/** Ring buffer of the most recent denoised samples. */
let ring: Float32Array | null = null;
let ringWrite = 0;
let ringFilled = 0;
let samplesSinceHop = 0;
let seq = 0;

function ensureFftBuffers(size: number): void {
  if (fft && fft.size === size && magnitude && magnitude.length === size / 2 + 1) {
    return;
  }
  fft = new RealFFT(size);
  window = hannWindow(size);
  windowedBuf = new Float32Array(size);
  magnitude = new Float32Array(size / 2 + 1);
}

function ensureRing(size: number): void {
  if (!ring || ring.length !== size) {
    ring = new Float32Array(size);
    ringWrite = 0;
    ringFilled = 0;
    samplesSinceHop = 0;
  }
}

function ensureDecimator(): void {
  const factor = Math.round(inputSampleRate / lpcSampleRateTarget);
  if (factor < 2) {
    decimator = null;
    return;
  }
  if (!decimator || decimator.factor !== factor) {
    decimator = new Decimator(factor, 65);
  }
}

async function loadRnnoise(): Promise<void> {
  try {
    rnnoise = await Rnnoise.load();
    denoise = rnnoise.createDenoiseState();
    rnnoiseReady = true;
    postMessage({ type: 'denoiseReady' });
  } catch (e) {
    rnnoiseReady = false;
    postMessage({ type: 'denoiseError', message: e instanceof Error ? e.message : String(e) });
  }
}

function pushIntoRing(samples: Float32Array): void {
  if (!ring) return;
  const N = ring.length;
  for (let i = 0; i < samples.length; i++) {
    ring[ringWrite] = samples[i];
    ringWrite = (ringWrite + 1) % N;
    if (ringFilled < N) ringFilled++;
    samplesSinceHop++;
  }
}

function copyLatestFromRing(out: Float32Array): boolean {
  if (!ring) return false;
  const N = ring.length;
  if (ringFilled < out.length) return false;
  // Most recent `out.length` samples ending at index (ringWrite - 1).
  const end = ringWrite; // one past the newest
  const start = (end - out.length + N) % N;
  if (start + out.length <= N) {
    out.set(ring.subarray(start, start + out.length));
  } else {
    const tail = N - start;
    out.set(ring.subarray(start), 0);
    out.set(ring.subarray(0, out.length - tail), tail);
  }
  return true;
}

function rmsOf(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

function denoiseInPlace(buf: Float32Array): void {
  if (!denoiseEnabled || !rnnoiseReady || !denoise) return;
  if (buf.length !== RNN_FRAME) return;
  // RNNoise expects 16-bit PCM range. Scale up, process, scale down.
  for (let i = 0; i < RNN_FRAME; i++) buf[i] *= PCM16_SCALE;
  denoise.processFrame(buf);
  for (let i = 0; i < RNN_FRAME; i++) buf[i] /= PCM16_SCALE;
}

function emitAnalysis(): void {
  if (!settings || !fft || !window || !windowedBuf || !magnitude || !ring) return;
  const size = settings.fftSize;

  const frameSamples = new Float32Array(size);
  if (!copyLatestFromRing(frameSamples)) return;

  const rms = rmsOf(frameSamples);

  // Pre-emphasis copy for spectrum + LPC.
  const emph = new Float32Array(frameSamples);
  preEmphasize(emph, settings.preEmphasis);

  applyWindow(windowedBuf, emph, window);
  fft.magnitude(windowedBuf, magnitude);
  const spectrum = new Float32Array(magnitude);

  let f0: number | null = null;
  try {
    f0 = yin(frameSamples, inputSampleRate, {
      threshold: settings.yinThreshold,
      minHz: settings.f0Min,
      maxHz: settings.f0Max,
    });
  } catch {
    f0 = null;
  }

  let formants: Formant[] = [];
  let envelope: Float32Array | null = null;
  let lpcSr = inputSampleRate;
  let lpcSig: Float32Array = emph;
  if (decimator) {
    lpcSig = decimator.process(emph);
    lpcSr = inputSampleRate / decimator.factor;
  }
  const lpcWin = hannWindow(lpcSig.length);
  for (let i = 0; i < lpcSig.length; i++) lpcSig[i] *= lpcWin[i];

  if (rms > 1e-4 && lpcSig.length > settings.lpcOrder * 2) {
    try {
      const r = autocorrelate(lpcSig, settings.lpcOrder);
      const lpc = levinsonDurbin(r, settings.lpcOrder);
      formants = extractFormants(lpc.coeffs, lpcSr, {
        minHz: 90,
        maxHz: lpcSr / 2 - 200,
        maxBwHz: 600,
        max: 4,
      });
      const env = new Float32Array(spectrum.length);
      const order = lpc.coeffs.length - 1;
      const gain = lpc.gain;
      for (let k = 0; k < spectrum.length; k++) {
        const f = (k * inputSampleRate) / size;
        if (f >= lpcSr / 2) {
          env[k] = 0;
          continue;
        }
        const omega = (2 * Math.PI * f) / lpcSr;
        let re = 0;
        let im = 0;
        for (let n = 0; n <= order; n++) {
          const a = lpc.coeffs[n];
          re += a * Math.cos(-omega * n);
          im += a * Math.sin(-omega * n);
        }
        const denom = Math.hypot(re, im);
        env[k] = denom > 0 ? (gain * size) / 4 / denom : 0;
      }
      envelope = env;
    } catch {
      formants = [];
      envelope = null;
    }
  }

  const vq = {
    h1MinusH2Db: h1MinusH2Db(spectrum, inputSampleRate, size, f0),
    spectralSlopeDbPerOct: spectralSlopeDbPerOct(spectrum, inputSampleRate, size),
    singersFormantRatioDb: singersFormantRatioDb(spectrum, inputSampleRate, size),
  };

  if (ltasAccumulating && rms > 1e-3) {
    ltas.add(spectrum);
  }

  const frame: AnalysisFrame = {
    seq: seq++,
    sampleRate: inputSampleRate,
    spectrum,
    lpcEnvelope: envelope,
    formants,
    f0,
    voiceQuality: vq,
    rms,
  };

  const transfer: ArrayBuffer[] = [spectrum.buffer as ArrayBuffer];
  if (envelope) transfer.push(envelope.buffer as ArrayBuffer);
  postMessage({ type: 'analysis', frame }, transfer);

  // Send LTAS update on a moderate cadence to avoid spamming.
  if (ltasAccumulating && seq % 10 === 0) {
    const cur = ltas.current();
    if (cur) {
      const buf = cur.spectrum;
      postMessage(
        { type: 'ltas', spectrum: buf, count: cur.count, sampleRate: inputSampleRate },
        [buf.buffer as ArrayBuffer],
      );
    }
  }
}

function handleChunk(samples: Float32Array): void {
  if (!settings) return;
  // Denoise (in place) when enabled.
  denoiseInPlace(samples);
  pushIntoRing(samples);
  if (samplesSinceHop >= settings.hopSize && ringFilled >= settings.fftSize) {
    samplesSinceHop = 0;
    emitAnalysis();
  }
}

self.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    settings = msg.settings;
    inputSampleRate = msg.sampleRate;
    ensureFftBuffers(settings.fftSize);
    ensureRing(settings.fftSize);
    ensureDecimator();
    void loadRnnoise();
    postMessage({ type: 'ready' });
  } else if (msg.type === 'settings') {
    settings = msg.settings;
    ensureFftBuffers(settings.fftSize);
    ensureRing(settings.fftSize);
  } else if (msg.type === 'denoise') {
    denoiseEnabled = msg.enabled;
    postMessage({ type: 'denoiseState', enabled: denoiseEnabled, ready: rnnoiseReady });
  } else if (msg.type === 'ltasReset') {
    ltas.reset();
    postMessage({ type: 'ltasReset' });
  } else if (msg.type === 'ltasMode') {
    ltasAccumulating = msg.enabled;
    if (!msg.enabled) ltas.reset();
  } else if (msg.type === 'chunk') {
    handleChunk(msg.samples);
  }
};
