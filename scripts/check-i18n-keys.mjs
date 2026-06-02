#!/usr/bin/env node
// ja/en ロケールのキー構造一致を検証する専用 CLI (NFR-303 / memory feedback_dedicated_linter_cli)。
// pre-commit (simple-git-hooks) と CI の両方から `pnpm i18n:check` で実行する。
// 不一致があれば差分を出力して exit 1。

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { diffI18nKeys, findMessageFormatIssues } from './i18n-keys.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// @nuxtjs/i18n v10 は langDir を <rootDir>/i18n/ 基準で解決するため実体は i18n/locales/
const localesDir = resolve(root, 'i18n/locales')

function loadJson(name) {
  const path = resolve(localesDir, name)
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    console.error(`[check-i18n-keys] NG: ${path} の読込/parse に失敗しました: ${err.message}`)
    process.exit(1)
  }
}

const ja = loadJson('ja.json')
const en = loadJson('en.json')

const { onlyInJa, onlyInEn } = diffI18nKeys(ja, en)

if (onlyInJa.length || onlyInEn.length) {
  console.error('[check-i18n-keys] NG: ja/en のキー構造が一致しません')
  if (onlyInJa.length) console.error(`  ja にのみ存在: ${onlyInJa.join(', ')}`)
  if (onlyInEn.length) console.error(`  en にのみ存在: ${onlyInEn.join(', ')}`)
  console.error('  → 不足側にキーを追加してください (en は値空でよいが構造は ja と一致させる)。')
  process.exit(1)
}

// vue-i18n のメッセージ書式検証 (未エスケープ '@' / '|' はファイル全体のコンパイルを壊す)
const formatIssues = [
  ...findMessageFormatIssues(ja).map(i => `ja.json ${i}`),
  ...findMessageFormatIssues(en).map(i => `en.json ${i}`)
]
if (formatIssues.length) {
  console.error('[check-i18n-keys] NG: vue-i18n メッセージ書式に問題があります')
  for (const issue of formatIssues) console.error(`  ${issue}`)
  process.exit(1)
}

console.log(`[check-i18n-keys] OK: ja/en のキー構造一致 + メッセージ書式 (${Object.keys(ja).length} top-level keys)`)
