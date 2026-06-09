/**
 * 期間（日付範囲）＋個別除外 → 対象試合 ID 配列の解決（グローバルフィルタ）。
 *
 * 集計 RPC へ p_match_ids として渡す対象試合を、試合メタ一覧から解決する。
 * dateFrom/dateTo は YYYY-MM-DD（含む）。日付未設定の試合は、日付フィルタ指定時は除外する。
 *
 * 関連要件: 受け入れ2026-06-09（試合期間フィルタ＋個別調整）
 * スタイル: セミコロンなし / no comma dangle
 */

import type { MatchMeta } from '~/types/stats-dashboard'

export function resolveIncludedMatchIds(
  matches: MatchMeta[],
  dateFrom: string | null,
  dateTo: string | null,
  excludedMatchIds: string[]
): string[] {
  const excluded = new Set(excludedMatchIds)
  return matches
    .filter((m) => {
      if (excluded.has(m.id)) return false
      if (dateFrom !== null) {
        if (m.matchDate === null || m.matchDate < dateFrom) return false
      }
      if (dateTo !== null) {
        if (m.matchDate === null || m.matchDate > dateTo) return false
      }
      return true
    })
    .map(m => m.id)
}
