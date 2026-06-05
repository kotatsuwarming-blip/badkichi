/**
 * 【機能概要】: 空になった遅延生成 rally を物理削除する Write composable (undo 用)。
 * 【実装方針】: ショット取り消しでラリーが空 (shot 0・point 未確定) になった場合に物理削除 (REQ-110a)。
 *             TASK-0001 の rallies_delete RLS ポリシー前提。
 * interfaces.ts UseDeleteRallyReturn / REQ-110a
 */
import type { Database } from '~/types/supabase'
import type { ActionResult } from '~/types/match-recording'

interface UseDeleteRallyReturn {
  deleteRally: (input: { rallyId: string }) => Promise<ActionResult<true>>
}

export function useDeleteRally(): UseDeleteRallyReturn {
  const client = useSupabaseClient<Database>()

  async function deleteRally(input: { rallyId: string }): Promise<ActionResult<true>> {
    const { error } = await client.from('rallies').delete().eq('id', input.rallyId)
    if (error) return { data: null, error }
    return { data: true, error: null }
  }

  return { deleteRally }
}
