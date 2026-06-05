/**
 * 【機能概要】: 試合のセット一覧 (set_number 昇順) を読む Read composable。採番・再開・決着判定に使う。
 * 【実装方針】: useMatches.ts と同型 (useAsyncData 固定キー)。RLS (sets_select FK 経由) でスコープ。
 *             未削除のみ。SetSummary へ snake_case → camelCase マッピング。
 * interfaces.ts SetSummary / REQ-002 / REQ-010
 */
import type { Database } from '~/types/supabase'
import type { SetSummary } from '~/types/match-recording'

export function useSets(matchId: string) {
  const client = useSupabaseClient<Database>()

  return useAsyncData<SetSummary[]>(`sets-${matchId}`, async () => {
    const { data, error } = await client
      .from('sets')
      .select('id, set_number, target_points, enable_deuce, deuce_point_cap, first_serving_team, camera_near_team_at_start, winner')
      .eq('match_id', matchId)
      .is('deleted_at', null)
      .order('set_number', { ascending: true })

    if (error) throw error

    return (data ?? []).map((row): SetSummary => ({
      id: row.id,
      setNumber: row.set_number,
      targetPoints: row.target_points,
      enableDeuce: row.enable_deuce,
      deucePointCap: row.deuce_point_cap,
      firstServingTeam: row.first_serving_team as SetSummary['firstServingTeam'],
      cameraNearTeamAtStart: row.camera_near_team_at_start as SetSummary['cameraNearTeamAtStart'],
      winner: row.winner as SetSummary['winner']
    }))
  })
}
