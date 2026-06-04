/**
 * 【機能概要】: 既存選手の name/handedness を update する Write composable
 * 【実装方針】: useCreateGroup.ts の pending/try-finally を踏襲。
 *             update({name,handedness}).eq('id', id).select().single() を実行する。
 * 🔵 interfaces.ts UseUpdatePlayerReturn / REQ-003 / players_update RLS
 */
import type { Database } from '~/types/supabase'
import type { UpdatePlayerInput, Player } from '~/types/player'

/** ActionResult<T>: アクション関数の共通戻り値型 🔵 */
interface ActionResult<T> {
  data: T | null
  error: unknown
}

/** UseUpdatePlayerReturn: useUpdatePlayer の戻り値型 🔵 */
interface UseUpdatePlayerReturn {
  updatePlayer: (id: Player['id'], input: UpdatePlayerInput) => Promise<ActionResult<Player>>
  pending: Ref<boolean>
}

/**
 * 【機能概要】: 選手情報を update する Write composable
 * 【実装方針】: UseUpdatePlayerReturn 契約に従い { updatePlayer, pending } を返す
 * 🔵 TASK-0004.md 実装詳細 / REQ-003 / REQ-101 / REQ-401
 * @returns UseUpdatePlayerReturn — { updatePlayer, pending: Ref<boolean> }
 */
export function useUpdatePlayer(): UseUpdatePlayerReturn {
  // 【pending 初期化】: 二重送信防止のため false で初期化 🔵
  const pending = ref(false)

  // 【型付きクライアント】: Database 型付きで型安全に update する 🔵
  const client = useSupabaseClient<Database>()

  async function updatePlayer(id: Player['id'], input: UpdatePlayerInput): Promise<ActionResult<Player>> {
    // 【pending 開始】: 実行中は pending=true 🔵
    pending.value = true

    try {
      // 【update 実行】: name/handedness を eq('id', id) で対象行に限定して更新。
      //   RLS players_update = is_member_of(group_id) で自 Group のみ更新可 🔵
      const { data, error } = await client
        .from('players')
        .update({ name: input.name, handedness: input.handedness })
        .eq('id', id)
        .select('id, name, handedness')
        .single()

      // 【エラー処理】: RLS 拒否 / PostgREST / 通信エラーは ActionResult.error に詰めて返す 🔵
      if (error) return { data: null, error }

      // 【成功戻り値】: 更新後の行を Player として返す 🔵
      return { data: data as Player, error: null }
    } finally {
      // 【pending リセット】: 成功・エラーを問わず必ず false に戻す 🔵
      pending.value = false
    }
  }

  // 【戻り値】: UseUpdatePlayerReturn 契約に従い { updatePlayer, pending } を expose 🔵
  return { updatePlayer, pending }
}
