# video-playback コンテキストノート

**作成日**: 2026-06-01

## ユニットの位置付け（ADR-002）

- ADR-002 で MVP を 7 単位に分割。video-playback は #5、依存ゼロの独立ユニット。
- F-02（動画再生 + データ入力）から「動画再生」基盤のみを切り出したもの。残りの入力 UI は match-recording が担う。
- 録画（match-recording）と統計（stats-dashboard）の両方から再利用される共通抽象。
- **DB・認証・他ユニットに非依存** → data-foundation の完了を待たず並行で spec→設計→実装が可能。

## 技術スタック

- Nuxt 4 (Vue 3) + Nuxt UI + TypeScript（strict）、`<script setup lang="ts">` / Composition API
- 動画 API:
  - **YouTube IFrame Player API**（YouTube 再生）— **API キー不要**（Data API ではない）
  - **HTML5 Video API**（ローカル動画再生）
- 実装形態: composable（`useVideoPlayer` 等、命名は ADR-007 に従い kairo-design で確定）

## 関連する設計判断（ADR / 設計文書）

- **ADR-002 Q1**: F-02 を video-playback と match-recording に分割。動画プレーヤーは黒箱として扱う。
- **ADR-002 Q4**: PositionOverride / 録画断絶などの「記録」は match-recording の責務。video-playback は再生制御のみ。
- **ADR-010 (SSR/CSR 境界)**: ブラウザ専用 API はクライアントサイドのみ初期化（プレーヤーは CSR 限定）。
- **ADR-007 (composable 命名規約)**: page から直接 API を呼ばず composable 経由。
- **cross-cutting/error-handling.md**: video-playback はエラー発生源カテゴリ **D（外部 API/SDK: YouTube IFrame ロード失敗、HTML5 video エラー）** に明記。識別子は const 集約、文言は locale JSON。

## data-foundation との接点（型・スキーマ）

video-playback は DB を触らないが、上位ユニットが渡す値の型は data-foundation スキーマに整合させる:

- `matches.video_source_type`: `'youtube' | 'local'`（CHECK 制約）
- `matches.video_source_url`: `text NOT NULL`（YouTube URL またはローカルファイル名/パス）
- `rallies.video_start_timestamp_ms`: `integer`（ms 単位）
- `shots.video_timestamp_ms`: `integer`（ms 単位、NULL 許容）
- **B-14 決定**: 動画タイムスタンプは float の等値比較を避けるため **ms 単位 integer**。→ プレーヤーの現在時刻取得・シーク API も **ms 単位**で統一する。
- `recording_gaps`: 動画断絶イベント（match-recording の責務、video-playback はスコープ外）。

## 確定済みの主要決定（ヒアリング 2026-06-01）

- ローカル動画の更新後復元 = **方式 A（再選択）**。全ブラウザ対応・実装最小。長時間記録は YouTube 推奨の UX 誘導を添える。
- 速度プリセット = 0.5/0.75/1.0/1.25/1.5/2.0 倍（🔵 ユーザ決定 2026-06-01）。
- アクセシビリティ = キーボード操作可能 + Nuxt UI 標準 a11y（スクリーンリーダ最適化は MVP 外、🔵 ユーザ決定 2026-06-01）。
- 黄信号潰し（2026-06-01）: 速度/a11y はユーザ決定、duration/状態取得・シーククランプ([0,duration])・未ロード契約(現在時刻 null/シーク no-op)・即時反映 NFR・URL 検証・バッファ提示は設計決定で確定。spec の 🟡 はゼロ（受入基準 🔵 100%）。
- コマ送り（frame-step）・クラウド動画 = MVP 対象外。
- recording_gaps = スコープ外（match-recording）。

## 注意事項

- YouTube IFrame API は秒単位 float で時刻を返すため、ms 整数へ変換する境界処理が必要（B-14 整合）。
- YouTube は埋め込み無効・広告・モバイル autoplay 制約があり、frame 精度の時刻は取れない → 精度は ms ボタンタイミングに依存（コマ送りは MVP 外）。
- ローカル動画のオブジェクト URL はセッション跨ぎで失効 → 再選択フロー（REQ-103）。
