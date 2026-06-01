# TASK-0004 実装記録 (TDD: i18n ロケール定義 + キー一致 CI)

## 作業概要

- **タスクID**: TASK-0004
- **作業内容**: ja/en ロケール定義 + キー構造一致チェック専用 CLI + pre-commit/CI 組込
- **実行日時**: 2026-06-01
- **実行者**: Claude (kairo-loop / TDD)

## TDD サイクル

### RED
`tests/unit/scripts/check-i18n-keys.test.ts` を先に作成。純関数 `collectKeyPaths` / `diffI18nKeys` / `isI18nKeysConsistent` を `scripts/i18n-keys.mjs` から import。モジュール未存在で fail することを確認 (`Cannot find module`)。

### GREEN
- `scripts/i18n-keys.mjs` (純関数) を実装 → 6 files / 24 tests pass。
- `scripts/check-i18n-keys.mjs` (CLI) を実装。`i18n/locales/{ja,en}.json` を読み diff、不一致なら差分出力して exit 1。

### REFACTOR
CLI 成功メッセージの無意味な三項演算を除去 (成功分岐では常に同値)。

### VERIFY-COMPLETE
typecheck / test(24) / i18n:check すべて green。fail injection (en から `errors.unique_violation.join_group` を一時削除) で exit 1 + 差分出力を確認、復元。

## 成果物

| ファイル | 役割 |
|---|---|
| `i18n/locales/ja.json` | 主軸。`errors.*` (App識別子フラット + PG SQLSTATE ツリー) + 画面文言 scaffold |
| `i18n/locales/en.json` | ハコ。ja と同一キー構造、値は空文字 |
| `scripts/i18n-keys.mjs` | deep key 比較の純関数 (CLI と test で共有) |
| `scripts/check-i18n-keys.mjs` | 専用 CLI (`pnpm i18n:check`)。不一致で exit 1 |
| `tests/unit/scripts/check-i18n-keys.test.ts` | 純関数の境界+分岐テスト 4本 |
| `package.json` | `i18n:check` script 追加 + simple-git-hooks pre-commit に `pnpm i18n:check` 追加 |
| `.github/workflows/ci.yml` | lint-typecheck-test ジョブに i18n key parity check step 追加 |

## テストケース (境界 + 分岐、feedback_test_coverage)

1. `collectKeyPaths`: ネストを deep path へ展開
2. ja 限定キー → onlyInJa 検出 (fail 分岐)
3. en 限定キー → onlyInEn 検出 (fail 分岐)
4. PG SQLSTATE ツリーの深い欠落 (`unique_violation.join_group`) を検出 (deep 比較の境界、TASK 注意事項)
5. 完全一致 → consistent (pass 分岐)

## 設計判断・申し送り

- **実装言語を TS → Node ESM (.mjs) に変更**: タスクは「TypeScript/Node の専用 CLI」を指定するが、`tsx` 未導入かつ install はサンドボックスで不可、CI は Node 22 (フラグ無し `.ts` 実行が不安定) のため、依存ゼロで Node 22 実行できる `.mjs` を採用。純関数を `.mjs` に切り出し vitest からも import。「汎用 Python ワンライナー不可・専用 CLI」(feedback_dedicated_linter_cli) の要件は満たす。
- **ロケールパスは `i18n/locales/`** (TASK-0001 の v10 langDir 解決確定に従う。設計の `locales/` 表記は `i18n/locales/` を指す)。
- **画面文言は最小 scaffold**: errors ブロックは設計どおり全定義。画面文言 (login/confirm/onboarding/groups.new/groups.settings/join) は title/CTA 等の最小セットを置き、Phase 3 各ページタスクで実コピーを拡張する想定。ja/en parity は CLI が常時担保する。
- **FYI (別トラック)**: 作業ツリーに未追跡の `docs/design/video-playback/interfaces.ts` があり `pnpm lint` (eslint .) でローカルのみ stylistic error を出す。未追跡のため CI checkout には含まれず CI lint には影響しない。auth-onboarding の範囲外のため本タスクでは未対応。

## 結論

TASK-0004 完了。ロケール定義 + 専用 CLI による ja/en parity チェックを pre-commit/CI 両方に組込。typecheck/test(24)/i18n:check green。
