/**
 * 【ヘルパー関数】: 未ログイン時のリダイレクト URL を生成するユーティリティ
 * 【再利用性】: /join/[code] ページで未ログイン判定後に /login?redirect=... URL を組み立てる
 *              純粋関数として切り出すことで mock-unit でのテストが可能になり、
 *              EDGE-001 リダイレクトチェーン成立の要を回帰から守る (D2 テスト候補)
 * 【単一責任】: redirect クエリ付き login URL の生成のみを担当。ルーティングや副作用には関与しない
 * 🔵 REQ-108 / EDGE-001 / TASK-0018 requirements.md §2 (未ログイン時出力) / testcases.md §1
 */

/**
 * 【機能概要】: 着地パス（/join/[code]）を /login?redirect= クエリに連結して返す
 * 【実装方針】: path 全体を encodeURIComponent でエンコードして redirect クエリ値として運搬する。
 *              login.vue 側は Vue Router が自動デコードした route.query.redirect を
 *              resolveQueryParam で取り出すため、エンコードして渡すのが正しい往復となる。
 * 【テスト対応】: TC-D2-1（通常パス `/join/ABC12345` → `/login?redirect=%2Fjoin%2FABC12345`）
 *              TC-D2-2（特殊文字 `/join/a b&c` → `/login?redirect=%2Fjoin%2Fa%20b%26c`）
 * 🔵 信頼性レベル: REQ-108 / EDGE-001 + testcases.md §2/§4 + login.vue / confirm.vue の
 *              resolveQueryParam 往復実装に基づく（推測なし）
 * @param path - 現在の着地フルパス（useRoute().fullPath から取得）。code を含む実 URL
 * @returns `/login?redirect=<encodeURIComponent(path)>` 形式のログイン誘導 URL
 */
export function buildLoginRedirect(path: string): string {
  // 【URL 生成】: /login?redirect= プレフィックスに encodeURIComponent でエンコードしたパスを連結する。
  //   encodeURIComponent を使うことで / (パス区切り) や & (クエリ区切り) 等の特殊文字が
  //   redirect クエリ値内で構文を壊さず単一値として安全に運搬される (TC-D2-2 境界値) 🔵
  return '/login?redirect=' + encodeURIComponent(path)
}

/**
 * 【機能概要】: redirect 先を「アプリ内部パス」のみに限定する（オープンリダイレクト対策）
 * 【背景】: confirm.vue は OAuth ラウンドトリップ後 navigateTo(redirect) で遷移する。redirect は
 *          /login?redirect=... 経由で攻撃者が任意値（外部 URL）を仕込める入口があるため、
 *          外部 URL (https://evil.com) や protocol-relative (//evil.com, /\evil.com) を弾いて
 *          fallback へ倒す。Nuxt navigateTo も外部 URL を既定でブロックするが、多層防御として明示検証する。
 * 【判定】: 単一スラッシュ始まり かつ `//`・`/\`（ブラウザが // へ正規化しうる）でないパスのみ内部とみなす。
 * 🔵 セキュリティ手当て（オープンリダイレクト防止）。REQ-104 / confirm.vue・login.vue の redirect チェーン
 * @param path - 正規化済み redirect 値（resolveQueryParam の戻り）
 * @param fallback - 不正・未指定時の安全な既定遷移先（既定 '/'）
 * @returns 内部パスならその値、そうでなければ fallback
 */
export function sanitizeInternalPath(path: string | null | undefined, fallback = '/'): string {
  if (typeof path !== 'string' || !path.startsWith('/')) return fallback
  if (path.startsWith('//') || path.startsWith('/\\')) return fallback
  return path
}
