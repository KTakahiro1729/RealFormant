# CLAUDE.md

このファイルは [Claude Code](https://docs.claude.com/claude-code) がこのリポジトリで作業する際のガイダンスです。

## プロジェクト概要

**RealFormant** はマイク入力をブラウザでリアルタイム解析する SPA。対数周波数軸のスペクトル上に LPC 包絡・F0 倍音線・F1-F4 マーカー・シンガーズフォルマント帯・LTAS を重畳し、声質指標 (H1-H2、スペクトル傾斜、SPR) を表示する。RNNoise (WASM) でノイズ抑制。GitHub Pages デプロイ。

## コマンド

```bash
npm install
npm run dev          # Vite 開発サーバー (http://127.0.0.1:5173/RealFormant/)
npm run typecheck    # vue-tsc --noEmit
npm run build        # 型チェック + プロダクションビルド
npm run preview      # ビルド成果物のプレビュー
```

## アーキテクチャ

### 音声パイプライン

```
getUserMedia (48kHz, AGC/NS/EC=off)
  → MediaStreamSource
  → AudioWorklet "frame-extractor"   (480-sample chunks; src/workers/worklets/)
  → Web Worker "analysis.worker"     (src/workers/analysis.worker.ts)
       ├ RNNoise (WASM) で 480-sample フレーム単位にデノイズ
       ├ ring buffer に蓄積し、hopSize ごとに最新 fftSize サンプルを抽出
       ├ Hann 窓 + pre-emphasis + FFT → 表示スペクトル
       ├ 16kHz ダウンサンプル → Levinson-Durbin LPC → Durand-Kerner 根抽出 → F1-F4
       ├ YIN (元 48kHz サンプル) で F0
       └ H1-H2 / spectral slope / SPR + LTAS 累積
  → postMessage(AnalysisFrame) → Pinia store → Canvas2D 描画 (rAF, 60fps)
```

`SharedArrayBuffer` は **使わない**。GitHub Pages では COOP/COEP ヘッダを送れないため。`postMessage` の transferable Float32Array で十分。

### 設計上の重要な決定

- **AudioWorklet 内では RNNoise WASM を実行しない**: `@shiguredo/rnnoise-wasm` の Emscripten ビルドが `window` か `WorkerGlobalScope` の存在を要求するため、AudioWorkletGlobalScope では動かない。Worker 側で実行する。
- **AudioWorklet は 480 サンプルチャンクを送るだけ**にし、解析フレームの切出し・オーバーラップは Worker のリングバッファで行う。これにより RNNoise の入力が連続する。
- **大きな配列はリアクティブ化しない**: スペクトル等の `Float32Array` は `shallowRef` + `markRaw` で保持し、Vue が深く走査しないようにする (`src/stores/analysisStore.ts`)。
- **AudioGraph はアプリで 1 つだけ**: `App.vue` で `provide('audioGraph', ref)` し、子コンポーネントは `inject` で参照する。

### ディレクトリ

```
src/
├── App.vue                              ルートレイアウト + AudioGraph 提供
├── audio/                               純粋 DSP モジュール (Worker から import)
│   ├── AudioGraph.ts                    ★ パイプライン組立 (メインスレッド)
│   ├── fft.ts                           fft.js のラッパー (RealFFT)
│   ├── windowing.ts                     Hann + pre-emphasis
│   ├── lpc.ts                           Levinson-Durbin + Durand-Kerner
│   ├── formants.ts                      根 → F1-F4 (帯域 / 順序フィルタ)
│   ├── yin.ts                           F0 検出
│   ├── voiceQuality.ts                  H1-H2 / slope / SPR
│   ├── ltas.ts                          長時間平均スペクトル
│   └── resample.ts                      Decimator (48k → 16k)
├── workers/
│   ├── analysis.worker.ts               ★ DSP 集約点
│   └── worklets/
│       └── frame-extractor-processor.ts AudioWorkletProcessor
├── components/                          Vue SFC
│   ├── MicControl.vue                   開始/停止 / デバイス選択 / デノイズトグル
│   ├── SpectrumView.vue                 ★ 主可視化 (Canvas2D の重畳)
│   ├── FormantReadout.vue               F0 / F1-F4 数値
│   ├── VoiceQualityMeters.vue           声質バー
│   ├── LtasPanel.vue                    LTAS の蓄積/リセット
│   └── Settings.vue                     FFT/ホップ/LPC/F0/表示帯域の調整
├── stores/analysisStore.ts              Pinia (latestFrame, settings, LTAS)
└── types/analysis.ts                    AnalysisFrame / AnalysisSettings + defaults
```

## 開発の指針

- **Worker と worklet のインポート構文は守る**: `?worker` (Web Worker) と `?worker&url` (AudioWorklet 用 URL) を使い分けている。`AudioGraph.ts` の冒頭参照。
- **Float32Array の transfer**: TypeScript 5.7 の strict 設定では `Float32Array.buffer` が `ArrayBufferLike` 型になる。`postMessage` の transferable リストには `buffer as ArrayBuffer` でキャストする。
- **`vite.config.ts` の `base: '/RealFormant/'`**: GitHub Pages サブパス用。WASM や静的アセットへのパスは `import.meta.env.BASE_URL` 経由で組み立てる。
- **メーター/可視化のレンジ変更**: `VoiceQualityMeters.vue` の `meters` 配列、`SpectrumView.vue` の表示色などは `src/types/analysis.ts` の `defaultSettings` に依存しない箇所もあるため、変更時は両方を確認。
- **デノイザーが ON にできない場合**: Rnnoise.load が失敗すると `denoiseError` メッセージが Worker から飛ぶ。UI 上は「読込中…」のまま。原因は WASM 配信エラー (CSP / mime-type) か Emscripten ビルドのスコープチェック。

## 検証ノート

- 「あ/い/う/え/お」発声で F1/F2 が母音空間内 (男性目安: a 730/1090, i 270/2290, u 300/870, e 530/1840, o 570/840) を動くか
- 440 Hz 純音を再生して F0 ≈ 440、倍音線が 880/1320/1760 Hz と一致するか
- ホワイトノイズ重畳でデノイズ ON/OFF の差を確認
- 持続母音 30 秒 → LTAS が安定形を示し、リセットで初期化されるか

ブラウザは Chrome / Firefox / Safari (14.1+) で動作。HTTPS 必須 (Pages は OK)。

## CI/CD

- `.github/workflows/ci.yml`: PR と main プッシュで `npm run typecheck` と `npm run build` を実行
- `.github/workflows/deploy.yml`: main プッシュで `actions/deploy-pages` 経由で GitHub Pages へ公開

リポジトリ Settings → Pages → Source を **GitHub Actions** に設定する必要あり。
