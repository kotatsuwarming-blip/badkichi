/**
 * 【機能概要】: shots を物理削除 (hard delete) する Write composable (undo 用)。
 * 【実装方針】: 取り消し (REQ-110a) は soft delete でなく物理削除。TASK-0001 の shots_delete RLS ポリシー前提。
 *             soft delete を使わない＝分析 SQL で deleted_at フィルタ不要。
 * interfaces.ts UseDeleteShotReturn / REQ-110a
 */
import type { Database } from '~/types/supabase'
import type { ActionResult } from '~/types/match-recording'

interface UseDeleteShotReturn {
  deleteShot: (input: { shotId: string }) => Promise<ActionResult<true>>
}

export function useDeleteShot(): UseDeleteShotReturn {
  const client = useSupabaseClient<Database>()

  async function deleteShot(input: { shotId: string }): Promise<ActionResult<true>> {
    const { error } = await client.from('shots').delete().eq('id', input.shotId)
    if (error) return { data: null, error }
    return { data: true, error: null }
  }

  return { deleteShot }
}
