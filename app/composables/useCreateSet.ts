/**
 * 【機能概要】: sets へセットを insert する同期 Write composable。
 * 【実装方針】: useCreateMatch.ts の pending/try-finally を踏襲。RLS (sets_insert = 親 match の is_member_of)。
 *             ハイブリッド永続化の「境界=同期」(後続 rally/shot の FK 親、整合性優先)。
 * interfaces.ts UseCreateSetReturn / REQ-002
 */
import type { Database } from '~/types/supabase'
import type { ActionResult, SetSetupInput } from '~/types/match-recording'

interface UseCreateSetReturn {
  createSet: (input: SetSetupInput & { matchId: string }) => Promise<ActionResult<string>>
  pending: Ref<boolean>
}

export function useCreateSet(): UseCreateSetReturn {
  const pending = ref(false)
  const client = useSupabaseClient<Database>()

  async function createSet(input: SetSetupInput & { matchId: string }): Promise<ActionResult<string>> {
    pending.value = true
    try {
      const { data, error } = await client
        .from('sets')
        .insert({
          match_id: input.matchId,
          set_number: input.setNumber,
          target_points: input.targetPoints,
          enable_deuce: input.enableDeuce,
          deuce_point_cap: input.deucePointCap,
          first_serving_team: input.firstServingTeam,
          camera_near_team_at_start: input.cameraNearTeamAtStart
        })
        .select('id')
        .single()

      if (error) return { data: null, error }
      return { data: data.id, error: null }
    } finally {
      pending.value = false
    }
  }

  return { createSet, pending }
}
