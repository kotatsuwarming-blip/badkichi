/**
 * 【機能概要】: players へ選手を insert する Write composable
 * 【実装方針】: useCreateGroup.ts の pending/try-finally を踏襲 (二重送信防止)。
 *             group_id は useCurrentGroup から付与、handedness 省略時は 'unknown'。
 * 🔵 interfaces.ts UseCreatePlayerReturn / REQ-002 / REQ-102 / EDGE-003
 */
import type { Database } from '~/types/supabase'
import type { CreatePlayerInput, Player } from '~/types/player'

/** ActionResult<T>: アクション関数の共通戻り値型 🔵 */
interface ActionResult<T> {
  data: T | null
  error: unknown
}

/** UseCreatePlayerReturn: useCreatePlayer の戻り値型 🔵 */
interface UseCreatePlayerReturn {
  createPlayer: (input: CreatePlayerInput) => Promise<ActionResult<Player>>
  pending: Ref<boolean>
}

/**
 * 【機能概要】: 選手を players テーブルへ insert する Write composable
 * 【実装方針】: UseCreatePlayerReturn 契約に従い { createPlayer, pending } を返す
 * 🔵 TASK-0003.md 実装詳細 / REQ-002 / REQ-102 / EDGE-003 / EDGE-004
 * @returns UseCreatePlayerReturn — { createPlayer, pending: Ref<boolean> }
 */
export function useCreatePlayer(): UseCreatePlayerReturn {
  // 【pending 初期化】: 二重送信防止のため false で初期化 🔵
  const pending = ref(false)

  // 【型付きクライアント】: Database 型付きで型安全に insert する 🔵
  const client = useSupabaseClient<Database>()

  // 【所属 Group】: group_id を useCurrentGroup から付与する (ADR-006: 1 user 1 group) 🔵
  const currentGroup = useCurrentGroup()

  async function createPlayer(input: CreatePlayerInput): Promise<ActionResult<Player>> {
    // 【pending 開始】: 実行中は pending=true で UI 側がボタン disabled を制御可能にする 🔵
    pending.value = true

    try {
      // 【group_id 取得】: 未取得時は insert 不可。error を返して page 側で toast 表示 🔵
      const gid = currentGroup.data.value?.group_id
      if (!gid) return { data: null, error: new Error('no_current_group') }

      // 【insert 実行】: handedness 省略時は 'unknown' を送信 (EDGE-003)。同名でも成功 (REQ-102/EDGE-004) 🔵
      const { data, error } = await client
        .from('players')
        .insert({ group_id: gid, name: input.name, handedness: input.handedness ?? 'unknown' })
        .select('id, name, handedness')
        .single()

      // 【エラー処理】: RLS 拒否 / PostgREST / 通信エラーは ActionResult.error に詰めて返す (表示は page 側 toast) 🔵
      if (error) return { data: null, error }

      // 【成功戻り値】: 挿入行を Player として返す 🔵
      return { data: data as Player, error: null }
    } finally {
      // 【pending リセット】: 成功・エラーを問わず必ず false に戻す (二重送信防止) 🔵
      pending.value = false
    }
  }

  // 【戻り値】: UseCreatePlayerReturn 契約に従い { createPlayer, pending } を expose 🔵
  return { createPlayer, pending }
}
