#!/usr/bin/env bash
# Claude Code の Stop hook (ADR-020 §4 L0 / ADR-003 Phase 1)。
# Claude が応答を終えようとしたとき、コードに未検証の変更があれば lint / typecheck / test を回し、
# 失敗したら exit 2 で止めて結果を Claude に返す (Claude は修正を続ける)。
#
# - コードの変更が無い (docs のみ等) なら何もしない。
# - node_modules が無い worktree では検証できないので、その旨を返して止める (pnpm install を促す)。
# - 連続ブロックの上限は Claude Code 組み込みの 8 回 (CLAUDE_CODE_STOP_HOOK_BLOCK_CAP) に任せる。
#
# stdin: {"session_id": "...", "stop_hook_active": bool, ...} (ここでは使わない)
set -u
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$ROOT" || exit 0
cat >/dev/null

# 検証対象のパス。ここに変更 (追跡済みの差分、または未追跡ファイル) が無ければ通す。
CODE_PATHS="app server tests i18n supabase/migrations nuxt.config.ts package.json"
# shellcheck disable=SC2086
CHANGED="$( { git diff --name-only HEAD -- $CODE_PATHS; git ls-files --others --exclude-standard -- $CODE_PATHS; } 2>/dev/null | sort -u)"
[ -z "$CHANGED" ] && exit 0

if [ ! -x node_modules/.bin/eslint ]; then
  echo "stop-check: コードに変更がありますが node_modules が無く検証できません。'pnpm install --prefer-offline' を実行してから、lint / typecheck / test を通してください。" >&2
  echo "変更ファイル:" >&2
  printf '%s\n' "$CHANGED" >&2
  exit 2
fi

LOG="$(mktemp "${TMPDIR:-/tmp}/badkichi-stop-check.XXXXXX")"
for step in lint typecheck test; do
  if ! pnpm "$step" >"$LOG" 2>&1; then
    echo "stop-check: 'pnpm $step' が失敗しました。直してから終えてください。出力の末尾:" >&2
    tail -n 60 "$LOG" >&2
    rm -f "$LOG"
    exit 2
  fi
done
rm -f "$LOG"
echo "stop-check: lint / typecheck / test すべて通過。"
exit 0
