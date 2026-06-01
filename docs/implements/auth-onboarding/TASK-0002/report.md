# TASK-0002 実装記録 (DIRECT: テスト基盤整備)

## 作業概要

- **タスクID**: TASK-0002
- **作業内容**: テスト配置を `tests/unit/` へ集約し vitest include を統一 (ADR-012 D5)
- **実行日時**: 2026-06-01
- **実行者**: Claude (kairo-loop)

## 実行した作業

### 1. rule-engine テスト 4 本を移動 (git mv)

| 移動元 | 移動先 |
|--------|--------|
| `app/utils/rule-engine/__tests__/apply-override.test.ts` | `tests/unit/utils/rule-engine/apply-override.test.ts` |
| `app/utils/rule-engine/__tests__/apply-rally.test.ts` | `tests/unit/utils/rule-engine/apply-rally.test.ts` |
| `app/utils/rule-engine/__tests__/create-initial-state.test.ts` | `tests/unit/utils/rule-engine/create-initial-state.test.ts` |
| `app/utils/rule-engine/__tests__/determine-set-winner.test.ts` | `tests/unit/utils/rule-engine/determine-set-winner.test.ts` |

import を相対 (`../foo`) から `~/utils/rule-engine/foo` へ修正。空になった `app/utils/rule-engine/__tests__/` (`.gitkeep` 含む) を削除。

### 2. vitest.config.ts の include を明示

`include: ['tests/unit/**/*.test.ts']` を追加 (従来はデフォルト glob)。`exclude` の `**/*.integration.test.ts` は維持。`vitest.integration.config.ts` は不変更。

### 3. 後続用ディレクトリ規約

`tests/unit/{composables,middleware,schemas}/` は後続 TDD タスクで実ファイル追加時に出現させる (空ディレクトリは git 非追跡のため .gitkeep は置かない、TASK-0002.md の方針どおり)。

## タスク記載外の是正 (回帰防止)

- **事象**: 新 include `tests/unit/**/*.test.ts` は、既存の mock unit テスト `tests/setup/__tests__/create-test-users.test.ts` を収集対象から外す (= 静かに脱落)。TASK-0002.md は rule-engine 4 本のみ移動対象に列挙していた。
- **根本原因**: タスク分解時、`tests/setup/__tests__/` 配下にもう 1 本の mock unit テストが存在することが移動リストに反映されていなかった。include を `tests/unit/**` に絞ると、`tests/unit/` 外の `*.test.ts` は完了条件「pnpm test 全緑」を満たしたまま**収集されず**コードカバレッジから外れる。
- **是正**: `tests/setup/__tests__/create-test-users.test.ts` → `tests/unit/setup/create-test-users.test.ts` へ移動 (動的 import を `../create-test-users` → `../../setup/create-test-users` に修正)。ヘルパ本体 `tests/setup/create-test-users.ts` は test-support のため `tests/setup/` に残置。これで全 mock unit テストが `tests/unit/**` 一本で収集される。

## 検証結果

| 項目 | 結果 |
|---|---|
| `pnpm test` | ✅ 5 files / 19 tests pass (移動前と同数、回帰なし) |
| `pnpm typecheck` | ✅ pass (import path 修正後も型エラー 0) |

## 結論

TASK-0002 完了。テスト配置を `tests/unit/` に集約し include を統一。タスク記載外の mock unit テスト 1 本も同方針で移動し、収集漏れを防止した。
