/**
 * 【機能概要】: グループ作成 RPC を実行する Write 系 composable
 * 【実装方針】: rpc('create_group_with_owner', { group_name }) を呼び、
 *             成功時は useCurrentGroup().refresh() で所属状態を最新化し、
 *             エラー時は useFormErrors チャネルに inline 表示する。
 *             pending は try/finally で確実に false にリセット（EDGE-003 二重送信防止）
 * 【テスト対応】: TC1 (成功 → RPC 引数検証 + refresh 呼出 + ActionResult 返却)
 *              TC2 (invalid_group_name → setFieldError 呼出 + refresh 非呼出)
 * 🔵 TASK-0010.md §実装詳細 / dataflow.md §3 D5-1〜D5-4 / interfaces.ts §5 UseCreateGroupReturn
 */

import type { Database } from '~/types/supabase'
import type { Ref } from 'vue'

/** ActionResult<T>: アクション関数の共通戻り値型 (interfaces.ts §3 契約に従う) 🔵 */
interface ActionResult<T> {
  data: T | null
  error: unknown
}

/** UseCreateGroupReturn: useCreateGroup の戻り値型 (interfaces.ts §5 契約に従う) 🔵 */
interface UseCreateGroupReturn {
  create: (groupName: string) => Promise<ActionResult<string>>
  pending: Ref<boolean>
  fieldErrors: Ref<Record<string, string>>
}

/**
 * 【機能概要】: グループ作成 RPC composable
 * 【実装方針】: UseCreateGroupReturn 契約に従い { create, pending, fieldErrors } を返す
 *             clear() → pending=true → rpc → 成否分岐 → pending=false(finally) の順序を厳守
 * 🔵 interfaces.ts §5 UseCreateGroupReturn / architecture.md §既存 API マッピング
 * @returns UseCreateGroupReturn — { create, pending: Ref<boolean>, fieldErrors: Ref<Record<string, string>> }
 */
export function useCreateGroup(): UseCreateGroupReturn {
  // 【pending state 初期化】: 二重送信防止のため false で初期化 (EDGE-003) 🔵
  const pending = ref(false)

  // 【useFormErrors 取得】: fieldErrors / setFieldError / clear を inline チャネルとして使用 🔵
  const { fieldErrors, setFieldError, clear } = useFormErrors()

  // 【Supabase クライアント取得】: Database 型付きで型安全に RPC を呼ぶ 🔵
  const supabase = useSupabaseClient<Database>()

  /**
   * 【機能概要】: グループ名を受け取り create_group_with_owner RPC を実行する
   * 【実装方針】:
   *   1. clear() で前回エラーを消去
   *   2. pending.value = true で二重送信ガード
   *   3. rpc('create_group_with_owner', { group_name }) を await
   *   4. エラー時: setFieldError('name', error) → refresh は呼ばない
   *   5. 成功時: useCurrentGroup().refresh() を await して所属状態を最新化
   *   6. finally で pending.value = false（成功・エラーどちらでも確実にリセット）
   * 🔵 TASK-0010.md §実装詳細 / dataflow.md §3 D5-1〜D5-4
   * @param groupName - グループ名 (Zod で事前検証済み、RPC 側で二重防御)
   * @returns ActionResult<string> — { data: group_id | null, error: unknown }
   */
  async function create(groupName: string): Promise<ActionResult<string>> {
    // 【前回エラー消去】: フォーム再送信前に前回の inline エラーをクリア (D5-1) 🔵
    clear()

    // 【pending 開始】: RPC 実行中は pending=true で UI 側がボタン disabled を制御可能にする (EDGE-003) 🔵
    pending.value = true

    try {
      // 【RPC 実行】: create_group_with_owner を group_name 引数で呼ぶ（p_group_name は誤記） 🔵
      const { data, error } = await supabase.rpc('create_group_with_owner', { group_name: groupName })

      if (error) {
        // 【エラー処理】: invalid_group_name エラーを inline チャネル (useFormErrors) に渡す
        //              文言変換は useFormErrors → useErrorMessage の責務（責務分離） 🔵
        //              refresh は呼ばない（所属状態は変更されていないため） 🔵
        setFieldError('name', error)
        return { data: null, error }
      }

      // 【所属状態最新化】: 成功時のみ refresh を await して group_members キャッシュを更新 (D5-4) 🔵
      await useCurrentGroup().refresh()

      // 【成功戻り値】: ActionResult<string> 契約に従い { data: group_id, error: null } を返す 🔵
      return { data, error: null }
    } finally {
      // 【pending リセット】: 成功・エラーを問わず必ず false に戻す（二重送信防止 EDGE-003） 🔵
      pending.value = false
    }
  }

  // 【戻り値】: UseCreateGroupReturn 契約に従い { create, pending, fieldErrors } を expose 🔵
  return { create, pending, fieldErrors }
}
