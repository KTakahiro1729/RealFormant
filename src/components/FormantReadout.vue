<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useAnalysisStore } from '../stores/analysisStore';

const store = useAnalysisStore();
const { latestFrame } = storeToRefs(store);

const f0Text = computed(() => {
  const f = latestFrame.value?.f0;
  return f ? `${f.toFixed(1)} Hz` : '—';
});

const formantRows = computed(() => {
  const fs = latestFrame.value?.formants ?? [];
  const rows: { label: string; freq: string; bw: string }[] = [];
  for (let i = 0; i < 4; i++) {
    const f = fs[i];
    rows.push({
      label: `F${i + 1}`,
      freq: f ? `${f.frequency.toFixed(0)} Hz` : '—',
      bw: f ? `${f.bandwidth.toFixed(0)} Hz` : '—',
    });
  }
  return rows;
});
</script>

<template>
  <div class="readout">
    <div class="block">
      <div class="label">F0</div>
      <div class="value mono">{{ f0Text }}</div>
    </div>
    <table class="formants mono">
      <thead>
        <tr>
          <th></th>
          <th>Frequency</th>
          <th>BW</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in formantRows" :key="row.label">
          <td>{{ row.label }}</td>
          <td>{{ row.freq }}</td>
          <td class="muted">{{ row.bw }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.readout {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.block {
  background: #0e1116;
  border: 1px solid #1f242c;
  border-radius: 6px;
  padding: 8px 10px;
}
.label {
  font-size: 11px;
  color: #8b949e;
  text-transform: uppercase;
}
.value {
  font-size: 24px;
  margin-top: 2px;
}
.formants {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.formants th,
.formants td {
  text-align: left;
  padding: 4px 6px;
  border-bottom: 1px solid #1f242c;
}
.formants th {
  color: #8b949e;
  font-weight: normal;
  font-size: 11px;
}
</style>
