# TASK-0011 動作確認レポート

## 作業概要

- **タスクID**: TASK-0011
- **作業内容**: マイグレーション改変検出 + supabase db lint（pre-commit + GitHub Actions 二重ガード）の動作確認
- **実行日時**: 2026-05-20
- **実行者**: Claude (direct-verify)
- **対象 setup**: `docs/implements/data-foundation/TASK-0011/setup-report.md`

## 設計文書参照

- `docs/tasks/data-foundation/TASK-0011.md`（完了条件 + 検証手順 A/B/C）
- `docs/spec/data-foundation/requirements.md`（REQ-011, NFR-302）
- `docs/design/data-foundation/architecture.md`（"マイグレーション運用" / "CI / 開発者ツール"）

## 検証結果サマリ

| カテゴリ | 検証範囲 | 判定 |
|---|---|---|
| ガード 1: 改変検出 (ローカル) | 検証手順 A / B、pre-commit 設定 | ✅ PASS |
| ガード 1: 改変検出 (CI) | `migration-integrity` ジョブの fail/pass | ⏳ 保留 (TASK-0017 main マージ時に実証) |
| ガード 2: supabase db lint | YAML 設計 + CLI バージョン確認 | ✅ PASS (構成) |
| ガード 2: supabase db lint (実発火) | dev DB 上での lint error 検出 (検証手順 C) | ⏳ 保留 (Secrets 登録 + dev DB 一時関数操作はユーザ手動作業として TASK-0017 着手前 or 同時に実施) |
| 既存 lint / typecheck / test | ローカル実行で従来通り通過 | ✅ PASS |

## 検証手順 A: 既存マイグレーション改変パターン 🔵

### 手順

1. `cp supabase/migrations/20260519060000_initial_schema.sql /tmp/migration_backup.sql`
2. `printf '\n' >> supabase/migrations/20260519060000_initial_schema.sql`（末尾に空行 1 行追加）
3. `./scripts/check-migration-integrity.sh`

### 結果

- exit code: **1** ✅
- stderr 出力:
  ```
  [check-migration-integrity] エラー: 既存マイグレーションファイルが改変されています。
    マイグレーションは追記のみ運用です (NFR-302 / REQ-011)。
    既存ファイルを変更する代わりに、新しいタイムスタンプ付き .sql を追加してください。

  違反内容:
  改変: supabase/migrations/20260519060000_initial_schema.sql
    期待: 3fbc949320517dc795010550bfdc5361154cb5a7d2d9e660a05f0c9ea696e9cf
    実際: ce6e7d40901ddf76deddea4d147ae119462089098890f62d680b5048954ea0d4
  ```
- 後始末: `cp /tmp/migration_backup.sql supabase/migrations/20260519060000_initial_schema.sql` でファイル復元 → 再実行で exit 0 を確認

### 判定

✅ **PASS**: 既存マイグレーションファイルが改変された場合、SHA256 不一致を検出し exit 1 で拒否する挙動を確認。`期待` / `実際` の両ハッシュも分かりやすく表示される。

## 検証手順 B: 新規マイグレーション追加パターン 🔵

### 手順

1. `printf -- '-- noop (verify B)\n' > supabase/migrations/20260601_dummy_verify.sql`（新規ダミー追加）
2. `./scripts/check-migration-integrity.sh`

### 結果

- exit code: **0** ✅
- stdout 出力: `[check-migration-integrity] OK: 既存マイグレーションファイルは改変されていません。`
- 後始末: `rm supabase/migrations/20260601_dummy_verify.sql` で削除

### 判定

✅ **PASS**: 新規マイグレーションは checksums 未掲載のため検出対象外となり、exit 0 で通過する挙動を確認。追記運用 (NFR-302) に必要な「新規追加は通す」要件を満たす。

## 検証手順 C: supabase db lint 検出パターン 🟡

### 状況

- ローカル環境にも Supabase CLI v2.100.0 がインストール済み (`/opt/homebrew/bin/supabase`)。
- ただし `supabase db lint --linked` は dev プロジェクトに対する link + `SUPABASE_ACCESS_TOKEN` 等 Secrets が必要で、ローカル手元での実発火には dev DB を一時的に汚す操作 (検証用 RPC の作成→削除) を伴う。
- `supabase db lint --local` は Supabase ローカルスタック起動 (`supabase start`) を前提とするため、本フェーズでは採用しない（dev DB を直接見る運用に統一）。

### 判断

