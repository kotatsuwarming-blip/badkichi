/**
 * 【機能概要】: セット内のラリー履歴 (rally_number 昇順) を RallyHistoryItem へ射影する Read composable。
 * 【実装方針】: useMatches.ts と同型。shots(count) 埋め込みでショット数を取得。未確定 (is_point_confirmed=false)
 *             を区別 (EDGE-003)。RLS (rallies_select FK 経由) でスコープ。未削除ラリーのみ。
 *             選手名は UI 側でロスターから解決するため server_player_id のみ返す。
 * interfaces.ts RallyHistoryItem / REQ-009 / EDGE-003
 */
import type { Database } from '~/types/supabase'
import type { RallyHistoryItem } from '~/types/match-recording'

export function useSetRallies(setId: string) {
  const client = useSupabaseClient<Database>()

  return useAsyncData<RallyHistoryItem[]>(`set-rallies-${setId}`, async () => {
    const { data, error } = await client
      .from('rallies')
      .select('rally_number, serving_team, server_player_id, receiver_player_id, point_winner, is_let, is_point_confirmed, video_start_timestamp_ms, shots(count), position_overrides(count)')
      .eq('set_id', setId)
      .is('deleted_at', null)
      .order('rally_number', { ascending: true })

    if (error) throw error

    return (data ?? []).map((row): RallyHistoryItem => ({
      rallyNumber: row.rally_number,
      servingTeam: row.serving_team as RallyHistoryItem['servingTeam'],
      serverPlayerId: row.server_player_id,
      receiverPlayerId: row.receiver_player_id,
      pointWinner: row.point_winner as RallyHistoryItem['pointWinner'],
      isLet: row.is_let,
      isPointConfirmed: row.is_point_confirmed,
      shotCount: row.shots[0]?.count ?? 0,
      overrideCount: row.position_overrides[0]?.count ?? 0,
      videoStartTimestampMs: row.video_start_timestamp_ms
    }))
  })
}
