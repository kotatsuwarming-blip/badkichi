/**
 * 【機能概要】: rallies の得点結果 (point_winner / is_let / is_point_confirmed) を update する Write composable。
 * 【実装方針】: 得点確定・スキップ保留・後確定・取り消し(reopen) で使用。楽観 (session が UI 即反映、
 *             DB は非同期 write-behind)。RLS (rallies_update FK 経由)。
 * interfaces.ts UpdateRallyInput / REQ-006 / REQ-103 / REQ-110b
 */
import type { Database } from '~/types/supabase'
import type { ActionResult, UpdateRallyInput } from '~/types/match-recording'

interface UseUpdateRallyReturn {
  updateRally: (input: UpdateRallyInput) => Promise<ActionResult<true>>
}

export function useUpdateRally(): UseUpdateRallyReturn {
  const client = useSupabaseClient<Database>()

  async function updateRally(input: UpdateRallyInput): Promise<ActionResult<true>> {
    const { error } = await client
      .from('rallies')
      .update({
        point_winner: input.pointWinner,
        is_let: input.isLet,
        is_point_confirmed: input.isPointConfirmed
      })
      .eq('id', input.rallyId)

    if (error) return { data: null, error }
    return { data: true, error: null }
  }

  return { updateRally }
}
