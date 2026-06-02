/**
 * 【ヘルパー関数】: URL クエリパラメータを文字列へ正規化するユーティリティ
 * 【再利用性】: route.query の値は string | string[] | undefined になりうる。
 *              複数箇所で同じガードが発生するため共通化する (DRY)
 * 【単一責任】: クエリパラメータ値の型正規化のみを担当。ルーティングや副作用には関与しない
 * 🔵 login.vue / confirm.vue の重複ロジック抽出 (DRY 原則 / refactoring_guidelines §2)
 */

/**
 * 【型注記】: LocationQueryValue = string | null。router のクエリ値には null が含まれうるため
 * string | string[] | null | undefined に加え、(string | null)[] も受け入れる型を定義する 🔵
 */
type QueryValue = string | null | undefined | (string | null)[]

/**
 * 【機能概要】: route.query の値を string に正規化して返す
 * 【改善内容】: login.vue / confirm.vue に重複していた Array.isArray ガードを 1 箇所に集約
 * 【設計方針】: 配列の場合は先頭要素を使用。undefined・null の場合は fallback を返す
 * 【パフォーマンス】: 単純な分岐のみ。計算コストは O(1)
 * 【保守性】: 型ガードを共通化することで、型定義変更時の修正箇所を 1 箇所に限定
 * 🔵 信頼性レベル: login.vue / confirm.vue の実装を正確に抽出 (推測なし)
 * @param value - route.query から取得したパラメータ値 (string | (string|null)[] | null | undefined)
 * @param fallback - 値が存在しない場合のデフォルト値 (省略時は undefined)
 * @returns 正規化された文字列、または fallback 値
 */

export function resolveQueryParam(value: QueryValue): string | undefined
export function resolveQueryParam(value: QueryValue, fallback: string): string
export function resolveQueryParam(
  value: QueryValue,
  fallback?: string
): string | undefined {
  // 【配列ガード】: 配列の場合は先頭要素を取得。先頭が null / 空配列の場合は fallback に fallthrough 🔵
  if (Array.isArray(value)) {
    return value[0] ?? fallback
  }
  // 【単一値 / 未指定】: null を undefined として扱い、なければ fallback を返す 🔵
  return value ?? fallback
}
