# TASK-0011 設定作業実行

## 作業概要

- **タスクID**: TASK-0011
- **作業内容**: マイグレーション改変検出 + supabase db lint（pre-commit + GitHub Actions 二重ガード）の整備
- **実行日時**: 2026-05-19
- **実行者**: Claude (direct-setup)

## 設計文書参照

- **参照文書**:
  - `docs/tasks/data-foundation/TASK-0011.md`
  - `docs/design/data-foundation/architecture.md`（"マイグレーション運用" / "CI / 開発者ツール"）
  - `docs/spec/data-foundation/requirements.md`（REQ-011, NFR-302）
- **関連要件**: REQ-011, NFR-302

## 方針メモ（採用判断）

### 改変検出ロジック: 初版 SHA256 → 2026-05-21 に git diff 方式へ簡素化

> **更新 (2026-05-21)**: 状態ファイル (`supabase/.migration-checksums.txt`) のメンテコスト
> (新規マイグレ追加のたびに `--init` で再生成が必要) と shell スクリプトの肥大化 (140 行)
> を解消するため、**git diff 方式 (TASK-0011.md 当初設計)** に書き換えた。
> `supabase/.migration-checksums.txt` は廃止、`scripts/check-migration-integrity.sh` は
> 61 行に縮小、`actions/checkout` に `fetch-depth: 2` を追加。

### (歴史的記録) 当初の SHA256 ハッシュリスト方式の判断

初版では SHA256 ハッシュリスト方式（`supabase/.migration-checksums.txt` に既存ファイルのハッシュを保存
→ 検証時に現状ハッシュと比較）を採用していた。

**理由**:

- ハッシュ方式は `HEAD~1` のような git 履歴に依存せず、shallow clone / 初回コミット / squash
  merge など環境差異に強い（CI/CD で `fetch-depth` 設定不要）。
- 「既存ファイルが変更されているか」の判定は本質的にハッシュ比較で十分。
- 新規マイグレーション追加は checksums ファイル未掲載 → 自動的に検出対象外となる。
- 既存 `supabase/.temp/project-ref` のようにファイルベースで状態を保持する既存運用と整合的。

ハッシュ方式の運用ルール:

1. 新規マイグレーション SQL を追加した後、`./scripts/check-migration-integrity.sh --init`
   を実行して checksums を再生成する（追加分のみ反映される）。
2. checksums ファイル自体は git にコミットする（CI/他開発者と共有するため）。
3. checksums ファイルの手動編集は禁止（コメントで明記）。

### pre-commit フック: 既存の simple-git-hooks を継続採用

TASK-0011.md には husky 新規導入が記載されているが、本プロジェクトでは TASK-0004
までに `simple-git-hooks` が既に採用されている（`package.json` の `devDependencies` に
`simple-git-hooks` あり、`pre-commit` 設定済み）。そのため、**husky には移行せず
simple-git-hooks の既存設定に改変検出ステップを追加する方針**を取った。

### supabase db lint: GitHub Actions のみで実行

`supabase db lint --linked` は dev DB へのリンクと API トークンが必要なため、
pre-commit ローカル実行は行わず GitHub Actions のみで実行する設計とした
（TASK-0011.md の方針と一致）。

### actionlint: pre-commit から外し CI 専任に簡素化 (2026-05-21)

> **更新 (2026-05-21)**: 初版では `scripts/check-actionlint.sh` 経由で pre-commit にも
> 組み込んでいたが、ローカル未導入時の警告分岐コードが冗長で shell スクリプトの管理
> コストに見合わなかった。`reviewdog/action-actionlint@v1` が CI 上で最終ガードとして
> 機能するため、**pre-commit からは除去**、ローカルで叩きたい場合は新規追加した
> `pnpm lint:actions` で手動実行する形に変更。`scripts/check-actionlint.sh` は削除。

## 実行した作業

### 1. `scripts/check-migration-integrity.sh` の作成

**作成ファイル**: `scripts/check-migration-integrity.sh`

主な仕様:

- shebang `#!/usr/bin/env bash` + `set -euo pipefail`
- 検証モード（デフォルト）: `supabase/.migration-checksums.txt` の SHA256 と現状のファイルハッシュを比較。
  差分があれば stderr にエラー詳細を出力し exit 1。
- ベースライン作成モード (`--init`): 現状の `supabase/migrations/*.sql` 全ファイルのハッシュを
  checksums ファイルに書き出す。先頭にコメントで「自動生成、改変禁止」を明記。
- macOS（`shasum -a 256`）/ Linux（`sha256sum`）を自動判別。
- 新規追加マイグレーション（checksums に未掲載）は検出対象外。

実行権限付与:

```bash
chmod +x scripts/check-migration-integrity.sh
```

### 2. ベースラインハッシュの生成