本タスクのスコープでは **ワークフロー定義 (`.github/workflows/ci.yml` の `db-lint` ジョブ) の構造検証** に留め、実発火検証は以下の理由から TASK-0017 着手フェーズで併走する。

- GitHub Secrets (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DEV_PROJECT_REF`, `SUPABASE_DB_PASSWORD`) はユーザ手動登録が必要 (TASK-0012 でも同様)。
- dev DB 上での「`SET search_path` を意図的に外した RPC 作成 → CI 確認 → 削除」操作はユーザ手動作業で安全に行うのが筋。
- 構造としては既存 `db-lint` ジョブが下記を満たすことを確認:
  - `supabase/setup-cli@v1` で CLI セットアップ
  - `supabase link --project-ref ${{ secrets.SUPABASE_DEV_PROJECT_REF }}` で dev リンク
  - `supabase db lint --linked --level error` で error 検出時 fail

### 引き継ぎ

検証手順 C 自体は TASK-0017 のリリース・チェックリストに「Secrets 登録 → 故意の `SET search_path` 欠落 RPC で db-lint が赤化 → 削除」を 1 件加える形で実証する。

## 動作確認 → 確認項目テーブル検証 🔵

| 確認項目 | 期待結果 | 実測 | 判定 |
|---------|---------|------|------|
| `scripts/check-migration-integrity.sh` 存在 | 実行権限付き | `-rwxr-xr-x ... scripts/check-migration-integrity.sh` | ✅ |
| pre-commit 設定 | 改変検出ステップ含む | `.git/hooks/pre-commit` 末尾に `./scripts/check-migration-integrity.sh` を含むことを確認 (simple-git-hooks 経由) | ✅ |
| `.github/workflows/ci.yml` 更新 | `migration-integrity` + `db-lint` ジョブ存在 | `migration-integrity:` / `db-lint:` / `lint-typecheck-test:` の 3 ジョブを YAML 上で確認 | ✅ |
| 既存ファイル改変で pre-commit 拒否 | exit 1 + エラーメッセージ | 検証手順 A 参照 (スクリプト直実行で exit 1 を確認、pre-commit は同スクリプト呼び出し) | ✅ |
| 新規ファイル追加で pre-commit 通過 | exit 0 | 検証手順 B 参照 | ✅ |
| 既存ファイル改変で CI fail | `migration-integrity` ジョブが赤 | 構造確認のみ (TASK-0017 main マージ時に実証) | ⏳ |
| 新規ファイル追加で CI 通過 | `migration-integrity` ジョブが緑 | 構造確認のみ (TASK-0017 main マージ時に実証) | ⏳ |
| `supabase db lint` が CI で実行される | `db-lint` ジョブが緑 (健全 DB) | 構造確認のみ (Secrets 登録 + 初回 main マージで実証) | ⏳ |
| lint error 時に CI fail | 故意の `SET search_path` 欠落で `db-lint` が赤 | TASK-0017 で実証 | ⏳ |
| 既存 lint / typecheck / test 動作 | 従来通り緑 | `pnpm lint` / `pnpm typecheck` / `pnpm test` (15 件) いずれもローカルで pass | ✅ |

⏳ 項目はいずれも「Secrets 未登録 + main マージ未実施」という TASK-0017 着手前の状態に依存。本タスクのスコープではローカル完結する範囲を全てクリア。

## 残課題 / 🟡 ポイント

- **Supabase CLI バージョン pin**: `.github/workflows/ci.yml` の `supabase/setup-cli@v1` で現在 `version: latest`。CLI 更新で lint ルール差分が出る可能性があるため、TASK-0017 で初回 prd 適用を確認した時点で具体バージョン (例: `version: 2.100.0`) に pin 化することを推奨。
- **検証手順 C の実発火**: 上述のとおり TASK-0017 のリリース・チェックリストに追加。
- **`migration-integrity` の CI 実発火**: PR を作成しなくても `git push origin feat/determine-set-winner` で `pull_request: [main]` トリガが走らないので、最終確認は main マージ前のレビュー PR 作成時 + マージ後に行う。

## 戻り処理判定

完了条件 (10 項目) のうち、ローカル完結項目は全て ✅。CI 実発火項目は TASK-0017 で実証する前提で OK 判定とする。setup 段階への戻り処理は不要。

## 結論

✅ **TASK-0011 完了条件達成 (TASK-0017 着手時に CI 側 fail/pass を併走実証)**

## 次のステップ

- TASK-0011.md の完了条件チェックボックスを更新
- overview.md の TASK-0011 行を完了マーク
- TASK-0012 (prd 自動マイグレーション GitHub Actions) に進む
