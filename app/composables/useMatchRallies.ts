/**
 * useMatchRallies — 試合単位のラリー行を取得する Read composable
 *
 * stats_rallies(p_match_id) で全ライブラリー（レット・未確定含む）を取得し、
 * クライアント側クロスフィルタ（useStatsFilter.apply）の元データとする。
 *
 * 関連設計: docs/design/stats-dashboard/{dataflow.md,api-endpoints.md}
 * 関連要件: REQ-006 / REQ-007 / REQ-010
 * スタイル: セミコロンなし / no comma dangle
 */

import { callStatsRpc } from '~/utils/stats-dashboard/stats-rpc'
import type { Database } from '~/types/supabase'
import type { RallyRow } from '~/types/stats-dashboard'

export function useMatchRallies(matchId: string) {
  const client = useSupabaseClient<Database>()

  return useAsyncData<RallyRow[]>(`match-rallies-${matchId}`, async () => {
    return callStatsRpc<RallyRow>(client, 'stats_rallies', { p_match_id: matchId })
  })
}
