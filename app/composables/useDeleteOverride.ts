/**
 * 【機能概要】: position_overrides を物理削除する Write composable (undo 用)。
 * 【実装方針】: 取り消し (REQ-110c) は物理削除。TASK-0001 の po_delete RLS ポリシー前提。
 * interfaces.ts UseDeleteOverrideReturn / REQ-110c
 */
import type { Database } from '~/types/supabase'
import type { ActionResult } from '~/types/match-recording'

interface UseDeleteOverrideReturn {
  deleteOverride: (input: { overrideId: string }) => Promise<ActionResult<true>>
}

export function useDeleteOverride(): UseDeleteOverrideReturn {
  const client = useSupabaseClient<Database>()

  async function deleteOverride(input: { overrideId: string }): Promise<ActionResult<true>> {
    const { error } = await client.from('position_overrides').delete().eq('id', input.overrideId)
    if (error) return { data: null, error }
    return { data: true, error: null }
  }

  return { deleteOverride }
}
