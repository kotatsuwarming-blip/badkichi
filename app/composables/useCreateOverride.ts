/**
 * 【機能概要】: position_overrides へ左右入れ替わりを insert する Write composable (楽観)。
 * 【実装方針】: override_type は decideOverrideType (偶奇) が決めた値を受け取るだけ。RLS (po_insert FK 経由)。
 *             engine へは applyOverride(team) を渡す (session 側)。DB は意味ラベルを保存。
 * interfaces.ts / REQ-105
 */
import type { Database } from '~/types/supabase'
import type { ActionResult } from '~/types/match-recording'
import type { Team } from '~/utils/rule-engine/types'

type OverrideType = Database['public']['Tables']['position_overrides']['Row']['override_type']

interface CreateOverrideInput {
  rallyId: string
  team: Team
  overrideType: OverrideType
}

interface UseCreateOverrideReturn {
  createOverride: (input: CreateOverrideInput) => Promise<ActionResult<string>>
}

export function useCreateOverride(): UseCreateOverrideReturn {
  const client = useSupabaseClient<Database>()

  async function createOverride(input: CreateOverrideInput): Promise<ActionResult<string>> {
    const { data, error } = await client
      .from('position_overrides')
      .insert({
        rally_id: input.rallyId,
        team: input.team,
        override_type: input.overrideType
      })
      .select('id')
      .single()

    if (error) return { data: null, error }
    return { data: data.id, error: null }
  }

  return { createOverride }
}
