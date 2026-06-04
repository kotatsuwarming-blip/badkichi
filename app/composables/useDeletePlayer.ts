/**
 * 【機能概要】: 選手をソフト削除する Write composable (deleted_at を now() に設定)
 * 【実装方針】: useCreateGroup.ts の pending/try-finally を踏襲。
 *             update({ deleted_at }).eq('id', id) のみ (物理削除不可 = REQ-402)。
 *             確認ダイアログは持たない (無警告 = REQ-103)。
 * 🔵 interfaces.ts UseDeletePlayerReturn / REQ-004 / REQ-402 / EDGE-006
 */
import type { Database } from '~/types/supabase'
import type { Player } from '~/types/player'

/** ActionResult<T>: アクション関数の共通戻り値型 🔵 */
interface ActionResult<T> {
  data: T | null
  error: unknown
}

/** UseDeletePlayerReturn: useDeletePlayer の戻り値型 🔵 */
interface UseDeletePlayerReturn {
  deletePlayer: (id: Player['id']) => Promise<ActionResult<null>>
  pending: Ref<boolean>
}

/**
 * 【機能概要】: 選手をソフト削除する Write composable
 * 【実装方針】: UseDeletePlayerReturn 契約に従い { deletePlayer, pending } を返す
 * 🔵 TASK-0005.md 実装詳細 / REQ-004 / REQ-103 / REQ-104 / REQ-402 / EDGE-006
 * @returns UseDeletePlayerReturn — { deletePlayer, pending: Ref<boolean> }
 */
export function useDeletePlayer(): UseDeletePlayerReturn {
  // 【pending 初期化】: 二重送信防止のため false で初期化 🔵
  const pending = ref(false)

  // 【型付きクライアント】: Database 型付きで型安全に update する 🔵
  const client = useSupabaseClient<Database>()

  async function deletePlayer(id: Player['id']): Promise<ActionResult<null>> {
    // 【pending 開始】: 実行中は pending=true 🔵
    pending.value = true

    try {
      // 【ソフト削除 update】: deleted_at を now() 相当 (ISO 文字列) に設定。
      //   .delete() は使わない (players に DELETE ポリシー無し = REQ-402)。
      //   試合参照中でも単純 update で成功する (EDGE-006)。 🔵
      const { error } = await client
        .from('players')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)

      // 【エラー処理】: RLS 拒否 / PostgREST / 通信エラーは ActionResult.error に詰めて返す 🔵
      if (error) return { data: null, error }

      // 【成功戻り値】: ActionResult<null> 契約に従い { data: null, error: null } を返す 🔵
      return { data: null, error: null }
    } finally {
      // 【pending リセット】: 成功・エラーを問わず必ず false に戻す 🔵
      pending.value = false
    }
  }

  // 【戻り値】: UseDeletePlayerReturn 契約に従い { deletePlayer, pending } を expose 🔵
  return { deletePlayer, pending }
}
