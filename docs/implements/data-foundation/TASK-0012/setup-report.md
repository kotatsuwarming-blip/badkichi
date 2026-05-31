# TASK-0012 設定作業実行

## 作業概要

- **タスクID**: TASK-0012
- **作業内容**: prd 自動マイグレーション GitHub Actions（main merge トリガ）の整備
- **実行日時**: 2026-05-20
- **実行者**: Claude (direct-setup)

## 設計文書参照

- `docs/tasks/data-foundation/TASK-0012.md`
- `docs/spec/data-foundation/requirements.md`（REQ-003, REQ-004）
- `docs/design/data-foundation/architecture.md`（"マイグレーション運用"）
- `docs/design/data-foundation/schema-review-notes.md`（⑮ C-17 prd 自動適用方針）

## 方針メモ（採用判断）

### YAML 構文検証は actionlint で pre-commit + CI の二重ガード

TASK-0012 完了条件「ワークフローの YAML 構文が valid であることが確認されている」🟡 への対応として、`actionlint`（GitHub Actions ワークフロー専用 Go 製 linter）を採用。

**選択肢比較**:

| 選択肢 | pros | cons |
|--------|------|------|
| actionlint | GitHub Actions 専用、シェルスクリプトや action 参照まで検証、定番ツール | Go バイナリ依存 |
| yamllint | 汎用 YAML lint | Actions 固有の検証なし、Python 依存 |
| @action-validator/cli (Node) | pnpm dlx で実行可能 | actionlint より検出ルール少なめ |
| Python `yaml.safe_load` ワンライナー | 依存最小 | 構文チェックのみ、Actions 知識ゼロ |

**採択**: actionlint。シェルスクリプトの shellcheck 統合や `${{ ... }}` 式の検証など Actions 特化のチェックが手厚いため。

**運用設計**:

- **pre-commit**: `scripts/check-actionlint.sh` 経由でローカル実行。`actionlint` バイナリがあれば検査、なければ警告 (exit 0) で通す（ローカル全員に Go バイナリ強制 → 摩擦大なため）
- **GitHub Actions**: `reviewdog/action-actionlint@v1` で確実に検査（CI 側を最終ガード）

**ユーザフィードバック反映**: 「python実行する必要ないと思う。CLIとかでいいやり方ないかな？？pre-commit や CI に入れれるように」→ actionlint バイナリ + 公式 Action 採用 + pre-commit/CI 両方統合。

### Secrets は Repository Secrets で開始（Environment 後付け）

TASK-0012.md の通り、MVP では Repository Secrets で簡素に開始する。本格運用化のタイミングで `production` Environment + Required reviewers ゲートを追加する選択肢を prep.md に記録。

### 適用前バックアップは追加しない（⑮ C-17 案 ii）

`.github/workflows/migrate-prd.yml` のファイル先頭コメントで明示。Supabase 標準の日次バックアップに任せ、失敗時は Issue 自動作成 + 手動ロールバックで対応。

### 失敗時通知は MVP では gh issue create のみ

Slack Webhook / メール通知は後付け可能。同じ `if: failure()` ステップに追加できるため、必要になった時点で別タスク化。

## 実行した作業

### 1. `.github/workflows/migrate-prd.yml` の作成

**作成ファイル**: `.github/workflows/migrate-prd.yml`

主な仕様:

- トリガ: `on.push.branches: [main]` + `paths: ['supabase/migrations/**']` + `workflow_dispatch: {}`
- `concurrency: { group: migrate-prd, cancel-in-progress: false }` でレース防止
- `permissions: { contents: read, issues: write }` で `gh issue create` を許可
- env: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PRD_DB_PASSWORD`, `SUPABASE_PRD_PROJECT_REF`
- steps: Checkout → `supabase/setup-cli@v1 (version: latest)` → `supabase link` (prd) → `supabase db push --linked` → 失敗時 `gh issue create`
- ファイル先頭コメントに「⑮ C-17 案 ii 最小構成、適用前バックアップは追加しない」を明記

### 2. actionlint による YAML 静的検証の二重ガード追加

**作成ファイル**: `scripts/check-actionlint.sh`（実行権限付き）

主な仕様:

- shebang `#!/usr/bin/env bash` + `set -euo pipefail`
- `.github/workflows/` が存在しなければ skip (exit 0)
- `actionlint` がパスにあれば `actionlint -color` を実行、なければ警告で exit 0
- pre-commit ではローカル必須化しない設計（CI 側が最終ガード）

