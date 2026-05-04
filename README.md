# RealFormant

リアルタイムでマイク入力を解析する Web アプリ。対数周波数軸のスペクトル上にフォルマント・倍音・LPC スペクトル包絡を重畳し、声質指標 (H1−H2、スペクトル傾斜、シンガーズ・フォルマント比) と LTAS をブラウザだけで可視化します。RNNoise (WebAssembly) によるノイズ抑制でクリアな解析を提供します。

## 機能

- マイク → AudioWorklet → Worker のリアルタイム解析パイプライン (遅延 ~40-50 ms)
- 対数 X 軸 / dB Y 軸のスペクトル表示
- LPC (Levinson-Durbin) によるスペクトル包絡と F1-F4 推定
- YIN による F0 検出と倍音マーカー
- シンガーズ・フォルマント帯 (2.5-3.5 kHz) のハイライト
- 声質メーター (H1-H2 / spectral slope / singer's formant ratio)
- LTAS (長時間平均スペクトル) 蓄積・重畳
- RNNoise WASM デノイザー (bypass 切替可、A/B 比較用)
- FFT サイズ・ホップ・LPC 次数・F0 範囲・表示帯域の調整

## 開発

```bash
npm install
npm run dev          # http://127.0.0.1:5173/RealFormant/
npm run build        # 型チェック + プロダクションビルド
npm run typecheck
```

## デプロイ

`main` ブランチへ push すると GitHub Actions が `actions/deploy-pages` で公開します。Vite の `base` は `/RealFormant/` を想定しています。

リポジトリ Settings → Pages → Source を **GitHub Actions** に設定してください。

## アーキテクチャ

```
getUserMedia (48 kHz, AGC/NS/EC=off)
  → MediaStreamSource
  → AudioWorklet (frame-extractor)        // 480 サンプル/チャンク
  → Web Worker (analysis.worker)
       ├ RNNoise (WASM, 480 サンプル/フレーム)
       ├ ring buffer + hop based frame extraction
       ├ Hann window + pre-emphasis + FFT (表示用スペクトル)
       ├ 16 kHz ダウンサンプル → LPC (Levinson-Durbin) → 根抽出 → F1-F4
       ├ YIN (48 kHz, 70-1000 Hz)
       ├ H1-H2 / spectral slope / SPR
       └ LTAS 蓄積
  → postMessage(AnalysisFrame) → Pinia store → Canvas2D 描画 (rAF)
```

GitHub Pages では COOP/COEP を設定できないため SharedArrayBuffer は使わず、`postMessage` の transferable で十分なスループットを得ています。

## ブラウザ要件

- AudioWorklet 対応 (Chrome 66+, Safari 14.1+, Firefox 76+)
- WebAssembly + ES module worker 対応
- HTTPS (マイク入力に必要 / GitHub Pages は自動)

## 検証メモ

- 「あ/い/う/え/お」発声 → F1/F2 が母音空間内で動く
- 440 Hz 純音再生 → F0 ≈ 440、倍音線が 880/1320/1760 Hz と一致
- ホワイトノイズ重畳 → デノイズ ON で 1 kHz 以上が大きく減衰
- 持続母音 30 秒 → LTAS が安定したスペクトル形を示す

## ライセンス

MIT
