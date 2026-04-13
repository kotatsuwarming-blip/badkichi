# rule-engine タスク概要

**作成日**: 2026-04-12
**推定工数**: 34時間
**総タスク数**: 10件

## 関連文書

- **要件定義書**: [requirements.md](../../spec/rule-engine/requirements.md)
- **設計文書**: [architecture.md](../../design/rule-engine/architecture.md)
- **データフロー図**: [dataflow.md](../../design/rule-engine/dataflow.md)
- **インターフェース定義**: [interfaces.ts](../../design/rule-engine/interfaces.ts)
- **コンテキストノート**: [note.md](../../spec/rule-engine/note.md)

## フェーズ構成

| フェーズ | 成果物 | タスク数 | 工数 | ファイル |
|---------|--------|----------|------|----------|
| Phase 1 | 型定義・独立関数 | 4件 | 11h | [TASK-0001~0004](#phase-1-基盤独立関数) |
| Phase 2 | 内部ヘルパー・コア関数・公開API | 6件 | 23h | [TASK-0005~0010](#phase-2-内部ヘルパーコア関数) |

## タスク番号管理

**使用済みタスク番号**: TASK-0001 ~ TASK-0010
**次回開始番号**: TASK-0011

## 全体進捗

- [ ] Phase 1: 基盤・独立関数
- [ ] Phase 2: 内部ヘルパー・コア関数

## マイルストーン

- **M1: 基盤完成**: 型定義 + 独立関数（computeScore, determineSetWinner, determineMatchWinner）完成
- **M2: コア完成**: computeRallyStates, computeNextServer 完成
- **M3: リリース準備完了**: 公開API + 統合テスト完了

---

## Phase 1: 基盤・独立関数

**目標**: 型定義と、他の関数に依存しない独立した関数を実装する
**成果物**: types.ts, compute-score.ts, determine-set-winner.ts, determine-match-winner.ts

### タスク一覧

- [ ] [TASK-0001: 型定義ファイル作成](TASK-0001.md) - 2h (DIRECT) 🔵
- [ ] [TASK-0002: computeScore 実装](TASK-0002.md) - 3h (TDD) 🔵
- [ ] [TASK-0003: determineSetWinner + isSetComplete 実装](TASK-0003.md) - 4h (TDD) 🔵
- [ ] [TASK-0004: determineMatchWinner 実装](TASK-0004.md) - 2h (TDD) 🟡

### 依存関係

```
TASK-0001 → TASK-0002
TASK-0001 → TASK-0003
TASK-0001 → TASK-0004
```

**並行実行可能**: TASK-0002, TASK-0003, TASK-0004 は TASK-0001 完了後に並行実行可能

---

## Phase 2: 内部ヘルパー・コア関数

**目標**: 内部ヘルパー関数を実装し、メイン関数 computeRallyStates, computeNextServer を完成させる
**成果物**: internal/*.ts, compute-rally-states.ts, compute-next-server.ts, index.ts

### タスク一覧

- [ ] [TASK-0005: resolveServingTeam 実装](TASK-0005.md) - 3h (TDD) 🔵
- [ ] [TASK-0006: resolveServerPosition 実装](TASK-0006.md) - 3h (TDD) 🔵
- [ ] [TASK-0007: applyOverrides 実装](TASK-0007.md) - 4h (TDD) 🔵
- [ ] [TASK-0008: computeRallyStates 実装](TASK-0008.md) - 6h (TDD) 🔵
- [ ] [TASK-0009: computeNextServer 実装](TASK-0009.md) - 4h (TDD) 🔵
- [ ] [TASK-0010: 公開API + 統合テスト](TASK-0010.md) - 3h (DIRECT) 🔵

### 依存関係

```
TASK-0001 → TASK-0005 ─┐
TASK-0001 → TASK-0006 ─┤
TASK-0001 → TASK-0007 ─┼→ TASK-0008 → TASK-0010
TASK-0002 ─────────────┘   TASK-0009 → TASK-0010

TASK-0005, 0006, 0007 は並行実行可能
TASK-0008, 0009 は並行実行可能（0005-0007 完了後）
```

---

## 信頼性レベルサマリー

### 全タスク統計

- **総タスク数**: 10件
- 🔵 **青信号**: 9件 (90%)
- 🟡 **黄信号**: 1件 (10%)
- 🔴 **赤信号**: 0件 (0%)

### フェーズ別信頼性

| フェーズ | 🔵 青 | 🟡 黄 | 🔴 赤 | 合計 |
|---------|-------|-------|-------|------|
| Phase 1 | 3 | 1 | 0 | 4 |
| Phase 2 | 6 | 0 | 0 | 6 |

**品質評価**: ✅ 高品質

## クリティカルパス

```
TASK-0001 → TASK-0007 → TASK-0008 → TASK-0010
  (2h)        (4h)        (6h)        (3h)     = 15h
```

**クリティカルパス工数**: 15時間
**並行作業可能工数**: 19時間

## 次のステップ

タスクを実装するには:
- 全タスク順番に実装: `/tsumiki:kairo-implement`
- 特定タスクを実装: `/tsumiki:kairo-implement TASK-0001`
