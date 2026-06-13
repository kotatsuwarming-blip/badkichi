/**
 * useGroupRallies — Group 横断のラリー行を「絞り込み後に」サーバー側フィルタで取得する Read composable
 *
 * 横断は全試合分でラリーが大量になり得るため、初期は取得せず（immediate:false）、
 * フィルタ確定後に refresh() で stats_rallies(p_group_id, …filters, LIMIT) を発行する
 * （ヒアリング2026-06-08）。
 *
 * 関連設計: docs/design/stats-dashboard/{dataflow.md,api-endpoints.md}
 * 関連要件: REQ-002 / REQ-010 / REQ-104
 * スタイル: セミコロンなし / no comma dangle
 */

import { callStatsRpc } from '~/utils/stats-dashboard/stats-rpc'
import type { Database } from '~/types/supabase'
import type { RallyQueryArgs, RallyRow } from '~/types/stats-dashboard'

export function useGroupRallies(groupId: string, getArgs: () => RallyQueryArgs) {
  const client = useSupabaseClient<Database>()

  return useAsyncData<RallyRow[]>(
    `group-rallies-${groupId}`,
    async () => {
      const a = getArgs()
      return callStatsRpc<RallyRow>(client, 'stats_rallies', {
        p_group_id: groupId,
        p_server_player_id: a.serverPlayerId ?? null,
        p_receiver_player_id: a.receiverPlayerId ?? null,
        p_pair_player1_id: a.pairPlayer1Id ?? null,
        p_pair_player2_id: a.pairPlayer2Id ?? null,
        p_role: a.role ?? null,
        p_shot_ranges: a.shotRanges ?? null,
        p_limit: a.limit ?? 200,
        p_offset: a.offset ?? 0
      })
    },
    { immediate: false }
  )
}
