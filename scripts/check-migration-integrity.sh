#!/usr/bin/env bash
#
# scripts/check-migration-integrity.sh
#
# 既存マイグレーションファイル (`supabase/migrations/*.sql`) の改変を検出するガード。
# git の差分情報を直接見るため、状態ファイル (.migration-checksums.txt 等) は不要。
#
# マイグレーションは "追記のみ" 運用 (REQ-011 / NFR-302) であり、既存ファイルの編集は
# dev/prd 間のスキーマ齟齬を生むため絶対に避ける必要がある。新規追加 (A: Added) のみ許可。
#
# 使い方:
#   ./scripts/check-migration-integrity.sh pre-commit   # ステージング差分を検査
#   ./scripts/check-migration-integrity.sh ci           # HEAD~1..HEAD 差分を検査 (デフォルト)
#
# 二重ガード:
#   - pre-commit: simple-git-hooks 経由で実行
#   - GitHub Actions: --no-verify で skip された場合のセーフティネット
#
# 関連: REQ-011, NFR-302, architecture.md "マイグレーション運用 / CI"

set -euo pipefail

readonly MODE="${1:-ci}"
readonly MIGRATIONS_PATTERN='supabase/migrations/*.sql'

case "${MODE}" in
  pre-commit)
    # 1 行目: A (Added) 以外のステージング差分のみを抽出
    CHANGED="$(git diff --cached --name-status -- "${MIGRATIONS_PATTERN}" | awk '$1 != "A" { print }')"
    ;;
  ci)
    # HEAD~1 が無い (初回コミット) ならスキップ
    if ! git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
      echo "[check-migration-integrity] HEAD~1 が存在しないためスキップ"
      exit 0
    fi
    CHANGED="$(git diff --name-status HEAD~1 HEAD -- "${MIGRATIONS_PATTERN}" | awk '$1 != "A" { print }')"
    ;;
  -h|--help|help)
    sed -n '2,20p' "$0"
    exit 0
    ;;
  *)
    echo "[check-migration-integrity] 不明なモード: ${MODE} (pre-commit | ci)" >&2
    exit 2
    ;;
esac

if [ -n "${CHANGED}" ]; then
  {
    echo "[check-migration-integrity] エラー: 既存マイグレーションファイルが改変されています。"
    echo "  マイグレーションは追記のみ運用です (NFR-302 / REQ-011)。"
    echo "  既存ファイルを変更する代わりに、新しいタイムスタンプ付き .sql を追加してください。"
    echo ""
    echo "違反内容 (mode=${MODE}):"
    echo "${CHANGED}"
  } >&2
  exit 1
fi

echo "[check-migration-integrity] OK: 既存マイグレーションファイルは改変されていません (mode=${MODE})。"
