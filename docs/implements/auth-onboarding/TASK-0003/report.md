# TASK-0003 実装記録 (DIRECT: error-codes.ts)

## 作業概要

- **タスクID**: TASK-0003
- **作業内容**: エラー識別子定数 `app/types/error-codes.ts` の作成
- **実行日時**: 2026-06-01
- **実行者**: Claude (kairo-loop)

## 実行した作業

`app/types/error-codes.ts` を error-handling.md §4.1 + interfaces.ts §1 に従って新規作成:

- `APP_ERROR_CODES` (7 識別子): NOT_AUTHENTICATED / NOT_A_MEMBER / INVALID_GROUP_NAME / INVITATION_NOT_FOUND_BY_LINK / INVITATION_EXPIRED / INVITATION_CODE_COLLISION_AFTER_RETRY + **ALREADY_IN_GROUP** (本単位追加、REQ-105、DB 例外 `already_in_group` と 1:1)
- `PG_ERROR_CODES`: UNIQUE_VIOLATION(23505) / FK_VIOLATION(23503) / CHECK_VIOLATION(23514) / RLS_REJECTED(42501)
- 型: `AppErrorCode` / `PgErrorCode` / `ErrorContext('join_group'|'create_group'|'generic')`
- 型ガード: `isAppError` (message.includes(code)) / `isPgError` (code 完全一致)

interfaces.ts §1 `APP_ERROR_CODES_ADDITION` / §4 `ErrorContext` と整合を確認済 (同値)。

## 検証結果

| 項目 | 結果 |
|---|---|
| `pnpm typecheck` | ✅ pass |
| `pnpm lint` | ✅ pass |

単体テストは省略 (TASK-0003.md 方針 / `feedback_test_coverage`)。`isAppError`/`isPgError` は TASK-0007 `useErrorMessage` 経由で検証する。

## 留意点 (後続タスクへの申し送り)

- 生文字列比較禁止 (REQ-407): page/composable で `'invitation_expired'` 等のリテラル直接比較をしない。
- `INVITATION_NOT_FOUND_BY_LINK` (`'invitation_not_found_by_link'`) は DB の `'invitation_not_found'` と文字列が異なる → TASK-0011 `useJoinGroup` で明示変換が必要 (素朴な includes に頼らない)。

## 結論

TASK-0003 完了。typecheck/lint green。
