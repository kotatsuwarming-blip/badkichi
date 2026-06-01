// i18n ロケールの deep key 構造を比較する純関数群 (NFR-303)。
// CLI (check-i18n-keys.mjs) と vitest から共有する。Node ESM (.mjs) で実装し、
// Node 22 でフラグ無し実行できるようにする (TS strip / tsx に依存しない)。

/**
 * オブジェクトを leaf key path (ドット連結) の配列へ展開する。
 * オブジェクトは再帰、leaf (string 等) はそのパスを記録する。
 * @param {Record<string, unknown>} obj
 * @param {string} prefix
 * @returns {string[]}
 */
export function collectKeyPaths(obj, prefix = '') {
  const paths = []
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      paths.push(...collectKeyPaths(value, path))
    } else {
      paths.push(path)
    }
  }
  return paths
}

/**
 * ja / en の key path 集合を比較し、片方にしか存在しないキーを返す。
 * @param {Record<string, unknown>} ja
 * @param {Record<string, unknown>} en
 * @returns {{ onlyInJa: string[], onlyInEn: string[] }}
 */
export function diffI18nKeys(ja, en) {
  const jaPaths = new Set(collectKeyPaths(ja))
  const enPaths = new Set(collectKeyPaths(en))
  const onlyInJa = [...jaPaths].filter(p => !enPaths.has(p)).sort()
  const onlyInEn = [...enPaths].filter(p => !jaPaths.has(p)).sort()
  return { onlyInJa, onlyInEn }
}

/**
 * ja / en のキー構造が完全一致かを返す。
 * @param {Record<string, unknown>} ja
 * @param {Record<string, unknown>} en
 * @returns {boolean}
 */
export function isI18nKeysConsistent(ja, en) {
  const { onlyInJa, onlyInEn } = diffI18nKeys(ja, en)
  return onlyInJa.length === 0 && onlyInEn.length === 0
}

/**
 * vue-i18n のメッセージ書式で壊れる文字を検出する。
 * vue-i18n は `@` を linked message (`@:key`)、`|` を複数形デリミタとして解釈するため、
 * リテラルとして使うには `{'@'}` / `{'|'}` でエスケープする必要がある。未エスケープだと
 * ロケールファイル全体のコンパイルが失敗し全メッセージが読めなくなる (実害大)。
 * 本アプリは linked / 複数形を使わないため、`{'...'}` リテラル外の `@` `|` は全て不正とみなす。
 * @param {Record<string, unknown>} obj
 * @param {string} prefix
 * @returns {string[]} 問題のあるキーパスと理由
 */
export function findMessageFormatIssues(obj, prefix = '') {
  const issues = []
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      issues.push(...findMessageFormatIssues(value, path))
      continue
    }
    if (typeof value !== 'string') continue
    // vue-i18n のリテラル補間 {'...'} を除去してから検査する
    const stripped = value.replace(/\{'[^']*'\}/g, '')
    if (stripped.includes('@')) {
      issues.push(`${path}: 未エスケープの '@' (vue-i18n の linked 記法と衝突)。{'@'} を使うこと`)
    }
    if (stripped.includes('|')) {
      issues.push(`${path}: 未エスケープの '|' (vue-i18n の複数形デリミタ)。{'|'} を使うこと`)
    }
  }
  return issues
}
