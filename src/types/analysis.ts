export interface Formant {
  frequency: number;
  bandwidth: number;
}

export interface VoiceQuality {
  h1MinusH2Db: number | null;
  spectralSlopeDbPerOct: number | null;
  singersFormantRatioDb: number | null;
}

export interface AnalysisFrame {
  /** Sequence number (monotonically increasing). */
  seq: number;
  /** Sample rate of the input pipeline (Hz). */
  sampleRate: number;
  /** Linear-magnitude spectrum, length = fftSize/2 + 1. */
  spectrum: Float32Array;
  /** Linear-magnitude LPC envelope, sampled at the same bins as spectrum. */
  lpcEnvelope: Float32Array | null;
  /** Detected formants F1..F4 (subset present when reliably found). */
  formants: Formant[];
  /** Fundamental frequency in Hz (null if unvoiced). */
  f0: number | null;
  /** Voice quality scalars. */
  voiceQuality: VoiceQuality;
  /** RMS of the analysis frame (linear). */
  rms: number;
}

export interface AnalysisSettings {
  fftSize: number;
  hopSize: number;
  lpcOrder: number;
  preEmphasis: number;
  yinThreshold: number;
  f0Min: number;
  f0Max: number;
  /** Display range in Hz for spectrum X axis. */
  fMin: number;
  fMax: number;
  /** Display dB range. */
  dbMin: number;
  dbMax: number;
}

export const defaultSettings: AnalysisSettings = {
  fftSize: 2048,
  hopSize: 512,
  lpcOrder: 18,
  preEmphasis: 0.97,
  yinThreshold: 0.15,
  f0Min: 70,
  f0Max: 1000,
  fMin: 50,
  fMax: 12000,
  dbMin: -100,
  dbMax: 0,
};
