/**
 * 【機能概要】: 招待リンクコードを生成する Write 系 composable
 * 【実装方針】: rpc('generate_invitation_code', { target_group_id }) を呼び、
 *             成功時は useListInvitations(targetGroupId).refresh() で一覧を更新し、
 *             成功 toast を表示する。エラー時は showError(error) で一過性 toast チャネルに流す。
 *             pending は try/finally で確実に false にリセット（EDGE-003 二重送信防止）
 * 【テスト対応】: TC2 (成功 → RPC 引数検証 + refresh 呼出 + 成功 toast)
 *              TC3 (not_a_member → showError 呼出 + refresh 非呼出 + 成功 toast 非呼出)
 * 🔵 REQ-007 / REQ-110 / TASK-0012.md §実装詳細 / dataflow.md §5 D5-4
 *    / error-handling.md §6.5 代表例 #5 / interfaces.ts UseGenerateInvitationReturn
 */

import type { Database } from '~/types/supabase'
import type { Ref } from 'vue'

/**
 * ActionResult<T>: アクション関数の共通戻り値型 (interfaces.ts §3 契約に従う) 🔵
 * TODO: useCreateGroup / useJoinGroup / useGenerateInvitation に分散している ActionResult<T> を
 *       将来 app/types/interfaces.ts または app/types/action-result.ts に集約する。
 *       変更時は既存 composable のテストを全て通過させてから実施すること（TASK-0012 Refactor スコープ外）。 🔴
 */
interface ActionResult<T> {
  data: T | null
  error: unknown
}

/**
 * UseGenerateInvitationReturn: useGenerateInvitation の戻り値型 (interfaces.ts §5 契約に従う) 🔵
 * TODO: interfaces.ts の設計文書定義と一致しているが、ローカル定義のまま。
 *       型集約時に app/types/interfaces.ts からインポートする形に変更する（TASK-0012 Refactor スコープ外）。 🔴
 */
interface UseGenerateInvitationReturn {
  generate: (targetGroupId: string) => Promise<ActionResult<string>>
  pending: Ref<boolean>
}

/**
 * 【機能概要】: 招待リンクコード生成 RPC composable
 * 【実装方針】: UseGenerateInvitationReturn 契約に従い { generate, pending } を返す
 *             pending=true → rpc → 成否分岐 → pending=false(finally) の順序を厳守
 * 🔵 interfaces.ts §5 UseGenerateInvitationReturn / architecture.md §既存 API マッピング
 * @returns UseGenerateInvitationReturn — { generate, pending: Ref<boolean> }
 */
export function useGenerateInvitation(): UseGenerateInvitationReturn {
  // 【pending state 初期化】: 二重送信防止のため false で初期化 (EDGE-003) 🔵
  const pending = ref(false)

  // 【Supabase クライアント取得】: composable setup レベルで取得し mock 注入を確実に行う 🔵
  const supabase = useSupabaseClient<Database>()

  // 【i18n 取得】: setup レベルで取得することで Vue コンポーネントコンテキスト外呼び出しエラーを回避
  //   useI18n は Vue の setup 関数内で呼ぶ必要があるため、generate 関数内ではなくここで取得する。 🔵
  const { t } = useI18n()

  // 【useToastErrors 取得】: setup レベルで取得することで useErrorMessage 内の useI18n を setup 内に収める
  //   useToastErrors → useErrorMessage → useI18n の呼び出し連鎖が全て setup コンテキスト内で実行される。 🔵
  const { showError } = useToastErrors()

  // 【useToast 取得】: setup レベルで取得する。
  //   useToastErrors.ts は showError() 内で useToast() を遅延取得するパターンだが、
  //   本 composable では成功 toast を直接呼ぶため setup レベルで取得して Vue コンポーネントコンテキストを確実に確保する。
  //   テストでは vi.mock('@nuxt/ui/composables/useToast') で差し替え済みのため機能的に等価。 🟡
  const toast = useToast()

  /**
   * 【機能概要】: targetGroupId に対して generate_invitation_code RPC を実行する
   * 【実装方針】:
   *   1. pending.value = true で二重送信ガード
   *   2. rpc('generate_invitation_code', { target_group_id: targetGroupId }) を await
   *   3. エラー時: showError(error) で一過性 toast チャネルに流す
   *      (NOT_A_MEMBER / INVITATION_CODE_COLLISION_AFTER_RETRY 等、文言変換は useToastErrors 責務)
   *   4. 成功時: useListInvitations(targetGroupId).refresh() で一覧キャッシュを更新 (D5-4)
   *      → toast.add({ title: t('groups.settings.invitationGenerated') }) で成功 toast 表示 (NFR-204)
   *   5. finally で pending.value = false（成功・エラーどちらでも確実にリセット）
   * 🔵 TASK-0012.md §実装詳細 / dataflow.md §5 D5-1〜D5-4
   * @param targetGroupId - 招待コードを発行するグループ ID
   * @returns ActionResult<string> — { data: 8 hex code | null, error: unknown }
   */
  async function generate(targetGroupId: string): Promise<ActionResult<string>> {
    // 【pending 開始】: RPC 実行中は pending=true で UI 側がボタン disabled を制御可能にする (EDGE-003) 🔵
    pending.value = true

    try {
      // 【RPC 実行】: generate_invitation_code を target_group_id 引数で呼ぶ
      //   引数名は snake_case の target_group_id (p_target_group_id 等の誤記ではない)。 🔵
      const { data, error } = await supabase.rpc('generate_invitation_code', {
        target_group_id: targetGroupId
      })

      if (error) {
        // 【エラー処理】: not_a_member / invitation_code_collision_after_retry を
        //              一過性 toast チャネル (useToastErrors) に流す。
        //              文言変換は useToastErrors → useErrorMessage の責務（責務分離）。
        //              refresh と成功 toast は呼ばない（一覧状態は変更されていないため）。 🔵
        showError(error)
        return { data: null, error }
      }

      // 【一覧キャッシュ更新】: 成功時のみ refresh を await して招待リンク一覧を最新化 (D5-4)
      //   同一キー 'invitations-list:{targetGroupId}' の useAsyncData キャッシュが無効化されて再フェッチが走る。 🔵
      await useListInvitations(targetGroupId).refresh()

      // 【成功 toast 表示】: 「招待リンクを発行しました」を i18n 経由で表示 (NFR-203/NFR-204)
      //   リテラル直書き禁止: t('groups.settings.invitationGenerated') で引くこと。 🔵
      toast.add({ title: t('groups.settings.invitationGenerated') })

      // 【成功戻り値】: ActionResult<string> 契約に従い { data: 8 hex code, error: null } を返す 🔵
      return { data, error: null }
    } finally {
      // 【pending リセット】: 成功・エラーを問わず必ず false に戻す（二重送信防止 EDGE-003） 🔵
      pending.value = false
    }
  }

  // 【戻り値】: UseGenerateInvitationReturn 契約に従い { generate, pending } を expose 🔵
  return { generate, pending }
}
