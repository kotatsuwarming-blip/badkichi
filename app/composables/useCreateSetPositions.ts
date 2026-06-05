/**
 * 【機能概要】: set_player_positions へ初期立ち位置 4 行を insert する同期 Write composable。
 * 【実装方針】: useCreateMatch.ts 準拠。RLS (spp_insert = 親 set→match の is_member_of)。
 *             (set_id, team, position) UNIQUE 違反 (重複スロット) は error を返す (EDGE-002)。
 * interfaces.ts SetPositionInput / REQ-003 / EDGE-002
 */
import type { Database } from '~/types/supabase'
import type { ActionResult, SetPositionInput } from '~/types/match-recording'

interface UseCreateSetPositionsReturn {
  createSetPositions: (input: { setId: string, positions: SetPositionInput[] }) => Promise<ActionResult<true>>
  pending: Ref<boolean>
}

export function useCreateSetPositions(): UseCreateSetPositionsReturn {
  const pending = ref(false)
  const client = useSupabaseClient<Database>()

  async function createSetPositions(input: { setId: string, positions: SetPositionInput[] }): Promise<ActionResult<true>> {
    pending.value = true
    try {
      const rows = input.positions.map(p => ({
        set_id: input.setId,
        player_id: p.playerId,
        team: p.team,
        position: p.position
      }))

      const { error } = await client.from('set_player_positions').insert(rows)
      if (error) return { data: null, error }
      return { data: true, error: null }
    } finally {
      pending.value = false
    }
  }

  return { createSetPositions, pending }
}
