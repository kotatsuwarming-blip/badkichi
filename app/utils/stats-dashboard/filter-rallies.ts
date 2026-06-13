/**
 * ラリー絞り込みユーティリティ（per-match クロスフィルタ・クライアント側）
 *
 * 選手 / ペア（いずれも player_id・役割連動）/ ラリー長ビン（複数選択の和集合）で
 * 読み込み済みの RallyRow[] を絞り込む。チーム A/B はフィルタ軸にしない
 * （serve/receive 判定の内部利用のみ, ヒアリング2026-06-09）。
 *
 * 関連設計: docs/design/stats-dashboard/{interfaces.ts,dataflow.md}
 * 関連要件: REQ-010 / REQ-012 / EDGE-102
 * スタイル: セミコロンなし / no comma dangle
 */

import { binsToRanges } from '~/utils/stats-dashboard/rally-length-bins'
import type { RallyRow, StatsFilter, Team } from '~/types/stats-dashboard'

/** per-match のロスター（その試合の 2 ペア）。ペア絞り込みの所属チーム判定に使う */
export interface MatchRoster {
  pairA: [string, string]
  pairB: [string, string]
}

function sortPair(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/** filter.pair がロスターのどちらのチームか（一致しなければ null） */
function pairTeam(pair: { player1Id: string, player2Id: string }, roster: MatchRoster): Team | null {
  const key = sortPair(pair.player1Id, pair.player2Id)
  if (sortPair(roster.pairA[0], roster.pairA[1]) === key) return 'A'
  if (sortPair(roster.pairB[0], roster.pairB[1]) === key) return 'B'
  return null
}

export function filterRallies(
  rows: RallyRow[],
  filter: StatsFilter,
  roster?: MatchRoster
): RallyRow[] {
  const ranges = binsToRanges(filter.shotBinKeys)

  return rows.filter((row) => {
    // ---- 1 選手（role 連動） ----
    if (filter.playerId) {
      const asServer = row.server_player_id === filter.playerId
      const asReceiver = row.receiver_player_id === filter.playerId
      if (filter.role === 'serve' && !asServer) return false
      if (filter.role === 'receive' && !asReceiver) return false
      if (filter.role === null && !asServer && !asReceiver) return false
    }

    // ---- ペア（role 連動。roster 必須） ----
    if (filter.pair && roster) {
      const team = pairTeam(filter.pair, roster)
      if (team === null) return false // この試合に当該ペアはいない
      const pairIsServing = row.serving_team === team
      if (filter.role === 'serve' && !pairIsServing) return false
      if (filter.role === 'receive' && pairIsServing) return false
      // role=null はペアが出場していれば全ラリー対象（team は A/B いずれかで一致済み）
    }

    // ---- ラリー長ビン（複数選択の和集合） ----
    if (ranges.length > 0) {
      const inAnyRange = ranges.some(
        rng => row.shot_count >= rng.min && (rng.max === null || row.shot_count <= rng.max)
      )
      if (!inAnyRange) return false
    }

    return true
  })
}
