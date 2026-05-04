<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useAnalysisStore } from '../stores/analysisStore';

const store = useAnalysisStore();
const { latestFrame } = storeToRefs(store);

interface MeterDef {
  key: 'h1MinusH2Db' | 'spectralSlopeDbPerOct' | 'singersFormantRatioDb';
  label: string;
  unit: string;
  min: number;
  max: number;
  description: string;
}

const meters: MeterDef[] = [
  {
    key: 'h1MinusH2Db',
    label: 'H1−H2',
    unit: 'dB',
    min: -10,
    max: 20,
    description: '+大: 息漏れ/頭声寄り　/　−側: 圧迫/胸声寄り',
  },
  {
    key: 'spectralSlopeDbPerOct',
    label: 'スペクトル傾斜',
    unit: 'dB/oct',
    min: -25,
    max: 0,
    description: '0 に近い: 響き/効率の高い発声　/　大きく負: 弱い/息漏れ',
  },
  {
    key: 'singersFormantRatioDb',
    label: "Singer's Formant 比",
    unit: 'dB',
    min: -50,
    max: 10,
    description: '高い: 2.5–3.5kHz の鳴り (シンガーズフォルマント) が強い',
  },
];

const rows = computed(() => {
  const frame = latestFrame.value;
  return meters.map((m) => {
    const v = frame?.voiceQuality[m.key] ?? null;
    let pct = 0;
    if (v != null && Number.isFinite(v)) {
      pct = ((v - m.min) / (m.max - m.min)) * 100;
      pct = Math.max(0, Math.min(100, pct));
    }
    return {
      ...m,
      value: v,
      text: v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(1)} ${m.unit}`,
      pct,
    };
  });
});
</script>

<template>
  <div class="meters">
    <div v-for="row in rows" :key="row.key" class="meter">
      <div class="row-top">
        <span class="label">{{ row.label }}</span>
        <span class="value mono">{{ row.text }}</span>
      </div>
      <div class="bar-bg">
        <div
          class="bar-fill"
          :style="{ width: row.value == null ? '0%' : `${row.pct}%` }"
        />
      </div>
      <div class="desc">{{ row.description }}</div>
    </div>
  </div>
</template>

<style scoped>
.meters {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.meter {
  background: #0e1116;
  border: 1px solid #1f242c;
  border-radius: 6px;
  padding: 8px 10px;
}
.row-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.label {
  font-size: 12px;
  color: #c9d1d9;
}
.value {
  font-size: 14px;
}
.bar-bg {
  height: 6px;
  background: #161b22;
  border-radius: 3px;
  margin: 6px 0 4px;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #2ea043, #f5c542);
  transition: width 80ms linear;
}
.desc {
  font-size: 11px;
  color: #6e7681;
}
</style>
