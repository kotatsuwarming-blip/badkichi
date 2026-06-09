/**
 * 選択選手/ペア（の各個人）のサービス/レシーブ得点率を算出（棒グラフ用 PlayerRate[]）。
 *
 * 全体オーバービューと同じ PlayerRate 形で返し、StatsRateChart で表示する（受け入れ2026-06-10）。
 * - 選手選択: subjectIds=[playerId] → 1 本
 * - ペア選択: subjectIds=[p1, p2] → 各個人（ペアで組んだ時の個人得点率）。クリックで個人へドリルダウン
 * position 指定時は右(偶)/左(奇)で絞る（残す唯一の軸）。
 *
 * 関連要件: REQ-003/004/014 / 受け入れ2026-06-09/10
 * スタイル: セミコロンなし / no comma dangle
 */

import { computePlayerRate } from '~/utils/stats-dashboard/compute-player-rate'
import type { PlayerRate, RallyRow, ServePosition } from '~/types/stats-dashboard'

function isConfirmed(r: RallyRow): boolean {
  return !r.is_let && r.is_point_confirmed && r.point_winner !== null
}

export function computeSubjectRates(
  rows: RallyRow[],
  subjectIds: string[],
  nameOf: (id: string) => string,
  position: ServePosition | null = null
): PlayerRate[] {
  const scoped = rows.filter(r => isConfirmed(r) && (position === null || r.server_position === position))

  return subjectIds.map((id) => {
    const serveRows = scoped.filter(r => r.server_player_id === id)
    const serveWon = serveRows.filter(r => r.point_winner === r.serving_team).length
    const receiveRows = scoped.filter(r => r.receiver_player_id === id)
    const receiveWon = receiveRows.filter(r => r.point_winner !== r.serving_team).length
    return {
      playerId: id,
      playerName: nameOf(id),
      serve: computePlayerRate(serveRows.length, serveWon),
      receive: computePlayerRate(receiveRows.length, receiveWon)
    }
  })
}
