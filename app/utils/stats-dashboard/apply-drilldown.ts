/**
 * ドリルダウン適用（役割 × サービスポジション × ラリー長ビン）をラリー行へ適用する純関数。
 *
 * グローバルフィルタ（選手/ペア・期間）は取得時に解決済みの前提で、ここでは選択選手/ペアの
 * 関与ラリーに対し、役割（serve=member が server / receive=member が receiver）・ポジション・
 * ラリー長ビンの和集合で絞り込む。テーブル・ラリー長グラフ・ブレイクダウン強調が同じ結果に連動する。
 *
 * 関連要件: 受け入れ2026-06-09（ドリルダウンを本数グラフにも連動）
 * スタイル: セミコロンなし / no comma dangle
 */

import { binsToRanges } from '~/utils/stats-dashboard/rally-length-bins'
import type { RallyRow, StatsDrilldown } from '~/types/stats-dashboard'

export function applyDrilldown(
  rows: RallyRow[],
  drilldown: StatsDrilldown,
  memberIds: string[]
): RallyRow[] {
  const members = new Set(memberIds)
  const ranges = binsToRanges(drilldown.shotBinKeys)
  const hasMembers = members.size > 0

  return rows.filter((row) => {
    // 役割（メンバーが居る＝選手/ペア選択時のみ有効）
    if (hasMembers && drilldown.role === 'serve' && !members.has(row.server_player_id)) return false
    if (hasMembers && drilldown.role === 'receive' && !members.has(row.receiver_player_id)) return false
    // サービスポジション（偶=右/奇=左）
    if (drilldown.position && row.server_position !== drilldown.position) return false
    // ラリー長ビン（和集合）
    if (ranges.length > 0) {
      const inAny = ranges.some(rg => row.shot_count >= rg.min && (rg.max === null || row.shot_count <= rg.max))
      if (!inAny) return false
    }
    return true
  })
}
