<script setup lang="ts">
import { inject, ref, type Ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useAnalysisStore } from '../stores/analysisStore';
import type { AudioGraph } from '../audio/AudioGraph';

const store = useAnalysisStore();
const { settings } = storeToRefs(store);
const audioGraphRef = inject<Ref<AudioGraph | null>>('audioGraph');

const open = ref(false);

const fftOptions = [1024, 2048, 4096, 8192];
const lpcOptions = [12, 14, 16, 18, 20, 24];

function commit(): void {
  audioGraphRef?.value?.updateSettings(settings.value);
}
</script>

<template>
  <details class="settings" :open="open" @toggle="open = ($event.target as HTMLDetailsElement).open">
    <summary>詳細設定</summary>
    <div class="grid">
      <label>
        FFT サイズ
        <select v-model.number="settings.fftSize" @change="commit">
          <option v-for="n in fftOptions" :key="n" :value="n">{{ n }}</option>
        </select>
      </label>
      <label>
        ホップ
        <input type="number" v-model.number="settings.hopSize" min="64" step="64" @change="commit" />
      </label>
      <label>
        LPC 次数
        <select v-model.number="settings.lpcOrder" @change="commit">
          <option v-for="n in lpcOptions" :key="n" :value="n">{{ n }}</option>
        </select>
      </label>
      <label>
        Pre-emphasis
        <input
          type="number"
          v-model.number="settings.preEmphasis"
          min="0"
          max="1"
          step="0.01"
          @change="commit"
        />
      </label>
      <label>
        F0 最小 (Hz)
        <input type="number" v-model.number="settings.f0Min" min="40" step="10" @change="commit" />
      </label>
      <label>
        F0 最大 (Hz)
        <input type="number" v-model.number="settings.f0Max" min="200" step="10" @change="commit" />
      </label>
      <label>
        表示下限 (Hz)
        <input type="number" v-model.number="settings.fMin" min="20" step="10" @change="commit" />
      </label>
      <label>
        表示上限 (Hz)
        <input type="number" v-model.number="settings.fMax" min="2000" step="500" @change="commit" />
      </label>
      <label>
        dB 下限
        <input type="number" v-model.number="settings.dbMin" max="0" step="5" @change="commit" />
      </label>
      <label>
        dB 上限
        <input type="number" v-model.number="settings.dbMax" max="20" step="5" @change="commit" />
      </label>
    </div>
    <p class="hint muted">FFT/ホップ/LPC 次数の変更は次フレームから反映されます。</p>
  </details>
</template>

<style scoped>
.settings {
  background: #0e1116;
  border: 1px solid #1f242c;
  border-radius: 6px;
  padding: 8px 10px;
}
summary {
  cursor: pointer;
  font-size: 13px;
  color: #c9d1d9;
}
.grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
}
.grid label {
  display: flex;
  flex-direction: column;
  font-size: 11px;
  color: #8b949e;
  gap: 3px;
}
.grid input,
.grid select {
  width: 100%;
}
.hint {
  font-size: 11px;
  margin: 8px 0 0;
}
</style>
