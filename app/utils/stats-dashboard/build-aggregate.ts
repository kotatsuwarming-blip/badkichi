/**
 * 集計組み立てユーティリティ
 *
 * RPC 生行（player_rates / pair_rates / rally_length）+ 選手名解決 → StatsAggregate。
 * useMatchStats / useGroupStats が共用する純関数。
 *
 * 関連設計: docs/design/stats-dashboard/interfaces.ts
 * 関連要件: REQ-003 / REQ-012 / REQ-005 / REQ-103
 * スタイル: セミコロンなし / no comma dangle
 */

import { toPairRates, toPlayerRates } from '~/utils/stats-dashboard/compute-player-rate'
import { toRallyLengthBins } from '~/utils/stats-dashboard/rally-length-bins'
import type {
  PairRateRow,
  PlayerRateRow,
  RallyLengthRow,
  StatsAggregate
} from '~/types/stats-dashboard'

export function buildAggregate(
  playerRows: PlayerRateRow[],
  pairRows: PairRateRow[],
  rallyLengthRows: RallyLengthRow[],
  nameOf: (playerId: string) => string
): StatsAggregate {
  return {
    playerRates: toPlayerRates(playerRows, nameOf),
    pairRates: toPairRates(pairRows, nameOf),
    // ショット数粒度の RPC 行を既定ビンへ集約（ヒアリング2026-06-09）
    rallyLength: toRallyLengthBins(rallyLengthRows),
    // 確定ラリーが 1 件も無い（得点率も長さ分布も空）= 空状態（REQ-103）
    isEmpty: playerRows.length === 0 && rallyLengthRows.length === 0
  }
}
