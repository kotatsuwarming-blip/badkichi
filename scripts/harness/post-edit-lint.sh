#!/usr/bin/env bash
# Claude Code の PostToolUse hook (Edit / Write / MultiEdit)。
# 編集された .ts / .vue を eslint にかけ、エラーがあれば exit 2 で Claude に返す。
# 修正 (--fix) はしない。ファイルの状態を Claude の知らないところで変えないため。
#
# stdin: {"tool_name": "...", "tool_input": {"file_path": "..."}, ...}
set -u
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$ROOT" || exit 0

INPUT="$(cat)"
FILE="$(printf '%s' "$INPUT" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
[ -z "$FILE" ] && exit 0
case "$FILE" in
  *.ts|*.vue) ;;
  *) exit 0 ;;
esac
[ -f "$FILE" ] || exit 0
[ -x node_modules/.bin/eslint ] || exit 0

OUT="$(pnpm exec eslint "$FILE" 2>&1)"
STATUS=$?
if [ $STATUS -ne 0 ]; then
  echo "post-edit-lint: eslint が $FILE でエラーを出しました。" >&2
  printf '%s\n' "$OUT" | tail -n 40 >&2
  exit 2
fi
exit 0
