/**
 * useMatchStats — 試合単位の集計（得点率 / ペア / ラリー長）を取得する Read composable
 *
 * 集計は読み取り専用 RPC（stats_player_rates / stats_pair_rates / stats_rally_length）で行い、
 * 選手名は players から解決する。RLS（is_member_of）で他 Group は混入しない。
 *
 * 関連設計: docs/design/stats-dashboard/{architecture.md,dataflow.md,api-endpoints.md}
 * 関連要件: REQ-001 / REQ-003 / REQ-005 / REQ-012 / REQ-103 / NFR-002
 * スタイル: セミコロンなし / no comma dangle
 */

import { buildAggregate } from '~/utils/stats-dashboard/build-aggregate'
import { callStatsRpc } from '~/utils/stats-dashboard/stats-rpc'
import type { Database } from '~/types/supabase'
import type {
  PairRateRow,
  PlayerRateRow,
  RallyLengthRow,
  StatsAggregate
} from '~/types/stats-dashboard'

export function useMatchStats(matchId: string) {
  const client = useSupabaseClient<Database>()

  return useAsyncData<StatsAggregate>(`match-stats-${matchId}`, async () => {
    const [playerRows, pairRows, lengthRows, playersRes] = await Promise.all([
      callStatsRpc<PlayerRateRow>(client, 'stats_player_rates', { p_match_id: matchId }),
      callStatsRpc<PairRateRow>(client, 'stats_pair_rates', { p_match_id: matchId }),
      callStatsRpc<RallyLengthRow>(client, 'stats_rally_length', { p_match_id: matchId }),
      client.from('players').select('id, name')
    ])

    if (playersRes.error) throw playersRes.error
    const nameMap = new Map((playersRes.data ?? []).map(p => [p.id, p.name]))
    const nameOf = (id: string) => nameMap.get(id) ?? '不明'

    return buildAggregate(playerRows, pairRows, lengthRows, nameOf)
  })
}
