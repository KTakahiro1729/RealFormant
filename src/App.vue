<script setup lang="ts">
import { onUnmounted, provide, ref } from 'vue';
import MicControl from './components/MicControl.vue';
import SpectrumView from './components/SpectrumView.vue';
import FormantReadout from './components/FormantReadout.vue';
import VoiceQualityMeters from './components/VoiceQualityMeters.vue';
import LtasPanel from './components/LtasPanel.vue';
import Settings from './components/Settings.vue';
import { AudioGraph } from './audio/AudioGraph';
import { useAnalysisStore } from './stores/analysisStore';

const store = useAnalysisStore();
const audioGraph = ref<AudioGraph | null>(null);
provide('audioGraph', audioGraph);

function setGraph(g: AudioGraph | null): void {
  audioGraph.value = g;
}
provide('setAudioGraph', setGraph);

onUnmounted(() => {
  void audioGraph.value?.stop();
  audioGraph.value = null;
});

void store; // referenced by children via Pinia
</script>

<template>
  <main class="shell">
    <header>
      <h1>RealFormant</h1>
      <p class="muted">リアルタイム声質・フォルマント解析</p>
    </header>
    <MicControl class="bar" />
    <section class="grid">
      <div class="spectrum-cell">
        <SpectrumView />
      </div>
      <aside class="sidebar">
        <FormantReadout />
        <VoiceQualityMeters />
        <LtasPanel />
        <Settings />
      </aside>
    </section>
  </main>
</template>

<style scoped>
.shell {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}
h1 {
  margin: 0;
  font-size: 22px;
}
.bar {
  background: #161b22;
  border: 1px solid #1f242c;
  border-radius: 8px;
  padding: 10px 12px;
}
.grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 12px;
  min-height: 360px;
}
.spectrum-cell {
  min-height: 360px;
}
.sidebar {
  background: #161b22;
  border: 1px solid #1f242c;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  max-height: calc(100vh - 200px);
}
@media (max-width: 800px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
