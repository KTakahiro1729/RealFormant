<script setup lang="ts">
import { computed, inject, type Ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useAnalysisStore } from '../stores/analysisStore';
import type { AudioGraph } from '../audio/AudioGraph';

const store = useAnalysisStore();
const { ltasAccumulating, ltasSnapshot } = storeToRefs(store);
const graphRef = inject<Ref<AudioGraph | null>>('audioGraph');

const count = computed(() => ltasSnapshot.value?.count ?? 0);

function toggle(): void {
  ltasAccumulating.value = !ltasAccumulating.value;
  graphRef?.value?.setLtasEnabled(ltasAccumulating.value);
  if (!ltasAccumulating.value) store.setLtas(null);
}

function reset(): void {
  graphRef?.value?.resetLtas();
  store.setLtas(null);
}
</script>

<template>
  <div class="ltas">
    <div class="head">
      <span class="title">LTAS (長時間平均スペクトル)</span>
      <span class="frames mono">{{ count }} frames</span>
    </div>
    <div class="actions">
      <button @click="toggle">
        {{ ltasAccumulating ? '停止' : '蓄積開始' }}
      </button>
      <button @click="reset" :disabled="!ltasSnapshot">リセット</button>
    </div>
    <p class="hint muted">
      蓄積中はスペクトル表示にオレンジで重畳されます。声質の比較に。
    </p>
  </div>
</template>

<style scoped>
.ltas {
  background: #0e1116;
  border: 1px solid #1f242c;
  border-radius: 6px;
  padding: 8px 10px;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}
.title {
  font-size: 12px;
  color: #c9d1d9;
}
.frames {
  font-size: 12px;
  color: #8b949e;
}
.actions {
  display: flex;
  gap: 6px;
}
.actions button {
  padding: 4px 10px;
  font-size: 13px;
}
.hint {
  font-size: 11px;
  margin: 8px 0 0;
}
</style>
