# video-playback アーキテクチャ設計

**作成日**: 2026-06-01
**関連要件定義**: [requirements.md](../../spec/video-playback/requirements.md)
**ヒアリング記録**: [design-interview.md](design-interview.md)

**【信頼性レベル凡例】**:
- 🔵 **青信号**: EARS要件定義書・設計文書・ADR・ユーザヒアリングを参考にした確実な設計
- 🟡 **黄信号**: 妥当な推測による設計
- 🔴 **赤信号**: 上記資料にない推測による設計

---

## システム概要 🔵

**信頼性**: 🔵 *requirements.md 概要 / ADR-002*

video-playback は、YouTube（IFrame Player API）とローカル動画（HTML5 Video API）を**ソース種別に依らない統一インターフェース**で再生制御するクライアントサイドの動画プレーヤー抽象。DB・バックエンド API・他ユニットに非依存で、match-recording / stats-dashboard が再利用する。本ユニットの責務は「単一ソースの連続再生制御 + ms 単位の現在時刻取得 / 指定位置シーク」に限定される（録画断絶 `recording_gaps` の検出・記録は match-recording の責務、ADR-002 Q4）。

## アーキテクチャパターン 🔵

**信頼性**: 🔵 *PRD 保守性 NFR「動画ストレージの抽象化」/ ADR-002 §F-02 分割 / GoF Strategy*

- **パターン**: アダプタ（Strategy）パターン + composable ファサード
- **選択理由**: YouTube と HTML5 は API 形状が大きく異なる（前者は非同期 SDK + iframe、後者は同期的な `HTMLVideoElement`）。両者を共通の `VideoPlayerControls` 契約に適合させる**アダプタ**を 2 実装用意し、上位は種別を意識せず同一インターフェースで操作する。新ソース（将来のクラウド動画）はアダプタ追加だけで対応でき、PRD の「YouTube / ローカル / クラウドを切り替え可能な設計」を満たす。

```
上位ユニット (match-recording / stats-dashboard)
        │  useVideoPlayer(source) → { state, controls }
        ▼
┌─────────────────────────────────────────┐
│ useVideoPlayer (composable / ファサード)   │  リアクティブ状態 + 制御メソッドを集約
└───────────────┬─────────────────────────┘
                │ 種別で実装を選択
        ┌───────┴────────┐
        ▼                ▼
 YouTubeAdapter     Html5Adapter      ← VideoPlayerControls を実装
 (IFrame API)       (HTMLVideoElement)
        ▲                ▲
        │ mount(el) / destroy()
┌───────┴────────────────────────────┐
│ VideoPlayer.client.vue              │  DOM 要素を描画し onMounted でアダプタを束ねる
└─────────────────────────────────────┘
```

## コンポーネント構成

### フロントエンド 🔵

**信頼性**: 🔵 *CLAUDE.md 技術スタック / ADR-007 / ADR-010*

- **フレームワーク**: Nuxt 4 (Vue 3) + `<script setup lang="ts">` / Composition API
- **UI**: Nuxt UI（再生コントロールのボタン等）
- **状態管理**: composable 内の `ref` / `reactive`（外部ストア不要。プレーヤー状態は単一コンポーネント寿命に閉じる）
- **構成要素**:
  | 要素 | 役割 | 配置 |
  |---|---|---|
  | `useVideoPlayer(source)` | ファサード composable。状態 + 制御を返す | `app/composables/useVideoPlayer.ts` |
  | `VideoPlayer.client.vue` | 動画要素 + 標準コントロール UI（再生/シーク/速度/時刻表示）を描画し、アダプタを DOM に束ねる client-only コンポーネント。`timeline` / `overlay` の汎用スロットを提供 | `app/components/VideoPlayer.client.vue` |
  | `YouTubeAdapter` / `Html5Adapter` | 各 API を `VideoPlayerControls` に適合 | `app/utils/video-playback/` |
  | `extractYouTubeId` / `clampMs` | 純関数ヘルパー（単体テスト容易） | `app/utils/video-playback/` |
  | 型定義 | `VideoSource` / `PlayerStatus` 等 | `app/types/` または unit 内 `types.ts` |

### バックエンド

**該当なし** 🔵 *requirements.md REQ-401（CSR 限定）/ ADR-002*。本ユニットはバックエンド API を持たず、外部は YouTube IFrame API（**API キー不要**）と HTML5 Video API のみ。`database-schema.sql` / `api-endpoints.md` は生成しない。

### データベース

**該当なし** 🔵 *requirements.md REQ-404*。DB を一切触らない。上位が渡す値の型のみ data-foundation スキーマ（`video_source_type` / `*_ms`）と整合させる。