```bash
./scripts/check-migration-integrity.sh --init
```

**生成内容** (`supabase/.migration-checksums.txt`):

```
# 自動生成ファイル: supabase/.migration-checksums.txt
# 生成元: scripts/check-migration-integrity.sh --init
# 注意: このファイルは手動編集禁止 (改変禁止)。マイグレーションを
#       新規追加した後にのみ、再度 --init で更新してください。
# 形式: <SHA256>  <relative-path>
3fbc949320517dc795010550bfdc5361154cb5a7d2d9e660a05f0c9ea696e9cf  supabase/migrations/20260519060000_initial_schema.sql
```

### 3. simple-git-hooks の pre-commit 設定更新

**更新ファイル**: `package.json`

```diff
   "simple-git-hooks": {
-    "pre-commit": "pnpm lint-staged && pnpm typecheck && pnpm test"
+    "pre-commit": "pnpm lint-staged && pnpm typecheck && pnpm test && ./scripts/check-migration-integrity.sh"
   },
```

```bash
pnpm simple-git-hooks
# [INFO] Successfully set the pre-commit with command: pnpm lint-staged && pnpm typecheck && pnpm test && ./scripts/check-migration-integrity.sh
# [INFO] Successfully set all git hooks
```

simple-git-hooks 採用済みのため husky には移行せず、既存設定の末尾に
`./scripts/check-migration-integrity.sh` を追加する形で改変検出を組み込んだ。

### 4. GitHub Actions Workflow の更新

**更新ファイル**: `.github/workflows/ci.yml`

既存の単一 `ci` ジョブを以下の 3 ジョブ構成に再構成:

| ジョブ名 | 役割 | Secrets 依存 |
|---|---|---|
| `migration-integrity` | `./scripts/check-migration-integrity.sh` 実行 | なし |
| `db-lint` | `supabase/setup-cli` でセットアップ後 `supabase db lint --linked --level error` 実行 | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DEV_PROJECT_REF`, `SUPABASE_DB_PASSWORD` |
| `lint-typecheck-test` | 既存の `pnpm install` → `pnpm lint` → `pnpm typecheck` → `pnpm test` | なし |

設計のポイント:

- `migration-integrity` と `lint-typecheck-test` は Secrets 不要なため、Secrets 未登録環境でも
  CI が動作する。`db-lint` ジョブのみ Secrets 必須（未登録だと `supabase link` 段階で失敗する想定）。
- `pnpm/action-setup@v5` で pnpm 10 系を、`actions/setup-node@v6` で Node 22 系を利用。
- `supabase/setup-cli@v1` を使用。`version: latest`（後日 pin する想定、TASK-0011 完了条件
  「Supabase CLI のバージョン pin を Workflow に明記する」🟡 への対応は要検討事項として保留）。

### 5. 作業記録の作成

- `docs/implements/data-foundation/TASK-0011/setup-report.md`（本ファイル）

## 作業結果

- [x] `scripts/check-migration-integrity.sh` 作成（実行権限付き）
- [x] `supabase/.migration-checksums.txt` ベースライン生成
- [x] `package.json` の `simple-git-hooks.pre-commit` 更新
- [x] `pnpm simple-git-hooks` 実行（`.git/hooks/pre-commit` 反映確認）
- [x] `.github/workflows/ci.yml` を 3 ジョブ構成に更新
- [x] setup-report.md 作成

## 遭遇した問題と解決方法

### 問題 1: husky か simple-git-hooks か

- **発生状況**: TASK-0011.md には husky 新規導入が記載されているが、リポジトリ既存状態では
  simple-git-hooks が採用済みだった。
- **解決方法**: simple-git-hooks の既存設定を活用し、`pre-commit` コマンド末尾に改変検出
  スクリプトを追加する方式とした。husky への移行は本タスクのスコープ外（後日必要に応じて検討）。

### 問題 2: 改変検出ロジックの選定

- **発生状況**: TASK-0011.md は `git diff HEAD~1..HEAD` ベースの実装例を提示しているが、
  ユーザ指示は SHA256 ハッシュリスト方式だった。
- **解決方法**: ユーザ指示を優先し、SHA256 ハッシュリスト方式で実装。git 履歴に依存しないため
  pre-commit / CI 両方で同じロジックを使える（ロジックの非対称性が消える）メリットがある。

## 次のステップ

- `/tsumiki:direct-verify` を実行し、以下を検証する:
  - ベースライン状態で `./scripts/check-migration-integrity.sh` が exit 0
  - マイグレーションファイル偽装改変時に exit 1
  - simple-git-hooks の反映確認（`.git/hooks/pre-commit` に新コマンドが含まれる）
  - CI YAML 構文確認（YAML パース成功）
- 必要に応じて Supabase CLI バージョン pin（🟡 残課題）を実施
