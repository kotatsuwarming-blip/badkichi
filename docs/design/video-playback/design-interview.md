# video-playback 設計ヒアリング記録

**作成日**: 2026-06-01
**ヒアリング実施**: step4 既存情報ベースの差分ヒアリング

## ヒアリング目的

要件定義（requirements.md）が黄信号潰し済みで 🔵 100% であったため、設計フェーズで残る論点は **Vue/Nuxt の技術的実装パターン**が中心だった。memory `feedback_claude_lead_with_pros_cons`（お任せモード: Claude が一般・技術決定を主導し pros/cons で根拠提示、UX/構造波及の重要決定のみユーザ確認）に従い、**ユーザーへの追加質問は行わず**、技術決定を Claude が主導して本記録に根拠を残した。memory `user_role`（Web 開発初学者）も踏まえ、深い Vue 内部仕様の選択をユーザーに委ねない判断とした。

## 設計決定（Claude 主導）

### D1: 統一化の方式 = アダプタ（Strategy）パターン 🔵

**カテゴリ**: アーキテクチャ
**背景**: YouTube（非同期 SDK + iframe）と HTML5（同期的な `HTMLVideoElement`）は API 形状が大きく異なる。両者を統一インターフェースに収める方式の選択。

**検討**:
| 案 | pros | cons |
|---|---|---|
| 条件分岐を各所に散らす | 実装が少ない | 種別追加のたびに全箇所修正、テスト困難 |
| **アダプタパターン（採用）** | 種別追加 = アダプタ追加のみ。各アダプタを独立テスト可能 | クラス/契約が 1 段増える |

**決定**: `VideoPlayerControls` 契約 + `YouTubeAdapter` / `Html5Adapter` の 2 実装。PRD 保守性 NFR「YouTube / ローカル / クラウドを切り替え可能な設計」に合致（ADR-002 §F-02 分割の趣旨）。

### D2: 公開形態 = composable + 薄い client-only コンポーネント 🔵

**カテゴリ**: アーキテクチャ / 技術選択
**背景**: 上位は (a)「打った」ボタンで**命令的に現在時刻取得**、(b) 進捗バー等で**リアクティブに状態表示**の両方を必要とする。プレーヤーは DOM 要素（iframe/video）に束ねる必要がある。

**検討**:
| 案 | pros | cons |
|---|---|---|
| コンポーネント単体 + `defineExpose` | Vue 標準 | 親へ**リアクティブ状態**を渡しにくい（命令的取得のみ） |
| **composable `useVideoPlayer` + 薄い `VideoPlayer.client.vue`（採用）** | リアクティブ状態(state)と命令的 API(controls)を両立。ADR-007 の composable 中心方針に合致。状態ロジックを単体テストしやすい | 要素バインドを attach/detach で受け渡す設計が必要 |

**決定**: `useVideoPlayer(source)` が `{ state, controls, attach, detach }` を返す。`VideoPlayer.client.vue` は `onMounted` で `attach(el)`、`onBeforeUnmount` で `detach()` を呼ぶだけの薄い層。

### D3: SSR/CSR 境界 = `.client.vue`（client-only コンポーネント） 🔵

**カテゴリ**: アーキテクチャ
**背景**: プレーヤーはブラウザ専用 API 依存の UI。ADR-010 D3 は `onMounted` 内のブラウザ専用 API 登録を許可し、`<ClientOnly>` は「最後の手段」とする。

**決定**: `VideoPlayer.client.vue`（`.client` サフィックス）で client-only 描画。`<ClientOnly>` ラップは使わず Nuxt のコンポーネント機構を用いる（ADR-010 が許容する「SSR で評価できない要素のみ client 限定」に合致）。ローディング体裁は fallback で担保（REQ-202 / NFR-202）。

### D4: 時刻取得 = ポーリング不要・同期、UI 進捗は rAF で分離 🔵

**カテゴリ**: パフォーマンス
**背景**: NFR-001（ボタン押下→記録 100ms 以内）。`setInterval` 監視は遅延・ジッタの原因になりうる。

**決定**: `getCurrentTimeMs()` は呼び出し時にアダプタから即時取得し `Math.round(sec*1000)` を返す（記録経路）。UI 進捗表示用の `currentTimeMs` は再生中のみ `requestAnimationFrame` で更新し、記録経路と分離。秒 float → ms integer 変換は B-14（float 等値比較回避）に準拠。

### D5: シーク範囲・未ロード契約 = クランプ / null 🔵

**カテゴリ**: データモデル（契約）
**決定**: `seekToMs` は `clampMs(ms, durationMs)` で [0, duration] にクランプ（REQ-104）。`getCurrentTimeMs` は未ロード時 `null`（REQ-201、NaN・負値を返さない）。両者を純関数 `clampMs` / アダプタ契約で明文化。

