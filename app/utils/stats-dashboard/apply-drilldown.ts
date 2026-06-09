/**
 * ドリルダウン適用（サービスポジション × 個人フォーカス × ラリー長ビン）をラリー行へ適用する純関数。
 *
 * グローバルフィルタ（選手/ペア・期間）は取得時に解決済みの前提。ここでは：
 * - position: 右(偶)/左(奇) で絞る（残す唯一の軸）
 * - memberId: ペアから個人へドリルダウン（その選手が server または receiver のラリー）
 * - shotBinKeys: ラリー長ビンの和集合
 * を適用し、テーブル・ラリー長グラフ・棒グラフが連動する。
 *
 * 関連要件: REQ-010/014 / 受け入れ2026-06-09/10
 * スタイル: セミコロンなし / no comma dangle
 */

import { binsToRanges } from '~/utils/stats-dashboard/rally-length-bins'
import type { RallyRow, StatsDrilldown } from '~/types/stats-dashboard'

export function applyDrilldown(rows: RallyRow[], drilldown: StatsDrilldown): RallyRow[] {
  const ranges = binsToRanges(drilldown.shotBinKeys)

  return rows.filter((row) => {
    if (drilldown.position && row.server_position !== drilldown.position) return false
    if (drilldown.memberId
      && row.server_player_id !== drilldown.memberId
      && row.receiver_player_id !== drilldown.memberId) return false
    if (ranges.length > 0) {
      const inAny = ranges.some(rg => row.shot_count >= rg.min && (rg.max === null || row.shot_count <= rg.max))
      if (!inAny) return false
    }
    return true
  })
}
