/**
 * ドリルダウン適用（役割 × サービスポジション × 個人フォーカス × ラリー長ビン）をラリー行へ適用する純関数。
 *
 * グローバルフィルタ（選手/ペア・期間）は取得時に解決済みの前提。ここでは：
 * - role: サーブ/レシーブ（subjectIds の選手が server / receiver のラリーに絞る）
 * - position: 右(偶)/左(奇)
 * - memberId: ペアから個人へドリルダウン（その選手が server または receiver）
 * - shotBinKeys: ラリー長ビンの和集合
 * を適用し、テーブル・ラリー長グラフが連動する。subjectIds は role 判定に使う対象選手（選手=1名 / ペア=2名 or 個人フォーカス時1名）。
 *
 * 関連要件: REQ-010/014 / 受け入れ2026-06-09/10
 * スタイル: セミコロンなし / no comma dangle
 */

import { binsToRanges } from '~/utils/stats-dashboard/rally-length-bins'
import type { RallyRow, StatsDrilldown } from '~/types/stats-dashboard'

export function applyDrilldown(
  rows: RallyRow[],
  drilldown: StatsDrilldown,
  subjectIds: string[] = []
): RallyRow[] {
  const ranges = binsToRanges(drilldown.shotBinKeys)
  const subjects = new Set(subjectIds)
  const hasSubjects = subjects.size > 0

  return rows.filter((row) => {
    // 役割（対象選手が server=serve / receiver=receive）
    if (hasSubjects && drilldown.role === 'serve' && !subjects.has(row.server_player_id)) return false
    if (hasSubjects && drilldown.role === 'receive' && !subjects.has(row.receiver_player_id)) return false
    // サービスポジション
    if (drilldown.position && row.server_position !== drilldown.position) return false
    // 個人フォーカス（server または receiver）
    if (drilldown.memberId
      && row.server_player_id !== drilldown.memberId
      && row.receiver_player_id !== drilldown.memberId) return false
    // ラリー長ビン
    if (ranges.length > 0) {
      const inAny = ranges.some(rg => row.shot_count >= rg.min && (rg.max === null || row.shot_count <= rg.max))
      if (!inAny) return false
    }
    return true
  })
}
