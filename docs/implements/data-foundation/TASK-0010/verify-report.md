# TASK-0010 設定確認・動作テスト

## 確認概要

- **タスクID**: TASK-0010
- **確認内容**: seed.sql 枠ファイル / db-reset-guard.sh / package.json db:reset の整備内容を検証
- **実行日時**: 2026-05-19
- **実行者**: Claude (direct-verify)

## 検証項目サマリー

**全 13 項目 PASS / FAIL 0 件**

| # | 検証項目 | 期待結果 | 実測 | 判定 |
|---|---|---|---|---|
| 1 | `supabase/seed.sql` 存在 | 空のコメント付き枠ファイルとして存在 | 1049 bytes 存在 | PASS |
| 2 | seed.sql に INSERT 文がない | `grep -ic '^insert'` が 0 | 0 件 | PASS |
| 3 | seed.sql に auth.uid() 言及 | 1 件以上 | 2 件 | PASS |
| 4 | seed.sql に「CI 内 setup スクリプト」言及 | 1 件以上 | 1 件 | PASS |
| 5 | `scripts/db-reset-guard.sh` 存在 + 実行権限 | `-rwxr-xr-x` | `-rwxr-xr-x` | PASS |
| 6 | guard スクリプトの bash 構文 | エラーなし | `bash -n` OK | PASS |
| 7 | `package.json` scripts に `db:reset` 登録 | ガード → reset の連結 | `./scripts/db-reset-guard.sh && supabase db reset --linked` | PASS |
| 8 | dev ref (badkichi-dev) で exit 0 | OK メッセージ + exit 0 | exit 0 + OK メッセージ | PASS |
| 9 | prd ref 偽装で exit 1 + stderr 拒否 | 拒否メッセージ + exit 1 | exit 1 + stderr 拒否 3 行 | PASS |
| 10 | 未存在 project-ref ファイルで exit 1 | エラー + exit 1 | exit 1 + stderr エラー | PASS |
| 11 | 空 project-ref ファイルで exit 1 | エラー + exit 1 | exit 1 + stderr エラー | PASS |
| 12 | 本物の dev project-ref が破壊されていない | `fjfuurlxgijuqpoebtbg` のまま | `fjfuurlxgijuqpoebtbg` | PASS |
| 13 | テスト用一時ファイルが残存しない | テスト後に削除済み | 全件削除確認 | PASS |

## 設定確認結果

### 1. `supabase/seed.sql`（INSERT 文ゼロ・コメント付き枠ファイル）

```bash
$ ls -la supabase/seed.sql
-rw-r--r--  1 kazuyakotake  staff  1049  5 19 22:47 supabase/seed.sql

$ grep -ic '^insert' supabase/seed.sql
0

$ grep -c 'auth.uid()' supabase/seed.sql
2

$ grep -c 'CI 内 setup' supabase/seed.sql
1
```

- [x] ファイル存在
- [x] INSERT 文ゼロ行
- [x] 「auth.uid() 紐付け」「CI 内 setup スクリプト」への委譲が本文中に明記されている
- [x] 参照ドキュメントへのリンクをコメント末尾に記載

### 2. `scripts/db-reset-guard.sh`

```bash
$ ls -l scripts/db-reset-guard.sh
-rwxr-xr-x  1 kazuyakotake  staff  2123  5 19 22:47 scripts/db-reset-guard.sh

$ bash -n scripts/db-reset-guard.sh
(エラーなし)
```

- [x] 実行権限付き
- [x] `set -euo pipefail` 採用
- [x] 期待 dev ref `fjfuurlxgijuqpoebtbg` をハードコード
- [x] `SUPABASE_PROJECT_REF_FILE` 環境変数でテスト時の差し替え可能（prd 偽装テスト用）
- [x] エラーメッセージは stderr に出力

### 3. `package.json` の `scripts.db:reset`

```bash
$ grep '"db:reset"' package.json
    "db:reset": "./scripts/db-reset-guard.sh && supabase db reset --linked",
```

- [x] ガード（exit 1 で短絡）→ `supabase db reset --linked` の二段構え
- [x] `&&` 連結によりガード失敗時に reset 不実行を保証

## 動作テスト結果

> 注: 本タスクの段階では `supabase db reset` 本体は実行禁止（deny 対象）。ガードスクリプトの挙動のみを検証する。

### Test 1: dev ref で exit 0

```bash
$ ./scripts/db-reset-guard.sh
[db-reset-guard] OK: リンク先は badkichi-dev (fjfuurlxgijuqpoebtbg) です。db:reset を続行します。
exit=0
```

- [x] dev リンク状態で正常通過

### Test 2: prd ref 偽装で exit 1

