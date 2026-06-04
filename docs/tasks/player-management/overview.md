# player-management タスク概要

**作成日**: 2026-06-02
**推定工数**: 36時間
**総タスク数**: 9件
**作業規模**: 詳細タスク分割（full template）

> **本ユニットの性質**: 新規 DB スキーマ・新規 API・新規 RPC・新規エラーコードは作らない。
> data-foundation 確定済みの `players` テーブル（PostgREST + RLS）を消費する **UI + composable 層**。
> auth-onboarding と同型の「既存 DB を消費する UI 層」構造。設計は🔵100%。

## 関連文書

- **要件定義書**: [📋 requirements.md](../../spec/player-management/requirements.md)
- **受け入れ基準**: [✅ acceptance-criteria.md](../../spec/player-management/acceptance-criteria.md)
- **ユーザストーリー**: [📖 user-stories.md](../../spec/player-management/user-stories.md)
- **設計文書**: [📐 architecture.md](../../design/player-management/architecture.md)
- **データフロー図**: [🔄 dataflow.md](../../design/player-management/dataflow.md)
- **インターフェース定義**: [📝 interfaces.ts](../../design/player-management/interfaces.ts)
- **コンテキストノート**: [📝 note.md](../../spec/player-management/note.md)

> **DBスキーマ / API仕様**: 本ユニットは新規作成しない（data-foundation の既存
> `players` テーブル + RLS を消費）。参照は [data-foundation の確定スキーマ](../../design/data-foundation/database-schema.sql)。

## フェーズ構成

| フェーズ | 成果物 | タスク数 | 工数 | ファイル |
|---------|--------|----------|------|----------|
| Phase 1 | 型・schema・composable 4本（ドメイン/データ層） | 5 | 17h | [TASK-0001~0005](#phase-1-基盤--composable-層) |
| Phase 2 | i18n・モーダル・page・受入検証（プレゼンテーション層） | 4 | 19h | [TASK-0006~0009](#phase-2-ui-層) |

## タスク番号管理

**使用済みタスク番号**: TASK-0001 ~ TASK-0009
**次回開始番号**: TASK-0010

## 全体進捗

- [x] Phase 1: 基盤 + composable 層
- [x] Phase 2: UI 層

## マイルストーン

- **M1: composable 層完成**: 型・Zod schema・Read/Write composable 4本が単体テスト緑（Phase 1 完了）
- **M2: UI 完成**: i18n + PlayerFormModal + players.vue が結線され一連フロー動作（TASK-0008 完了）
- **M3: 受入完了**: acceptance-criteria.md 全12 TC 充足 + lint/typecheck/i18n CI 緑（TASK-0009 完了）

---

## Phase 1: 基盤 + composable 層

**目標**: data-foundation の `players` テーブルを消費するドメイン/データ層（型・検証・CRUD composable）を確立する。
**成果物**: `app/types/player.ts` / `app/schemas/player-name.ts` / `app/composables/{usePlayers,useCreatePlayer,useUpdatePlayer,useDeletePlayer}.ts`

### タスク一覧

- [x] [TASK-0001: 型定義 player.ts + Zod player-name.ts](TASK-0001.md) - 3h (TDD) 🔵
- [x] [TASK-0002: usePlayers (Read composable)](TASK-0002.md) - 4h (TDD) 🔵
- [x] [TASK-0003: useCreatePlayer](TASK-0003.md) - 4h (TDD) 🔵
- [x] [TASK-0004: useUpdatePlayer](TASK-0004.md) - 3h (TDD) 🔵
- [x] [TASK-0005: useDeletePlayer (ソフト削除)](TASK-0005.md) - 3h (TDD) 🔵

### 依存関係

```
TASK-0001 → TASK-0002
TASK-0001 → TASK-0003
TASK-0001 → TASK-0004
TASK-0001 → TASK-0005
```

> TASK-0002〜0005 は TASK-0001（型/schema）完了後、相互に独立して並行実装可能。

---

## Phase 2: UI 層

**目標**: composable を結線した選手管理 UI（一覧・追加/編集モーダル・無警告ソフト削除）を実装し受入を満たす。
**成果物**: `i18n/locales/{ja,en}.json` players namespace / `app/components/players/PlayerFormModal.vue` / `app/pages/groups/[id]/players.vue`

### タスク一覧

- [x] [TASK-0006: i18n locales players キー追加](TASK-0006.md) - 2h (DIRECT) 🔵
- [x] [TASK-0007: PlayerFormModal.vue 追加/編集モーダル](TASK-0007.md) - 6h (TDD) 🔵
- [x] [TASK-0008: players.vue 一覧+空状態+削除+モーダル統合](TASK-0008.md) - 7h (TDD) 🔵
- [x] [TASK-0009: 受入検証 統合確認](TASK-0009.md) - 4h (TDD) 🔵

### 依存関係

```
TASK-0001 → TASK-0007            (型/schema)
TASK-0003 → TASK-0007            (useCreatePlayer)
TASK-0004 → TASK-0007            (useUpdatePlayer)
TASK-0006 → TASK-0007            (i18n)
TASK-0006 → TASK-0008            (i18n)
TASK-0002 → TASK-0008            (usePlayers)
TASK-0005 → TASK-0008            (useDeletePlayer)
TASK-0007 → TASK-0008            (PlayerFormModal を統合)
TASK-0008 → TASK-0009            (全実装完了後に受入)
```

> TASK-0006（i18n）は前提なしで Phase 1 と並行着手可能。

---

## 信頼性レベルサマリー

### 全タスク統計

- **総タスク数**: 9件
- 🔵 **青信号**: 9件 (100%)
- 🟡 **黄信号**: 0件 (0%) ※ TASK-0006 の i18n 文言の自然言語表現のみ項目単位で🟡を含むが、タスク全体は🔵
- 🔴 **赤信号**: 0件 (0%)

### フェーズ別信頼性

| フェーズ | 🔵 青 | 🟡 黄 | 🔴 赤 | 合計 |
|---------|-------|-------|-------|------|
| Phase 1 | 5 | 0 | 0 | 5 |
| Phase 2 | 4 | 0 | 0 | 4 |

**品質評価**: 高品質（確定スキーマ + ADR + ヒアリングにより要件・設計が🔵100%）

## クリティカルパス

```
TASK-0001 → TASK-0003 → TASK-0007 → TASK-0008 → TASK-0009
```

**クリティカルパス工数**: 3 + 4 + 6 + 7 + 4 = 24時間
**並行作業可能工数**: 12時間（TASK-0002/0004/0005/0006 はクリティカルパス外で並行可能）

## 次のステップ

タスクを実装するには:
- 全タスク順番に実装: `/tsumiki:kairo-implement`
- 特定タスクを実装: `/tsumiki:kairo-implement TASK-0001`
- 範囲を自動ループ実装: `/tsumiki:kairo-loop`
