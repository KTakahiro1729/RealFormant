<script setup lang="ts">
import { inject, onMounted, onUnmounted, ref, type Ref } from 'vue';
import { storeToRefs } from 'pinia';
import { AudioGraph } from '../audio/AudioGraph';
import { useAnalysisStore } from '../stores/analysisStore';

const store = useAnalysisStore();
const { status, errorMessage, settings, denoiseEnabled } = storeToRefs(store);

const setAudioGraph = inject<(g: AudioGraph | null) => void>('setAudioGraph');
const audioGraphRef = inject<Ref<AudioGraph | null>>('audioGraph');

const devices = ref<MediaDeviceInfo[]>([]);
const selectedDeviceId = ref<string>('');
const denoiseReady = ref<boolean>(false);

function currentGraph(): AudioGraph | null {
  return audioGraphRef?.value ?? null;
}

async function refreshDevices(): Promise<void> {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try {
    const list = await navigator.mediaDevices.enumerateDevices();
    devices.value = list.filter((d) => d.kind === 'audioinput');
  } catch (e) {
    console.warn('enumerateDevices failed', e);
  }
}

async function start(): Promise<void> {
  if (status.value === 'running' || status.value === 'starting') return;
  store.status = 'starting';
  store.errorMessage = null;
  const g = new AudioGraph({
    onFrame: (frame) => {
      store.setFrame(frame);
    },
    onError: (msg) => {
      store.errorMessage = msg;
      store.status = 'error';
    },
    onDenoiseState: (s) => {
      denoiseReady.value = s.ready;
    },
    onLtas: (snap) => {
      store.setLtas(snap);
    },
  });
  setAudioGraph?.(g);
  try {
    await g.start({
      deviceId: selectedDeviceId.value || undefined,
      settings: settings.value,
      denoiseEnabled: denoiseEnabled.value,
    });
    const sr = g.getSampleRate();
    if (sr) store.sampleRate = sr;
    store.status = 'running';
    await refreshDevices(); // labels available after permission grant
  } catch (e) {
    store.errorMessage = e instanceof Error ? e.message : String(e);
    store.status = 'error';
    await g.stop();
    setAudioGraph?.(null);
  }
}

async function stop(): Promise<void> {
  const g = currentGraph();
  await g?.stop();
  setAudioGraph?.(null);
  denoiseReady.value = false;
  store.status = 'idle';
}

function toggleDenoise(): void {
  denoiseEnabled.value = !denoiseEnabled.value;
  currentGraph()?.setDenoise(denoiseEnabled.value);
}

onMounted(() => {
  void refreshDevices();
});

onUnmounted(() => {
  void currentGraph()?.stop();
});
</script>

<template>
  <div class="mic-control">
    <button v-if="status !== 'running' && status !== 'starting'" @click="start">
      Start
    </button>
    <button v-else @click="stop">Stop</button>

    <select v-model="selectedDeviceId" :disabled="status === 'running'">
      <option value="">既定の入力デバイス</option>
      <option v-for="d in devices" :key="d.deviceId" :value="d.deviceId">
        {{ d.label || `入力 (${d.deviceId.slice(0, 6)})` }}
      </option>
    </select>

    <label class="denoise">
      <input
        type="checkbox"
        :checked="denoiseEnabled"
        @change="toggleDenoise"
      />
      <span>デノイズ (RNNoise)</span>
      <span v-if="status === 'running' && !denoiseReady" class="muted">
        (読込中…)
      </span>
    </label>

    <span class="status mono">
      {{
        status === 'running'
          ? `稼働中 / ${store.sampleRate} Hz`
          : status === 'starting'
            ? '起動中…'
            : status === 'error'
              ? 'エラー'
              : '停止中'
      }}
    </span>
    <span v-if="errorMessage" class="err mono">{{ errorMessage }}</span>
  </div>
</template>

<style scoped>
.mic-control {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.denoise {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.status {
  color: #8b949e;
  font-size: 13px;
}
.err {
  color: #f85149;
  font-size: 13px;
}
</style>
