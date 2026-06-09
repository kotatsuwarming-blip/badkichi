/**
 * 選択選手/ペアのブレイクダウン算出（サーブ/レシーブ × サービスポジション右(偶)/左(奇)）
 *
 * 選択エンティティ（選手 or ペア）の関与ラリーから、役割×ポジションの得点率を算出する。
 * メンバー判定: serve = server_player_id ∈ members / receive = receiver_player_id ∈ members。
 * ポジションは rallies.server_position（偶数=right / 奇数=left）。
 *
 * 関連要件: 受け入れ2026-06-09（ポジション・役割ドリルダウン）
 * スタイル: セミコロンなし / no comma dangle
 */

import { computePlayerRate } from '~/utils/stats-dashboard/compute-player-rate'
import type { BreakdownCell, EntityBreakdown, RallyRow, ServePosition } from '~/types/stats-dashboard'

const POSITIONS: ServePosition[] = ['right', 'left']

/** 確定ラリー（得点率の集計対象） */
function isConfirmed(r: RallyRow): boolean {
  return !r.is_let && r.is_point_confirmed && r.point_winner !== null
}

/**
 * メンバー（選手1人 or ペア2人の player_id）の関与ラリーから 4 セル（serve/receive × right/left）を算出。
 */
export function computeEntityBreakdown(rows: RallyRow[], memberIds: string[]): EntityBreakdown {
  const members = new Set(memberIds)
  const confirmed = rows.filter(isConfirmed)
  const cells: BreakdownCell[] = []
  let serveTotal = 0, serveWon = 0, receiveTotal = 0, receiveWon = 0

  for (const position of POSITIONS) {
    const serveRows = confirmed.filter(r => members.has(r.server_player_id) && r.server_position === position)
    const sWon = serveRows.filter(r => r.point_winner === r.serving_team).length
    cells.push({ role: 'serve', position, rate: computePlayerRate(serveRows.length, sWon) })
    serveTotal += serveRows.length
    serveWon += sWon

    const receiveRows = confirmed.filter(r => members.has(r.receiver_player_id) && r.server_position === position)
    const rWon = receiveRows.filter(r => r.point_winner !== r.serving_team).length
    cells.push({ role: 'receive', position, rate: computePlayerRate(receiveRows.length, rWon) })
    receiveTotal += receiveRows.length
    receiveWon += rWon
  }

  return {
    serve: computePlayerRate(serveTotal, serveWon),
    receive: computePlayerRate(receiveTotal, receiveWon),
    cells
  }
}
