import { defineStore } from 'pinia';
import { markRaw, ref, shallowRef } from 'vue';
import type { AnalysisFrame, AnalysisSettings } from '../types/analysis';
import { defaultSettings } from '../types/analysis';

export interface LtasSnapshot {
  spectrum: Float32Array;
  count: number;
  sampleRate: number;
}

export const useAnalysisStore = defineStore('analysis', () => {
  const status = ref<'idle' | 'starting' | 'running' | 'error'>('idle');
  const errorMessage = ref<string | null>(null);
  const sampleRate = ref<number>(48000);
  const denoiseEnabled = ref<boolean>(true);
  const settings = ref<AnalysisSettings>({ ...defaultSettings });
  /**
   * Latest analysis frame. shallowRef + markRaw avoids Vue traversing large
   * Float32Arrays on every update.
   */
  const latestFrame = shallowRef<AnalysisFrame | null>(null);
  const ltasAccumulating = ref<boolean>(false);
  const ltasSnapshot = shallowRef<LtasSnapshot | null>(null);

  function setFrame(frame: AnalysisFrame): void {
    latestFrame.value = markRaw(frame);
  }

  function setLtas(snap: LtasSnapshot | null): void {
    ltasSnapshot.value = snap ? markRaw(snap) : null;
  }

  return {
    status,
    errorMessage,
    sampleRate,
    denoiseEnabled,
    settings,
    latestFrame,
    ltasAccumulating,
    ltasSnapshot,
    setFrame,
    setLtas,
  };
});
