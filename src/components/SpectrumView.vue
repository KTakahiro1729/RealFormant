<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useAnalysisStore } from '../stores/analysisStore';

const store = useAnalysisStore();
const { latestFrame, settings, ltasSnapshot } = storeToRefs(store);

const canvasRef = ref<HTMLCanvasElement | null>(null);
let rafId = 0;
let dpr = 1;

function fToX(f: number, width: number, fMin: number, fMax: number): number {
  const lf = Math.log(Math.max(f, fMin));
  const lmin = Math.log(fMin);
  const lmax = Math.log(fMax);
  return ((lf - lmin) / (lmax - lmin)) * width;
}

function dbToY(db: number, height: number, dbMin: number, dbMax: number): number {
  const t = (db - dbMin) / (dbMax - dbMin);
  return height - t * height;
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  fMin: number,
  fMax: number,
  dbMin: number,
  dbMax: number,
): void {
  ctx.fillStyle = '#0e1116';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#1f242c';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#5b6470';
  ctx.font = `${11 * dpr}px ui-monospace, monospace`;

  const ticks = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].filter(
    (f) => f >= fMin && f <= fMax,
  );
  for (const f of ticks) {
    const x = fToX(f, w, fMin, fMax);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
    ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x + 4, h - 4);
  }

  for (let db = dbMax; db >= dbMin; db -= 20) {
    const y = dbToY(db, h, dbMin, dbMax);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.fillText(`${db}`, 4, y - 2);
  }
}

function drawSingersFormantBand(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  fMin: number,
  fMax: number,
): void {
  const x1 = fToX(2500, w, fMin, fMax);
  const x2 = fToX(3500, w, fMin, fMax);
  ctx.fillStyle = 'rgba(245, 197, 66, 0.07)';
  ctx.fillRect(x1, 0, x2 - x1, h);
}

function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  spectrum: Float32Array,
  sampleRate: number,
  fMin: number,
  fMax: number,
  dbMin: number,
  dbMax: number,
  color: string,
  width: number,
): void {
  const N = (spectrum.length - 1) * 2; // FFT size
  const binHz = sampleRate / N;
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  let started = false;

  // Reference scale: peak normalized so 0 dB ≈ FFT-size dependent, but we use
  // 20*log10(mag) directly. With Hann window full-scale sine ≈ N/4. Treat 0 dB
  // as a soft ceiling; clipping is up to dbMax.
  const refScale = N / 4;

  for (let k = 1; k < spectrum.length; k++) {
    const f = k * binHz;
    if (f < fMin) continue;
    if (f > fMax) break;
    const x = fToX(f, w, fMin, fMax);
    const mag = spectrum[k];
    const db = mag > 0 ? 20 * Math.log10(mag / refScale) : dbMin;
    const y = dbToY(Math.max(dbMin, Math.min(dbMax, db)), h, dbMin, dbMax);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
}

function render(): void {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.floor(cssW * dpr);
  const h = Math.floor(cssH * dpr);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;

  const s = settings.value;
  drawGrid(ctx, w, h, s.fMin, s.fMax, s.dbMin, s.dbMax);
  drawSingersFormantBand(ctx, w, h, s.fMin, s.fMax);

  const frame = latestFrame.value;
  if (frame) {
    // Harmonic markers (drawn behind spectrum so they don't dominate).
    if (frame.f0 && frame.f0 > 0) {
      ctx.strokeStyle = 'rgba(126, 231, 135, 0.35)';
      ctx.lineWidth = 1 * dpr;
      const top = h * 0.04;
      for (let n = 1; n * frame.f0 <= s.fMax; n++) {
        const f = n * frame.f0;
        if (f < s.fMin) continue;
        const x = fToX(f, w, s.fMin, s.fMax);
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
    }

    // Raw spectrum (gray).
    drawSpectrum(
      ctx,
      w,
      h,
      frame.spectrum,
      frame.sampleRate,
      s.fMin,
      s.fMax,
      s.dbMin,
      s.dbMax,
      '#9aa4b1',
      1.0 * dpr,
    );

    // LPC envelope (cyan) over the spectrum.
    if (frame.lpcEnvelope) {
      drawSpectrum(
        ctx,
        w,
        h,
        frame.lpcEnvelope,
        frame.sampleRate,
        s.fMin,
        s.fMax,
        s.dbMin,
        s.dbMax,
        '#56d4dd',
        1.8 * dpr,
      );
    }

    // LTAS overlay (orange) over the spectrum if available.
    const ltas = ltasSnapshot.value;
    if (ltas) {
      drawSpectrum(
        ctx,
        w,
        h,
        ltas.spectrum,
        ltas.sampleRate,
        s.fMin,
        s.fMax,
        s.dbMin,
        s.dbMax,
        'rgba(245, 159, 66, 0.85)',
        1.4 * dpr,
      );
    }

    // Formant markers (red ticks at top with labels).
    ctx.fillStyle = '#ff7b72';
    ctx.strokeStyle = '#ff7b72';
    ctx.lineWidth = 1.5 * dpr;
    ctx.font = `bold ${12 * dpr}px ui-monospace, monospace`;
    frame.formants.forEach((fmt, i) => {
      const x = fToX(fmt.frequency, w, s.fMin, s.fMax);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h * 0.04);
      ctx.stroke();
      ctx.fillText(`F${i + 1}`, x + 3 * dpr, 14 * dpr);
    });
  }

  rafId = requestAnimationFrame(render);
}

onMounted(() => {
  rafId = requestAnimationFrame(render);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
});

watch(
  () => [settings.value.fMin, settings.value.fMax, settings.value.dbMin, settings.value.dbMax],
  () => {
    // Trigger redraw on settings change; rAF picks it up automatically.
  },
);
</script>

<template>
  <div class="spectrum-wrap">
    <canvas ref="canvasRef" />
  </div>
</template>

<style scoped>
.spectrum-wrap {
  width: 100%;
  height: 100%;
  background: #0e1116;
  border: 1px solid #1f242c;
  border-radius: 8px;
  overflow: hidden;
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
