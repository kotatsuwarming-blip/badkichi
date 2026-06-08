# match-recording タスク概要

**作成日**: 2026-06-05
**プロジェクト期間**: 約15営業日（116時間 / 8h・日換算）
**推定工数**: 116時間
**総タスク数**: 19件

## 関連文書

- **要件定義書**: [📋 requirements.md](../../spec/match-recording/requirements.md)
- **アーキテクチャ**: [📐 architecture.md](../../design/match-recording/architecture.md)
- **データフロー図**: [🔄 dataflow.md](../../design/match-recording/dataflow.md)
- **UI 設計**: [🎨 ui-design.md](../../design/match-recording/ui-design.md)
- **インターフェース定義**: [📝 interfaces.ts](../../design/match-recording/interfaces.ts)
- **コンテキストノート**: [📝 note.md](../../spec/match-recording/note.md)

> 注: `database-schema.sql` / `api-endpoints.md` は本ユニットでは未作成（録画系テーブルは data-foundation 確定済を消費。新規 API/RPC 無し）。DB 変更は TASK-0001 の DELETE RLS ポリシー追記 additive migration 1本のみ。

## フェーズ構成

| フェーズ | 期間 | 成果物 | タスク数 | 工数 | ファイル |
|---------|------|--------|----------|------|----------|
| Phase 1 | Day 1-2 | DELETE ポリシー migration / 型 / 純ロジック | 3 | 15h | [TASK-0001~0003](#phase-1-基盤構築) |
| Phase 2 | Day 3-7 | Read/Write composable（永続化層） | 6 | 39h | [TASK-0004~0009](#phase-2-composable実装) |
| Phase 3 | Day 8-13 | useRecordingSession + UI コンポーネント | 7 | 45h | [TASK-0010~0016](#phase-3-集約-ui実装) |
| Phase 4 | Day 14-15 | ページ統合 / i18n / 結合検証 | 3 | 17h | [TASK-0017~0019](#phase-4-統合) |

## タスク番号管理

**使用済みタスク番号**: TASK-0001 ~ TASK-0019
**次回開始番号**: TASK-0020

## 全体進捗

- [ ] Phase 1: 基盤構築
- [ ] Phase 2: composable実装
- [ ] Phase 3: 集約 + UI実装
- [ ] Phase 4: 統合

## マイルストーン

- **M1: 基盤完成** (Day 2): DELETE ポリシー migration 適用 + 型 + 純関数（map-game-state / decide-override-type）
- **M2: 永続化層完成** (Day 7): 録画系 Read/Write composable（同期/楽観/物理削除）一式
- **M3: UI完成** (Day 13): useRecordingSession + 全コンポーネント（コート図・打った・undo・履歴・セット設定）
- **M4: 結合完了** (Day 15): record.vue 統合 + i18n + 結合スモーク → kairo-loop へ

---

## Phase 1: 基盤構築

**期間**: Day 1-2
**目標**: 物理削除を可能にする DB ポリシーと、上位が依存する型・純ロジックを用意
**成果物**: DELETE RLS migration、`app/types/match-recording.ts`、`app/utils/match-recording/*`

### タスク一覧

- [ ] [TASK-0001: 録画系 DELETE RLS ポリシー追記マイグレーション](TASK-0001.md) - 4h (DIRECT) 🔵
- [ ] [TASK-0002: match-recording 型定義](TASK-0002.md) - 6h (TDD) 🔵
- [ ] [TASK-0003: 純関数 map-game-state / decide-override-type](TASK-0003.md) - 5h (TDD) 🔵

### 依存関係

```
（なし） → TASK-0001
（なし） → TASK-0002 → TASK-0003
```

---

## Phase 2: composable実装

**期間**: Day 3-7
**目標**: 録画系テーブルへの Read/Write を操作別 composable で実装（ハイブリッド永続化）
**成果物**: useMatchForRecording / useSets / useSetRallies / useCreateSet 他 Write 群

### タスク一覧

- [ ] [TASK-0004: useMatchForRecording（Read）](TASK-0004.md) - 6h (TDD) 🔵
- [ ] [TASK-0005: useSets / useSetRallies（Read）](TASK-0005.md) - 6h (TDD) 🔵
- [ ] [TASK-0006: 同期 Write（useCreateSet / useCreateSetPositions / useUpdateSet）](TASK-0006.md) - 7h (TDD) 🔵
- [ ] [TASK-0007: useCreateRally / useUpdateRally](TASK-0007.md) - 7h (TDD) 🔵
- [ ] [TASK-0008: useCreateShot / useDeleteShot / useDeleteRally](TASK-0008.md) - 7h (TDD) 🔵
- [ ] [TASK-0009: useCreateOverride / useDeleteOverride](TASK-0009.md) - 6h (TDD) 🔵

### 依存関係

```
TASK-0002 → TASK-0004 / TASK-0005
TASK-0001, TASK-0002 → TASK-0006 / TASK-0008
TASK-0002, TASK-0003 → TASK-0007
TASK-0001, TASK-0002, TASK-0003 → TASK-0009
```

---

## Phase 3: 集約 + UI実装

**期間**: Day 8-13
**目標**: GameState を所有する集約オーケストレータと録画 UI コンポーネントを実装
**成果物**: useRecordingSession、`app/components/recording/*`

### タスク一覧

- [ ] [TASK-0010: useRecordingSession ①（GameState所有 + セットアップ + ラリー記録）](TASK-0010.md) - 8h (TDD) 🔵
- [ ] [TASK-0011: useRecordingSession ②（override + 統一undo + セット/試合遷移）](TASK-0011.md) - 8h (TDD) 🔵
- [ ] [TASK-0012: CourtDiagram.vue（コート図・立ち位置表示）](TASK-0012.md) - 6h (TDD) 🔵
- [ ] [TASK-0013: ScoreHeader.vue / VideoPane.vue（痕跡オーバーレイ）](TASK-0013.md) - 6h (TDD) 🔵
- [ ] [TASK-0014: ShotButton / UndoButton / RallyControls / PositionControls](TASK-0014.md) - 7h (TDD) 🔵
- [ ] [TASK-0015: RallyHistory.vue（履歴 + ジャンプ）](TASK-0015.md) - 5h (TDD) 🔵
- [ ] [TASK-0016: SetSetupForm.vue（セット設定 + 初期立ち位置）](TASK-0016.md) - 5h (TDD) 🔵

### 依存関係

```
TASK-0003〜0008 → TASK-0010 → TASK-0011 / TASK-0012 / TASK-0013 / TASK-0016
TASK-0011 → TASK-0014
TASK-0005, TASK-0013 → TASK-0015
```

---

## Phase 4: 統合

**期間**: Day 14-15
**目標**: ページ統合（レスポンシブ + 動画配線）、i18n、結合検証
**成果物**: `app/pages/groups/[id]/matches/[matchId]/record.vue`、locales、結合テスト

### タスク一覧

- [ ] [TASK-0017: record.vue ページ統合（レスポンシブ・動画配線）](TASK-0017.md) - 8h (TDD) 🔵
- [ ] [TASK-0018: i18n 文言追加（ja/en）](TASK-0018.md) - 3h (DIRECT) 🔵
- [ ] [TASK-0019: 結合スモーク / 手動検証ページ](TASK-0019.md) - 6h (TDD) 🟡

### 依存関係

```
TASK-0010〜0016 → TASK-0017 → TASK-0018 → TASK-0019
```

---

## 信頼性レベルサマリー

### 全タスク統計

- **総タスク数**: 19件
- 🔵 **青信号**: 18件 (95%)
- 🟡 **黄信号**: 1件 (5%) … TASK-0019（結合検証の自動化/手動の線引きは実装時に詰める。tdd-requirements で 🔵 化可能）
- 🔴 **赤信号**: 0件 (0%)

> 個別に 🟡 項目を含むタスク: TASK-0002（任意の Zod schema）/ TASK-0011（matchWinner 先取セット数）/ TASK-0012（コート図の左右ミラー補正・camera null 既定）。いずれもタスク全体としては 🔵。

### フェーズ別信頼性

| フェーズ | 🔵 青 | 🟡 黄 | 🔴 赤 | 合計 |
|---------|-------|-------|-------|------|
| Phase 1 | 3 | 0 | 0 | 3 |
| Phase 2 | 6 | 0 | 0 | 6 |
| Phase 3 | 7 | 0 | 0 | 7 |
| Phase 4 | 2 | 1 | 0 | 3 |

**品質評価**: 高品質（🔵 95%、🔴 0%。上流が全実装済 + スキーマ確定 + 設計/UI ヒアリング完了のため出典が豊富）

## クリティカルパス

```
TASK-0002 → TASK-0003 → TASK-0007 → TASK-0010 → TASK-0011 → TASK-0014 → TASK-0017 → TASK-0018 → TASK-0019
```

**クリティカルパス工数**: 58時間
**並行作業可能工数**: 58時間（TASK-0001/0004/0005/0006/0008/0009/0012/0013/0015/0016 等は依存解消後に並行可）

## 次のステップ

タスクを実装するには:
- 全タスク順番に実装: `/tsumiki:kairo-implement`
- 特定タスクを実装: `/tsumiki:kairo-implement TASK-0001`
- 自動進行（推奨）: `/tsumiki:kairo-loop` で範囲指定して連続実装
