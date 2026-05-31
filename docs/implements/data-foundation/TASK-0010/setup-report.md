# TASK-0010 設定作業実行

## 作業概要

- **タスクID**: TASK-0010
- **作業内容**: seed.sql 枠ファイル整備 + db:reset スクリプト + prd 誤操作ガードの導入
- **実行日時**: 2026-05-19
- **実行者**: Claude (direct-setup)

## 設計文書参照

- **参照文書**:
  - `docs/tasks/data-foundation/TASK-0010.md`
  - `docs/design/data-foundation/architecture.md` ("マイグレーション運用 / CI・開発者ツール")
  - `docs/design/data-foundation/schema-review-notes.md` (⑭ C-16 seed 方針)
  - `docs/spec/data-foundation/requirements.md` REQ-008 / REQ-009 / NFR-201
- **関連要件**: REQ-008（dev 環境再構築可能性）, REQ-009（prd 誤操作防止）, NFR-201（3 ステップ初期化）

## 実行した作業

### 1. `supabase/seed.sql` の枠ファイル化

**配置**: `supabase/seed.sql`

既存ファイルが既に 3 行コメントの簡素な枠だったため、⑭ C-16 の判断根拠（`auth.uid()` 依存・RLS 可視性・CI 内 setup スクリプトへの委譲）を明示的に含めたコメント付き枠ファイルへ更新した。INSERT 文はゼロ行。

主な改善点:
- 「auth.uid() 依存により実データ投入は CI 内 setup スクリプトに委譲」を明文化
- 参照先 (`tests/setup/create-test-users.ts`, architecture.md, requirements.md REQ-008) を明示
- 将来の dev fixture 追加箇所を明示

### 2. `scripts/db-reset-guard.sh` の作成

**配置**: `scripts/db-reset-guard.sh`（新規ディレクトリ）

```bash
#!/usr/bin/env bash
set -euo pipefail

readonly EXPECTED_DEV_REF="fjfuurlxgijuqpoebtbg"
readonly PROJECT_REF_FILE="${SUPABASE_PROJECT_REF_FILE:-supabase/.temp/project-ref}"
# (省略: ref ファイル存在チェック・空チェック・ref 比較・exit 1 / 0)
```

**設計上の選択**:

- タスク詳細では `supabase projects list --output json | jq` で取得する想定だったが、
  以下の理由でユーザー指示通り `supabase/.temp/project-ref` ファイルを直接読む方式を採用：
  - **オフライン動作**: ネットワーク不要で動作する（CI/開発者ローカルどちらでも安定）
  - **テスト容易性**: 環境変数 `SUPABASE_PROJECT_REF_FILE` でファイルパスを差し替えれば prd 偽装テストが安全に行える
  - **CLI バージョン非依存**: `supabase projects list` の JSON フォーマット変更に左右されない
- 期待値は `badkichi-dev` の project-ref `fjfuurlxgijuqpoebtbg` でハードコード（REQ-009 の dev 限定要件に対する明示的なアロー）
- 失敗時は stderr に明確なメッセージを出し exit 1

```bash
# 実行権限を付与
chmod +x scripts/db-reset-guard.sh
```

### 3. `package.json` scripts への登録

`scripts` セクションに以下を追加した（`db:push` の直後、`db:types` の直前）。

```json
"db:reset": "./scripts/db-reset-guard.sh && supabase db reset --linked"
```

ガード（`db-reset-guard.sh`）→ 本処理（`supabase db reset --linked`）の二段構え。ガードが exit 1 を返した時点で `supabase db reset` には到達しない。

## 作業結果

- [x] `supabase/seed.sql` を空のコメント付き枠ファイルとして整備（INSERT 文ゼロ行）
- [x] `scripts/db-reset-guard.sh` を作成し、実行権限を付与
- [x] `package.json` の `scripts` に `db:reset` を追加
- [x] テスト時に prd ref を偽装可能な環境変数 `SUPABASE_PROJECT_REF_FILE` を導入

## 環境情報

- Supabase CLI: 2.100.0
- jq: 1.7.1-apple（参考。本実装では `tr` のみ使用のため jq 依存は撤廃）
- 現在の dev project-ref: `fjfuurlxgijuqpoebtbg` (badkichi-dev)
- prd project-ref (参考): `novhoxtyidbmoqihiurz` (badkichi-prd)

## 遭遇した問題と解決方法

問題なし。

## 次のステップ

- `/tsumiki:direct-verify` を実行してガード動作を検証する
- dev ref では exit 0、prd ref 偽装では exit 1 + stderr メッセージを確認する
- 本タスクの段階では実際に `supabase db reset` は実行しない（deny 対象）
