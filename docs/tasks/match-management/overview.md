# match-management タスク概要

**作成日**: 2026-06-05
**推定工数**: 36 時間
**総タスク数**: 10 件（2 フェーズ）

## 関連文書

- **要件定義書**: [📋 requirements.md](../../spec/match-management/requirements.md)
- **設計文書**: [📐 architecture.md](../../design/match-management/architecture.md)
- **データフロー図**: [🔄 dataflow.md](../../design/match-management/dataflow.md)
- **インターフェース定義**: [📝 interfaces.ts](../../design/match-management/interfaces.ts)
- **DBスキーマ(migration)**: [🗄️ database-schema.sql](../../design/match-management/database-schema.sql)
- **コンテキストノート**: [📝 note.md](../../spec/match-management/note.md)

> **API仕様**: 既存 PostgREST を消費するため新規 API 仕様（api-endpoints.md）はなし。

## フェーズ構成

| フェーズ | 成果物 | タスク数 | 工数 | ファイル |
|---------|--------|----------|------|----------|
| Phase 1 | 基盤＋composable層（migration/型/Zod/CRUD composable） | 6 | 20h | TASK-0001〜0006 |
| Phase 2 | UI層（i18n/モーダル/一覧ページ/受入） | 4 | 16h | TASK-0007〜0010 |

## タスク番号管理

**使用済みタスク番号**: TASK-0001 〜 TASK-0010
**次回開始番号**: TASK-0011

## 全体進捗

- [ ] Phase 1: 基盤＋composable層
- [ ] Phase 2: UI層

---

## Phase 1: 基盤＋composable層

**目標**: matches 拡張 migration を適用し、型・Zod・操作別 composable を整える
**成果物**: additive migration / app/types/match.ts / app/schemas/match-form.ts / useMatches・useCreateMatch・useUpdateMatch・useDeleteMatch

### タスク一覧

- [ ] [TASK-0001: matches additive migration + 型再生成](TASK-0001.md) - 3h (DIRECT) 🔵
- [ ] [TASK-0002: 型定義 + Zod スキーマ](TASK-0002.md) - 4h (TDD) 🔵
- [ ] [TASK-0003: useMatches (Read, 選手名解決)](TASK-0003.md) - 5h (TDD) 🟡
- [ ] [TASK-0004: useCreateMatch](TASK-0004.md) - 3h (TDD) 🔵
- [ ] [TASK-0005: useUpdateMatch](TASK-0005.md) - 3h (TDD) 🔵
- [ ] [TASK-0006: useDeleteMatch (ソフト削除)](TASK-0006.md) - 2h (TDD) 🔵

### 依存関係

```
TASK-0001 → TASK-0002 → TASK-0003
TASK-0002 → TASK-0004
TASK-0002 → TASK-0005
TASK-0002 → TASK-0006
（0003/0004/0005/0006 は 0002 完了後に並行可能）
```

---

## Phase 2: UI層

**目標**: 一覧・追加/編集モーダル・削除確認・受入を実装
**成果物**: locales(matches) / MatchFormModal.vue / pages/groups/[id]/matches.vue / 受入検証

### タスク一覧

- [x] [TASK-0007: i18n matches namespace](TASK-0007.md) - 1h (DIRECT) 🔵
- [ ] [TASK-0008: MatchFormModal.vue（追加/編集モーダル）](TASK-0008.md) - 6h (TDD) 🔵
- [ ] [TASK-0009: matches.vue（一覧ページ）](TASK-0009.md) - 6h (TDD) 🔵
- [ ] [TASK-0010: 受入検証](TASK-0010.md) - 3h (TDD) 🔵

### 依存関係

```
TASK-0007 → TASK-0008, TASK-0009
TASK-0002, TASK-0004, TASK-0005 → TASK-0008
TASK-0003, TASK-0006, TASK-0008 → TASK-0009
TASK-0009 → TASK-0010
（TASK-0007 は Phase 1 と並行可能）
```

---

## 信頼性レベルサマリー

### 全タスク統計

- **総タスク数**: 10 件
- 🔵 **青信号**: 9 件 (90%)
- 🟡 **黄信号**: 1 件 (10%) — TASK-0003（複合FK埋め込みの実地検証、フォールバック明記済）
- 🔴 **赤信号**: 0 件 (0%)

### フェーズ別信頼性

| フェーズ | 🔵 青 | 🟡 黄 | 🔴 赤 | 合計 |
|---------|-------|-------|-------|------|
| Phase 1 | 5 | 1 | 0 | 6 |
| Phase 2 | 4 | 0 | 0 | 4 |

**品質評価**: 高品質（🔵 90%、🔴 0%）

## クリティカルパス

```
TASK-0001 → TASK-0002 → TASK-0003 → TASK-0009 → TASK-0010
（並行: TASK-0004/0005 → TASK-0008 → TASK-0009、TASK-0006、TASK-0007）
```

**クリティカルパス工数**: 約 21h（0001:3 + 0002:4 + 0003:5 + 0009:6 + 0010:3）
**並行作業可能**: TASK-0004/0005/0006/0007/0008 の一部は並行化可能

## 注意事項

- **TASK-0001 の migration 適用は CI 経由（db:push、ローカル不可）**。適用後 app/types/supabase.ts を
  Management API で再生成しないと後続 composable の型（name/match_date）が通らない。
- **TASK-0003 が唯一の 🟡**: PostgREST 複合FK埋め込みで選手名（削除済含む）を解決できるか実地検証し、
  不可ならフォールバック（players を deleted_at 無しで別取得→id→name マップ）。実装最初の小ステップで決着。
- 録画系テーブル（sets/rallies 等）には一切書き込まない（REQ-405、match-recording の責務）。

## 次のステップ

- 全タスク順番に実装: `/tsumiki:kairo-implement`（または `/tsumiki:kairo-loop`）
- 特定タスクを実装: `/tsumiki:kairo-implement TASK-0001`