**更新ファイル**: `package.json`

```diff
   "simple-git-hooks": {
-    "pre-commit": "pnpm lint-staged && pnpm typecheck && pnpm test && ./scripts/check-migration-integrity.sh"
+    "pre-commit": "pnpm lint-staged && pnpm typecheck && pnpm test && ./scripts/check-migration-integrity.sh && ./scripts/check-actionlint.sh"
   },
```

`pnpm simple-git-hooks` を実行して `.git/hooks/pre-commit` に反映。

**更新ファイル**: `.github/workflows/ci.yml`

`actionlint` ジョブを追加（`migration-integrity` / `db-lint` / `lint-typecheck-test` と並列）:

```yaml
  actionlint:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6
      - name: Run actionlint
        uses: reviewdog/action-actionlint@v1
        with:
          reporter: github-check
          fail_on_error: true
```

### 3. GitHub Secrets 登録手順のドキュメント化

**更新ファイル**: `docs/spec/data-foundation/prep.md`

「§9: GitHub Secrets 登録 🔵 *TASK-0011 / TASK-0012 で利用*」節を追加。対象 Secrets:

| Secret 名 | 用途 |
|----------|------|
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI 認証 (dev/prd 共通) |
| `SUPABASE_DEV_PROJECT_REF` | dev プロジェクト Ref (`db-lint` ジョブ用) |
| `SUPABASE_DB_PASSWORD` | dev DB password (`db-lint` の `supabase link` 用) |
| `SUPABASE_PRD_PROJECT_REF` | prd プロジェクト Ref (`migrate-prd` ジョブ用) |
| `SUPABASE_PRD_DB_PASSWORD` | prd DB password (`migrate-prd` の `supabase link` 用) |

PAT ローテーション・Environment 切替の検討メモも追加。サマリーテーブルの推奨件数も更新。

### 4. 作業記録の作成

- `docs/implements/data-foundation/TASK-0012/setup-report.md`（本ファイル）

## 作業結果

- [x] `.github/workflows/migrate-prd.yml` 作成（トリガ・concurrency・permissions・steps・失敗時通知すべて含む）
- [x] `scripts/check-actionlint.sh` 作成 + 実行権限付与
- [x] `package.json` の `simple-git-hooks.pre-commit` に `./scripts/check-actionlint.sh` 追加
- [x] `pnpm simple-git-hooks` 実行（`.git/hooks/pre-commit` 反映確認）
- [x] `.github/workflows/ci.yml` に `actionlint` ジョブ追加
- [x] `docs/spec/data-foundation/prep.md` に §9 GitHub Secrets 登録節を追加
- [x] setup-report.md 作成

## 遭遇した問題と解決方法

### 問題 1: YAML 構文検証の手段選定（python ワンライナー → actionlint）

- **発生状況**: 初回 setup 時に `python3 -c "import yaml; yaml.safe_load(...)"` で済まそうとしたが、ユーザから「python実行する必要ないと思う。CLIとかでいいやり方ないかな？？pre-commit や CI に入れれるように」とフィードバック。
- **解決方法**: actionlint（GitHub Actions 専用 Go 製 linter）を採用し、`scripts/check-actionlint.sh` 経由で pre-commit に統合 + `reviewdog/action-actionlint@v1` で CI に統合。ローカル未導入時は警告で通す設計でローカル必須化を回避。

## 残課題

- **Supabase CLI バージョン pin**: 現状 `version: latest`。TASK-0017 で初回 prd 適用を確認した時点で具体バージョン（例: `2.100.0`）に pin 化推奨。
- **GitHub Secrets 登録 + 初回 prd 適用**: 本タスクのスコープではなく、ユーザ手動作業として TASK-0017 着手時に実施。
- **actionlint のバージョン pin**: `reviewdog/action-actionlint@v1` は major タグ追従。安定性が必要なら commit SHA か patch バージョンに pin する選択肢あり（MVP では v1 で OK）。

## 次のステップ

- `/tsumiki:direct-verify` を実行し、以下を検証する:
  - `.github/workflows/migrate-prd.yml` の YAML 構造（actionlint ローカル実行は導入後、本タスクでは CI 側に委ねる）
  - prep.md §9 が追加されている
  - `actionlint` ジョブが CI に存在する
- TASK-0012 完了条件チェックリストを全て埋める
- TASK-0012 を overview.md で完了マーク + Phase 3 完了
