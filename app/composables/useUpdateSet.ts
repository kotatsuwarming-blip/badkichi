/**
 * 【機能概要】: sets.winner を update する同期 Write composable (セット決着時)。
 * 【実装方針】: useUpdateMatch.ts 準拠。RLS (sets_update = 親 match の is_member_of)。
 *             決着はセット境界の整合性操作のため同期 (ハイブリッド永続化)。
 * interfaces.ts / REQ-010
 */
import type { Database } from '~/types/supabase'
import type { ActionResult } from '~/types/match-recording'
import type { Team } from '~/utils/rule-engine/types'

interface UseUpdateSetReturn {
  setWinner: (input: { setId: string, winner: Team }) => Promise<ActionResult<true>>
  pending: Ref<boolean>
}

export function useUpdateSet(): UseUpdateSetReturn {
  const pending = ref(false)
  const client = useSupabaseClient<Database>()

  async function setWinner(input: { setId: string, winner: Team }): Promise<ActionResult<true>> {
    pending.value = true
    try {
      const { error } = await client
        .from('sets')
        .update({ winner: input.winner })
        .eq('id', input.setId)

      if (error) return { data: null, error }
      return { data: true, error: null }
    } finally {
      pending.value = false
    }
  }

  return { setWinner, pending }
}
