# TASK-0006 実装記録 (TDD: Zod group-name schema)

## 作業概要

- **タスクID**: TASK-0006
- **作業内容**: `app/schemas/group-name.ts` (Group 名バリデーション)
- **実行日時**: 2026-06-01
- **実行者**: Claude (kairo-loop / TDD)

## TDD サイクル

### 事前確認 (Zod 挙動)
`z.string().trim().min(1).max(50)` の挙動を実測:
- '1文字'→OK / '50文字'→OK / ''→FAIL / '51文字'→FAIL / '   '(空白のみ)→FAIL / '  hi  '→OK(data='hi')
- → **空白のみは trim 後 0 文字で min(1) に吸収される (EDGE-105)**。明示 refine 不要と確認。

### RED
`tests/unit/schemas/group-name.test.ts` を先に作成 → `Cannot find module '~/schemas/group-name'` で fail。

### GREEN
`app/schemas/group-name.ts` を実装 → 7 files / 34 tests pass。

### REFACTOR
スキーマは最小 (trim→min→max) で改善余地なし。コメントで NFR-201 / EDGE / locale 整合を明記済。

### VERIFY-COMPLETE
test(34) / typecheck / lint すべて green。

## テストケース (境界 + 分岐、feedback_test_coverage)

| ケース | 期待 | EDGE |
|---|---|---|
| 1 文字 | success | EDGE-101 |
| 50 文字 | success | EDGE-102 |
| 0 文字 (空) | fail (message=invalid_group_name) | EDGE-103 |
| 51 文字 | fail (message=invalid_group_name) | EDGE-104 |
| 空白のみ `'   '` | fail (trim 後 0 文字) | EDGE-105 |
| 前後空白 `'  チーム  '` | success, data='チーム' | trim 適用順 |

## 成果物

- `app/schemas/group-name.ts`: `groupNameSchema` + `GroupName` 型。message は `invalid_group_name` (locale キーと整合、表示は呼び出し側 `t()`)。
- 後続: TASK-0010 (useCreateGroup) / TASK-0017 (Group 作成画面 inline 表示) が消費。DB 側 `invalid_group_name` は最終防衛で二重機能。

## 結論

TASK-0006 完了。test(34)/typecheck/lint green。
