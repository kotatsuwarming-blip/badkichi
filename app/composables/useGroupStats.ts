/**
 * useGroupStats — Group 横断の集計（選手別 / ペア別 / ラリー長）を取得する Read composable
 *
 * stats_player_rates / stats_pair_rates / stats_rally_length を p_group_id で呼び、
 * 複数試合を跨いだ累計を返す。選手名は players から解決。RLS で他 Group は混入しない。
 *
 * 関連設計: docs/design/stats-dashboard/{architecture.md,dataflow.md,api-endpoints.md}
 * 関連要件: REQ-002 / REQ-003 / REQ-005 / REQ-012 / REQ-103 / NFR-002
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

export function useGroupStats(groupId: string) {
  const client = useSupabaseClient<Database>()

  return useAsyncData<StatsAggregate>(`group-stats-${groupId}`, async () => {
    const [playerRows, pairRows, lengthRows, playersRes] = await Promise.all([
      callStatsRpc<PlayerRateRow>(client, 'stats_player_rates', { p_group_id: groupId }),
      callStatsRpc<PairRateRow>(client, 'stats_pair_rates', { p_group_id: groupId }),
      callStatsRpc<RallyLengthRow>(client, 'stats_rally_length', { p_group_id: groupId }),
      client.from('players').select('id, name').eq('group_id', groupId)
    ])

    if (playersRes.error) throw playersRes.error
    const nameMap = new Map((playersRes.data ?? []).map(p => [p.id, p.name]))
    const nameOf = (id: string) => nameMap.get(id) ?? '不明'

    return buildAggregate(playerRows, pairRows, lengthRows, nameOf)
  })
}
