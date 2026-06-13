/**
 * 得点率算出ユーティリティ
 *
 * 関連設計: docs/design/stats-dashboard/interfaces.ts
 * 関連要件: REQ-003 / REQ-012 / REQ-202 / NFR-201 / EDGE-001
 * スタイル: セミコロンなし / no comma dangle
 */

import type {
  PairRate,
  PairRateRow,
  PlayerRate,
  PlayerRateRow,
  RateValue
} from '~/types/stats-dashboard'

/**
 * 母数・分子から得点率を算出する。母数 0 のときは 0 除算を避け rate=null（「-」表示）。
 * 母数は NFR-201 で必ず併記するため denominator として保持する。
 */
export function computePlayerRate(total: number, won: number): RateValue {
  return {
    rate: total > 0 ? won / total : null,
    denominator: total,
    numerator: won
  }
}

/** PlayerRateRow[]（RPC 生行）→ PlayerRate[]（選手名解決つき） */
export function toPlayerRates(
  rows: PlayerRateRow[],
  nameOf: (playerId: string) => string
): PlayerRate[] {
  return rows.map(row => ({
    playerId: row.player_id,
    playerName: nameOf(row.player_id),
    serve: computePlayerRate(row.serve_total, row.serve_won),
    receive: computePlayerRate(row.receive_total, row.receive_won)
  }))
}

/** PairRateRow[]（RPC 生行）→ PairRate[]（ペアラベル解決つき） */
export function toPairRates(
  rows: PairRateRow[],
  nameOf: (playerId: string) => string
): PairRate[] {
  return rows.map(row => ({
    player1Id: row.player1_id,
    player2Id: row.player2_id,
    pairLabel: `${nameOf(row.player1_id)} / ${nameOf(row.player2_id)}`,
    serve: computePlayerRate(row.serve_total, row.serve_won),
    receive: computePlayerRate(row.receive_total, row.receive_won)
  }))
}
