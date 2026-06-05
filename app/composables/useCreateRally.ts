/**
 * 【機能概要】: rallies へラリー行を insert する Write composable (遅延生成・同期)。
 * 【実装方針】: ラリー開始時点で GameState から確定する denorm 列 (map-game-state 出力) +
 *             rally_number + video_start_timestamp_ms を書く。point_winner 等は既定 (null/false)。
 *             shots の FK 親となるため id 確定が必要で同期 (ハイブリッド永続化)。
 * interfaces.ts RallyDenorm / REQ-007 / REQ-410
 */
import type { Database } from '~/types/supabase'
import type { ActionResult, RallyDenorm } from '~/types/match-recording'

interface CreateRallyInput {
  setId: string
  rallyNumber: number
  denorm: RallyDenorm
  videoStartTimestampMs: number | null
}

interface UseCreateRallyReturn {
  createRally: (input: CreateRallyInput) => Promise<ActionResult<string>>
  pending: Ref<boolean>
}

export function useCreateRally(): UseCreateRallyReturn {
  const pending = ref(false)
  const client = useSupabaseClient<Database>()

  async function createRally(input: CreateRallyInput): Promise<ActionResult<string>> {
    pending.value = true
    try {
      const { data, error } = await client
        .from('rallies')
        .insert({
          set_id: input.setId,
          rally_number: input.rallyNumber,
          serving_team: input.denorm.servingTeam,
          server_position: input.denorm.serverPosition,
          server_player_id: input.denorm.serverPlayerId,
          receiver_player_id: input.denorm.receiverPlayerId,
          camera_near_team: input.denorm.cameraNearTeam,
          video_start_timestamp_ms: input.videoStartTimestampMs
        })
        .select('id')
        .single()

      if (error) return { data: null, error }
      return { data: data.id, error: null }
    } finally {
      pending.value = false
    }
  }

  return { createRally, pending }
}