## 責務境界とオーバーレイ（依存方向の維持） 🔵

**信頼性**: 🔵 *requirements.md REQ-008/009/405/406 / ユーザヒアリング 2026-06-01 / ADR-002 依存関係*

「打ったと記録したことがわかる」フィードバックを、依存方向（match-recording → video-playback の一方向）を壊さずに実現するための境界設計。

- **video-playback が提供するもの（ドメイン非依存）**:
  - 再生面 + 標準コントロール UI（REQ-008）
  - リアクティブ状態 `durationMs` / `currentTimeMs` / `status`
  - 汎用オーバーレイスロット 2 種（REQ-009）:
    - `timeline`: シークバー上に絶対配置される層（スロット props で位置算出: `left = ms / durationMs`）
    - `overlay`: 再生面上の層
  - video-playback は**「ショット」「ラリー」を一切知らない**（REQ-405）。スロットの中身に依存しない。
- **match-recording が乗せるもの（video-playback に依存）**:
  - ① 押下直後の記録確認フラッシュ（REQ-406）→ `overlay` スロット
  - ② 記録済みショットのマーカー（ショット ms 一覧を保持）→ `timeline` スロット
- **stats-dashboard**: 同じ `timeline` スロットにラリー区切りを描画して再利用。

```
match-recording                    video-playback
┌──────────────────────┐           ┌─────────────────────────────┐
│ shots: {ms}[]         │  渡す     │ <VideoPlayer :player>        │
│ 「打った」ボタン       │ ───────▶ │   再生面 + コントロール        │
│ controls.getCurrentTimeMs()       │   #timeline スロット ◀── マーカー描画
│ 記録フラッシュ          │           │   #overlay  スロット ◀── フラッシュ描画
└──────────────────────┘           │   (durationMs/currentTimeMs を slot props で渡す)
            ▲                       └─────────────────────────────┘
            │ 依存は一方向のみ（循環なし）
```

**コンポーネントへの player 受け渡し**: 親が `const player = useVideoPlayer(source)` を生成し `<VideoPlayer :player="player">` に渡す。親は `player.state`（リアクティブ）と `player.controls`（命令的）を直接保持し、コンポーネントは `onMounted` で `player.attach(el)` / `onBeforeUnmount` で `player.detach()` を呼ぶ薄い描画層に徹する。

## 命名規約（ADR-007 準拠） 🔵

**信頼性**: 🔵 *ADR-007 D1*

- composable: `useVideoPlayer`（名詞形。プレーヤー実体を表す。`useVideoPlayerService` 等の接尾辞は禁止）
- アダプタ: `YouTubeAdapter` / `Html5Adapter`（クラスまたはファクトリ関数。`use*` ではない＝Vue composable ではないため）
- 純関数: `extractYouTubeId(url)` / `clampMs(ms, durationMs)`

## SSR / CSR 境界 🔵

**信頼性**: 🔵 *ADR-010 D3 / requirements.md REQ-401*

- プレーヤーは `HTMLIFrameElement` / `HTMLVideoElement` と外部 SDK に依存する**ブラウザ専用 UI**。ADR-010 D3 が `import.meta.client` / `onMounted` 限定登録を許可する典型ケース。
- **`VideoPlayer.client.vue`**（`.client` サフィックス）で client-only 描画とする。ADR-010 が「最後の手段」とする `<ClientOnly>` ラップは使わず、Nuxt の client-only コンポーネント機構を用いる（SSR で評価できない要素のみに限定する原則に合致）。
- アダプタの `mount(el)` は `onMounted` 内で呼び、SDK スクリプト注入・iframe 生成を client 側に閉じる。
- ローディング中の体裁は `VideoPlayer.client.vue` の fallback スロット / ローディング UI で担保（REQ-202 / NFR-202）。

## 非機能要件の実現方法

### パフォーマンス 🔵

**信頼性**: 🔵 *requirements.md NFR-001 / NFR-002 / REQ-202*

- **現在時刻取得はポーリング不要・同期**: `getCurrentTimeMs()` は呼び出し時にアダプタから即時取得（YouTube: `player.getCurrentTime()`、HTML5: `video.currentTime`）して `Math.round(sec * 1000)` を返す。`setInterval` 監視は行わず、「打った」ボタン押下 → 記録が 100ms を超える遅延源にならない（NFR-001）。
- **UI 表示用の進捗更新**は `requestAnimationFrame`（再生中のみ）で `currentTimeMs` を更新し、記録経路（即時取得）と分離する。
- シーク・速度変更・再生/一時停止は各 API のメソッドを直接呼び即時反映（NFR-002）。

