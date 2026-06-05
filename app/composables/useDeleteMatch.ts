/**
 * 【機能概要】: 試合を deleted_at = now() でソフト削除する Write composable (REQ-004 / REQ-402)
 * 【実装方針】: useDeletePlayer.ts のソフト削除を踏襲。update({deleted_at}).eq('id', id)。
 *             確認ダイアログは page 側 (REQ-105)、本 composable は承認後に即実行する。
 * interfaces.ts UseDeleteMatchReturn / REQ-004 / REQ-402 / matches_update RLS
 */
import type { Database } from '~/types/supabase'
import type { MatchListItem } from '~/types/match'

interface ActionResult<T> {
  data: T | null
  error: unknown
}

interface UseDeleteMatchReturn {
  deleteMatch: (id: MatchListItem['id']) => Promise<ActionResult<null>>
  pending: Ref<boolean>
}

export function useDeleteMatch(): UseDeleteMatchReturn {
  const pending = ref(false)
  const client = useSupabaseClient<Database>()

  async function deleteMatch(id: MatchListItem['id']): Promise<ActionResult<null>> {
    pending.value = true
    try {
      // 【ソフト削除】: deleted_at を now() に update。物理 DELETE はしない (REQ-402)。
      //   eq('id', id) で対象限定、RLS で自 Group のみ。一覧除外は refresh で成立 (EDGE-006)
      const { error } = await client
        .from('matches')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)

      // 【エラー処理】: RLS 拒否 / 通信は ActionResult.error に詰める (EDGE-010)
      if (error) return { data: null, error }

      // 【成功戻り値】: ソフト削除成功。data は null
      return { data: null, error: null }
    } finally {
      pending.value = false
    }
  }

  return { deleteMatch, pending }
}