### D6: エラー = カテゴリ D、const コード + locale JSON 🔵

**カテゴリ**: エラーハンドリング
**背景**: cross-cutting/error-handling の発生源カテゴリ D（外部 API/SDK）。

**決定**: `VideoPlayerError { code, messageKey }`。`VideoPlayerErrorCode` を const union で集約（生文字列比較禁止＝原則3）、文言は locale JSON（コードに文字列リテラル禁止＝原則5）。提示は決定木に従いプレーヤー領域内 inline/banner、再生不可は別動画指定の導線を併設。

### D7: YouTube IFrame API スクリプト = 初回 1 回だけ注入してキャッシュ 🔵

**カテゴリ**: 技術選択
**決定**: `youtube-api-loader.ts` が `https://www.youtube.com/iframe_api` を初回利用時に一度だけ注入し、`window.onYouTubeIframeAPIReady` を Promise 化。複数プレーヤーでも 1 回（API キー不要）。

### D8: 「打った痕跡」のフィードバック境界 = コントロール + 汎用スロット 🔵

**カテゴリ**: アーキテクチャ（責務境界・依存方向）
**背景**: ユーザーから「match-recording に依存する可能性がある。打ったと記録したことがわかるようにする必要がありそう」との指摘（2026-06-01）。記録確認フィードバックは必要だが、video-playback が match-recording のドメイン（ショット）を知ると依存方向が逆流し循環依存になる（ADR-002 は match-recording → video-playback の一方向）。

**フィードバックの分解**:
- ① 押下直後の記録確認（「記録しました」）= match-recording の責務（ボタン・DB 保存・rule-engine 連携を持つ）。
- ② タイムライン上のショットマーカー = データは match-recording、表示場所はプレーヤー上。

**検討した案**:
| 案 | pros | cons |
|---|---|---|
| **コントロール + 汎用スロット（採用）** | プレーヤーは再生面+標準コントロール+`timeline`/`overlay` スロットを提供。上位がショット/ラリーを描画。video-playback はドメイン非依存のまま、stats-dashboard も再利用。依存方向維持 | スロット設計が要る |
| 汎用 markers prop | 上位は ms 一覧を渡すだけ | プレーヤーが「マーカー」概念を持つ。記録フラッシュ等の自由演出が苦手 |
| ヘッドレス（再生面のみ） | 最大限汎用 | コントロール UI を各画面で再実装、REQ-003 の趣旨が弱まる |

**決定**: コントロール + 汎用スロット。video-playback は `durationMs`/`currentTimeMs`/`status` を slot props として渡すのみで、スロットの中身（ショット/ラリー）を知らない（REQ-405）。記録確認フラッシュ（REQ-406）とマーカーは match-recording が `overlay`/`timeline` スロットに描画。これにより**依存方向は match-recording → video-playback の一方向を維持**し、ユーザーが懸念した循環依存を回避。要件に REQ-008/009/405/406 を追加。

**信頼性への影響**: 「記録フィードバック」という新たな関心事を、要件・設計の両面で 🔵 として確定。video-playback の責務境界が明確化。

## ヒアリング結果サマリー

### 確認できた事項
- 要件は 🔵 100% のため、設計は技術パターンの確定が主作業。

### 設計方針の決定事項
- D1〜D8（上記）。アダプタパターン + composable/薄コンポーネント + CSR 限定 + ms 同期取得 + クランプ/null 契約 + カテゴリ D エラー + IFrame script 1 回注入 + コントロール&汎用スロット（記録フィードバックの責務境界）。

### 残課題（kairo-tasks / 実装で確定）
- 型定義ファイルの最終配置（`app/types/video-playback.ts` か unit 内 `types.ts`）。
- `PlayerEvent` の最小集合の実装確定（現状 statuschange/durationchange/error/ended）。
- YouTube `onError` コード（2/5/100/101/150）の文言マッピング詳細。

### 信頼性レベル分布

**設計前（要件のみ）**: 要件 🔵 100%、設計は未定。

**設計後**: architecture / dataflow / interfaces のすべての設計判断が ADR・error-handling・PRD・確定要件に接地。🟡 は型配置と PlayerEvent 集合の 2 点（実装時調整）のみ、🔴 はゼロ。

## 関連文書

- **アーキテクチャ設計**: [architecture.md](architecture.md)
- **データフロー**: [dataflow.md](dataflow.md)
- **型定義**: [interfaces.ts](interfaces.ts)
- **要件定義**: [requirements.md](../../spec/video-playback/requirements.md)