```bash
$ FAKE_PRD_FILE="$(mktemp -t db-reset-guard-prd.XXXXXX)"
$ echo "novhoxtyidbmoqihiurz" > "${FAKE_PRD_FILE}"
$ SUPABASE_PROJECT_REF_FILE="${FAKE_PRD_FILE}" ./scripts/db-reset-guard.sh
[db-reset-guard] 拒否: 現在のリンク先 project-ref は 'novhoxtyidbmoqihiurz' です。
  pnpm db:reset は dev (badkichi-dev / fjfuurlxgijuqpoebtbg) でのみ実行可能です (REQ-009)。
  prd への誤操作を防ぐため処理を中断します。
exit=1
$ rm -f "${FAKE_PRD_FILE}"   # テスト用一時ファイルは削除済み
```

- [x] prd ref (`novhoxtyidbmoqihiurz`) で拒否
- [x] stderr に明確なエラーメッセージ出力
- [x] exit code 1 で終了
- [x] テスト用一時ファイルは検証直後に削除（実 `supabase/.temp/project-ref` は不変）

### Test 3: 未存在 project-ref ファイルで exit 1

```bash
$ SUPABASE_PROJECT_REF_FILE=/tmp/nonexistent-file-xxxxxx ./scripts/db-reset-guard.sh
[db-reset-guard] エラー: project-ref ファイルが存在しません: /tmp/nonexistent-file-xxxxxx
  先に `supabase link --project-ref <dev-ref>` を実行してください。
exit=1
```

- [x] リンク未設定相当の状況で安全に exit 1（暗黙に prd に行かない）

### Test 4: 空 project-ref ファイルで exit 1

```bash
$ EMPTY_FILE="$(mktemp -t db-reset-guard-empty.XXXXXX)"
$ SUPABASE_PROJECT_REF_FILE="${EMPTY_FILE}" ./scripts/db-reset-guard.sh
[db-reset-guard] エラー: project-ref ファイルが空です: <empty file path>
  先に `supabase link --project-ref <dev-ref>` を実行してください。
exit=1
```

- [x] 空ファイル（不正状態）で安全に exit 1

### Test 5: 本物の dev project-ref が破壊されていない

```bash
$ cat supabase/.temp/project-ref
fjfuurlxgijuqpoebtbg
```

- [x] テスト中に実 `supabase/.temp/project-ref` を上書きしていない

## コンパイル・構文チェック結果

- [x] `bash -n scripts/db-reset-guard.sh`: 構文エラーなし
- [x] `package.json` の JSON 構文: `grep` で参照可能、Edit 後も整合性保持（pnpm が正常に読み取れることは既存スクリプトでも確認済み）
- [x] `supabase/seed.sql`: SQL コメントのみ（INSERT 等の実行ステートメントなし）

## 品質チェック結果

### セキュリティ

- [x] ガードは `supabase/.temp/project-ref` をローカルから読むのみで、ネットワーク I/O なし
- [x] 環境変数 `SUPABASE_PROJECT_REF_FILE` でファイルパスを差し替えるテスト機構は、prd 偽装にも安全（実 dev ref ファイルを書き換えない）
- [x] ガード失敗時のメッセージに secret は含まれない（project-ref はパブリックな識別子）

### 完了条件チェック（TASK-0010.md）

- [x] `supabase/seed.sql` が空のコメント付き枠ファイルとして作成されている（INSERT 文ゼロ行、説明コメントのみ）
- [x] コメント内容に「Group / group_members は `auth.uid()` 紐付けが必要なため seed では作れない。CI 内 setup スクリプトでテストデータを生成する」旨が含まれている
- [x] `package.json` の `scripts` に `db:reset` が追加されている（`./scripts/db-reset-guard.sh && supabase db reset --linked`）
- [x] `scripts/db-reset-guard.sh` が作成されている（`#!/usr/bin/env bash` + `set -euo pipefail` + dev ref 以外を exit 1）
- [x] dev リンク時の挙動: ガードが exit 0 で通過することを確認（reset 本体は本タスクでは実行しない）
- [x] prd リンク時の挙動: ガードが exit 1 で拒否することを偽装 ref で確認
- [x] ガード動作確認の再現手順を `docs/implements/data-foundation/TASK-0010/` に記録（本ファイル）

## 発見された問題と解決

問題なし。

## 推奨事項

- 将来 Supabase CLI のバージョンを上げる場合でも、本ガードは `supabase/.temp/project-ref` の読み取りのみに依存しているため CLI 出力フォーマット変更の影響を受けない（タスク詳細の「Supabase CLI バージョン依存」の懸念を回避できている）。
- prd 適用フロー（TASK-0017）は `migrate-prd.yml` 経由で `supabase db push` を使うため、本ガードと併存して問題ない（ガードは `db:reset` 専用）。
- TASK-0011（pre-commit + CI でのマイグレーション改変検出）の前提条件が整った。

## 次のステップ

- TASK-0010 を「完了」状態に更新
- TASK-0011（マイグレーション改変検出 + db:reset の CI 経由動作確認）の準備に進む
