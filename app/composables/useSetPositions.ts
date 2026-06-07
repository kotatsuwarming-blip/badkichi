/**
 * 【機能概要】: セットの初期立ち位置 (set_player_positions) を読む Read composable。再開 (resume) 用。
 * 【実装方針】: useMatches.ts と同型。RLS (spp_select FK 経由) でスコープ。未削除のみ。
 *             rule-engine SetPlayerPosition[] へ snake_case → camelCase マッピング。
 * REQ-003 / resume
 */
import type { Database } from '~/types/supabase'
import type { SetPositionInput } from '~/types/match-recording'

export function useSetPositions(setId: string) {
  const client = useSupabaseClient<Database>()

  return useAsyncData<SetPositionInput[]>(`set-positions-${setId}`, async () => {
    const { data, error } = await client
      .from('set_player_positions')
      .select('player_id, team, position')
      .eq('set_id', setId)
      .is('deleted_at', null)

    if (error) throw error

    return (data ?? []).map((row): SetPositionInput => ({
      playerId: row.player_id,
      team: row.team as SetPositionInput['team'],
      position: row.position as SetPositionInput['position']
    }))
  })
}