### セキュリティ 🔵

**信頼性**: 🔵 *requirements.md NFR-101 / ユーザヒアリング 2026-06-01*

- ローカルファイル参照（`URL.createObjectURL` のオブジェクト URL）はセッション跨ぎで失効。再アクセスには明示的なユーザー操作（再選択）を要する。自動再アクセスは行わない。
- YouTube IFrame は Google ドメインの iframe を埋め込む（API キー不要）。秘匿情報は扱わない。

### アクセシビリティ 🔵

**信頼性**: 🔵 *requirements.md NFR-201 / ユーザ決定 2026-06-01*

- 再生コントロールは Nuxt UI のアクセシブルなコンポーネントで構成し、キーボードで操作可能とする。スクリーンリーダ向けの作り込み（詳細 ARIA ラベル等）は MVP 対象外。

### エラーハンドリング 🔵

**信頼性**: 🔵 *cross-cutting/error-handling カテゴリ D / 設計原則 3・5・7*

- 発生源カテゴリ **D（外部 API/SDK）**。エラーは `VideoPlayerError`（`code` + `messageKey`）で表現し、**識別子は const 集約**（生文字列比較禁止）、**文言は locale JSON**（コードに文字列リテラルを書かない）。
- 提示チャネルは error-handling の決定木に従い、プレーヤー領域内の **inline / banner**（再生不可は別動画指定の導線を併設）。
- 捕捉点:
  | コード | 検知 |
  |---|---|
  | `youtube-invalid-url` | 再生前に `extractYouTubeId` が null（EDGE-002） |
  | `youtube-load-failed` | IFrame `onError`（コード 2/5/100/101/150 = 埋め込み無効・削除・非公開等、EDGE-001） |
  | `local-decode-failed` | `HTMLVideoElement` の `error` イベント（EDGE-003） |
  | `local-reselect-needed` | local ソースで `file` 未提供 / オブジェクト URL 失効（REQ-103） |

## 技術的制約 🔵

**信頼性**: 🔵 *CLAUDE.md / ADR-010 / data-foundation B-14*

- TypeScript strict、Vue SFC `<script setup>`、Composition API のみ（CLAUDE.md）。
- プレーヤー初期化は CSR 限定（ADR-010）。
- 時刻は **ms 単位 integer** で授受（B-14、float 等値比較回避）。YouTube は秒 float を返すため `Math.round(sec*1000)` で変換。
- YouTube IFrame API スクリプト（`https://www.youtube.com/iframe_api`）は**初回利用時に一度だけ注入**し、`window.onYouTubeIframeAPIReady` を Promise 化して以降キャッシュ（複数プレーヤーでも 1 回）。

## ディレクトリ構造 🔵

**信頼性**: 🔵 *既存 app 構造（rule-engine = app/utils 配下）/ ADR-007*

```
app/
├── composables/
│   └── useVideoPlayer.ts            # ファサード composable 🔵
├── components/
│   └── VideoPlayer.client.vue       # client-only 描画 + アダプタ束ね 🔵
├── utils/
│   └── video-playback/
│       ├── youtube-adapter.ts       # YouTubeAdapter 🔵
│       ├── html5-adapter.ts         # Html5Adapter 🔵
│       ├── youtube-api-loader.ts    # IFrame API スクリプト注入(1回) 🔵
│       ├── extract-youtube-id.ts    # 純関数(単体テスト対象) 🔵
│       ├── clamp.ts                 # clampMs 純関数 🔵
│       └── __tests__/               # 純関数・アダプタの単体テスト
└── types/
    └── video-playback.ts            # VideoSource / PlayerStatus 等 🟡(配置は実装時調整)
```

## 関連文書

- **データフロー**: [dataflow.md](dataflow.md)
- **型定義**: [interfaces.ts](interfaces.ts)
- **要件定義**: [requirements.md](../../spec/video-playback/requirements.md)
- **エラー方針**: [cross-cutting/error-handling.md](../cross-cutting/error-handling.md)
- **関連 ADR**: [ADR-002](../../decisions/002-requirements-splitting.md) / [ADR-007](../../decisions/007-composable-naming-conventions.md) / [ADR-010](../../decisions/010-supabase-ssr-csr-boundary.md)

## 信頼性レベルサマリー

- 🔵 青信号: 大多数（要件 🔵 100% を基盤に設計を導出）
- 🟡 黄信号: 1（型定義ファイルの最終配置のみ実装時調整）
- 🔴 赤信号: 0

**品質評価**: 高品質（要件が 🔵 100%、設計判断はすべて ADR・error-handling・PRD に接地）
