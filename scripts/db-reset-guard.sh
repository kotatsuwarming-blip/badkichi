#!/usr/bin/env bash
#
# scripts/db-reset-guard.sh
#
# `pnpm db:reset` の前段ガード。Supabase CLI のリンク先 project-ref が
# dev (badkichi-dev = fjfuurlxgijuqpoebtbg) でない場合に exit 1 で拒否し、
# prd (badkichi-prd = novhoxtyidbmoqihiurz) など他環境への誤操作を防ぐ。
#
# 設計方針:
#   - `supabase/.temp/project-ref` をリンク先 ref のソースとして使用する
#     (supabase CLI が `supabase link` 実行時にこのファイルに ref を書き込むため)。
#   - 環境変数 SUPABASE_PROJECT_REF_FILE でテスト時に上書き可能 (prd 偽装テスト用)。
#
# 関連: REQ-009, architecture.md "CI / 開発者ツール → pnpm db:reset"
#
set -euo pipefail

# dev リンク先の project-ref (badkichi-dev)
readonly EXPECTED_DEV_REF="fjfuurlxgijuqpoebtbg"

# project-ref ファイルパス (環境変数で上書き可能、デフォルトは supabase CLI 標準パス)
readonly PROJECT_REF_FILE="${SUPABASE_PROJECT_REF_FILE:-supabase/.temp/project-ref}"

if [ ! -f "${PROJECT_REF_FILE}" ]; then
  echo "[db-reset-guard] エラー: project-ref ファイルが存在しません: ${PROJECT_REF_FILE}" >&2
  echo "  先に \`supabase link --project-ref <dev-ref>\` を実行してください。" >&2
  exit 1
fi

# project-ref を読み込む (末尾改行・空白を除去)
CURRENT_REF="$(tr -d '[:space:]' < "${PROJECT_REF_FILE}")"

if [ -z "${CURRENT_REF}" ]; then
  echo "[db-reset-guard] エラー: project-ref ファイルが空です: ${PROJECT_REF_FILE}" >&2
  echo "  先に \`supabase link --project-ref <dev-ref>\` を実行してください。" >&2
  exit 1
fi

if [ "${CURRENT_REF}" != "${EXPECTED_DEV_REF}" ]; then
  echo "[db-reset-guard] 拒否: 現在のリンク先 project-ref は '${CURRENT_REF}' です。" >&2
  echo "  pnpm db:reset は dev (badkichi-dev / ${EXPECTED_DEV_REF}) でのみ実行可能です (REQ-009)。" >&2
  echo "  prd への誤操作を防ぐため処理を中断します。" >&2
  exit 1
fi

echo "[db-reset-guard] OK: リンク先は badkichi-dev (${CURRENT_REF}) です。db:reset を続行します。"
