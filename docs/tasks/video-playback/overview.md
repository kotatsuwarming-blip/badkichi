# video-playback タスク概要

**作成日**: 2026-06-01
**推定工数**: 61時間
**総タスク数**: 11件

## 関連文書

- **要件定義書**: [📋 requirements.md](../../spec/video-playback/requirements.md)
- **受け入れ基準**: [✅ acceptance-criteria.md](../../spec/video-playback/acceptance-criteria.md)
- **ユーザストーリー**: [📖 user-stories.md](../../spec/video-playback/user-stories.md)
- **設計文書**: [📐 architecture.md](../../design/video-playback/architecture.md)
- **インターフェース定義**: [📝 interfaces.ts](../../design/video-playback/interfaces.ts)
- **データフロー図**: [🔄 dataflow.md](../../design/video-playback/dataflow.md)
- **コンテキストノート**: [📝 note.md](../../spec/video-playback/note.md)

> 本ユニットはバックエンド API・DB を持たない（CSR 限定の動画プレーヤー抽象）。
> そのため `api-endpoints.md` / `database-schema.sql` は生成しない。

## フェーズ構成

| フェーズ | 成果物 | タスク数 | 工数 | ファイル |
|---------|--------|----------|------|----------|
| Phase 1 | 型定義・純関数・APIローダー（基盤） | 4 | 15h | [TASK-0001~0004](#phase-1-基盤レイヤー) |
| Phase 2 | YouTube/HTML5 アダプタ | 2 | 16h | [TASK-0005~0006](#phase-2-アダプタレイヤー) |
| Phase 3 | composable + コンポーネント UI | 4 | 24h | [TASK-0007~0010](#phase-3-composable--ui-レイヤー) |
| Phase 4 | 統合テスト・責務境界レビュー | 1 | 6h | [TASK-0011](#phase-4-統合検証レイヤー) |

## タスク番号管理

**使用済みタスク番号**: TASK-0001 ~ TASK-0011
**次回開始番号**: TASK-0012

## 全体進捗

- [x] Phase 1: 基盤レイヤー
- [x] Phase 2: アダプタレイヤー
- [x] Phase 3: composable + UI レイヤー
- [x] Phase 4: 統合・検証レイヤー

## マイルストーン

- **M1: 基盤完成**: 型契約・純関数（`extractYouTubeId` / `clampMs`）・YouTube API ローダー完了（Phase 1）
- **M2: アダプタ完成**: YouTube / HTML5 を統一 `VideoPlayerAdapter` に適合（Phase 2）
- **M3: UI 完成**: `useVideoPlayer` + `VideoPlayer.client.vue`（コントロール・スロット・エラー/再選択 UI）完了（Phase 3）
- **M4: 統合完了**: 結合フロー検証 + 責務境界（依存一方向）レビュー完了（Phase 4）

---

## Phase 1: 基盤レイヤー

**目標**: DB・UI に依存しない型契約と純関数・外部 API ローダーを確立する
**成果物**: `app/types/video-playback.ts`、`app/utils/video-playback/{extract-youtube-id,clamp,youtube-api-loader}.ts`

### タスク一覧

- [x] [TASK-0001: 型定義配置・定数・ディレクトリ scaffold](TASK-0001.md) - 3h (DIRECT) 🔵
- [x] [TASK-0002: `extractYouTubeId` 純関数](TASK-0002.md) - 4h (TDD) 🔵
- [x] [TASK-0003: `clampMs` 純関数](TASK-0003.md) - 3h (TDD) 🔵
- [x] [TASK-0004: `youtube-api-loader`（1回注入 + Promise キャッシュ）](TASK-0004.md) - 5h (TDD) 🔵

### 依存関係

```
TASK-0001 → TASK-0002
TASK-0001 → TASK-0003
TASK-0001 → TASK-0004
（TASK-0002 / 0003 / 0004 は相互独立 = 並行実行可）
```

---

## Phase 2: アダプタレイヤー

**目標**: ソース種別ごとの外部 API を統一 `VideoPlayerAdapter` 契約に適合させる
**成果物**: `app/utils/video-playback/{html5-adapter,youtube-adapter}.ts`

### タスク一覧

- [x] [TASK-0005: `Html5Adapter`](TASK-0005.md) - 8h (TDD) 🔵
- [x] [TASK-0006: `YouTubeAdapter`](TASK-0006.md) - 8h (TDD) 🔵

### 依存関係

```
TASK-0003 (clampMs) → TASK-0005
TASK-0003 (clampMs) → TASK-0006
TASK-0004 (loader)  → TASK-0006
（TASK-0005 / 0006 は相互独立 = 並行実行可）
```

---

## Phase 3: composable + UI レイヤー

**目標**: アダプタをファサード composable で束ね、再生面 + 標準コントロール + 汎用スロットを描画する
**成果物**: `app/composables/useVideoPlayer.ts`、`app/components/VideoPlayer.client.vue`、`i18n/locales/{en,ja}.json`

### タスク一覧

- [x] [TASK-0007: `useVideoPlayer` composable](TASK-0007.md) - 8h (TDD) 🔵
- [x] [TASK-0008: `VideoPlayer.client.vue` 標準コントロール UI](TASK-0008.md) - 8h (TDD) 🔵
- [x] [TASK-0009: オーバーレイスロット + エラー/再選択 UI](TASK-0009.md) - 6h (TDD) 🔵
- [x] [TASK-0010: エラー文言 locale JSON 追加（en/ja）](TASK-0010.md) - 2h (DIRECT) 🔵

### 依存関係

```
TASK-0005 / TASK-0006 → TASK-0007
TASK-0007 → TASK-0008
TASK-0008 → TASK-0009   （同一 VideoPlayer.client.vue を拡張）
TASK-0010 → TASK-0009   （locale キーをエラー/再選択 UI が参照）
TASK-0001 → TASK-0010
```

---

## Phase 4: 統合・検証レイヤー

**目標**: composable + コンポーネントの結合フローと責務境界（依存一方向）を検証する
**成果物**: `tests/unit/components/VideoPlayer.flow.test.ts`（jsdom/モックの結合テスト）

### タスク一覧

- [x] [TASK-0011: 統合テスト・責務境界レビュー](TASK-0011.md) - 6h (TDD) 🔵

### 依存関係

```
TASK-0007 / TASK-0008 / TASK-0009 / TASK-0010 → TASK-0011
```

---

## 信頼性レベルサマリー

### 全タスク統計

- **総タスク数**: 11件
- 🔵 **青信号**: 11件 (100%)
- 🟡 **黄信号**: 0件 (0%)
- 🔴 **赤信号**: 0件 (0%)

> spec / design が 🔵 100%（要件・受入基準ともユーザ決定・設計決定で確定済み）に接地しているため、
> タスク全体も 🔵。各タスク内の項目レベルでは Nuxt UI 標準 a11y 細部・型ファイル最終配置など
> 数点が 🟡（実装時調整）として残るが、タスク粒度の判定はすべて 🔵。

### フェーズ別信頼性

| フェーズ | 🔵 青 | 🟡 黄 | 🔴 赤 | 合計 |
|---------|-------|-------|-------|------|
| Phase 1 | 4 | 0 | 0 | 4 |
| Phase 2 | 2 | 0 | 0 | 2 |
| Phase 3 | 4 | 0 | 0 | 4 |
| Phase 4 | 1 | 0 | 0 | 1 |

**品質評価**: 高品質（粒度 1 日単位・依存関係完全定義・🔵 100%）

## クリティカルパス

```
TASK-0001 → TASK-0003 → TASK-0006 → TASK-0007 → TASK-0008 → TASK-0009 → TASK-0011
```

**クリティカルパス工数**: 3 + 3 + 8 + 8 + 8 + 6 + 6 = 42h
**並行作業で短縮可能**: TASK-0002/0004（Phase 1）・TASK-0005（Phase 2）・TASK-0010（Phase 3）は別経路で並行消化可能（合計 19h 分）

## 次のステップ

タスクを実装するには:
- 全タスク順番に実装: `/tsumiki:kairo-implement`
- 特定タスクを実装: `/tsumiki:kairo-implement TASK-0001`
- 範囲をまとめて自動実行: `/tsumiki:kairo-loop`（依存順に自動進行）
