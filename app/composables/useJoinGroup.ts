/**
 * 【機能概要】: グループ参加 RPC を実行する Write 系 composable
 * 【実装方針】: rpc('join_group_with_code', { invite_code }) を呼び、
 *             成功時は useCurrentGroup().refresh() で所属状態を最新化し、
 *             エラー時は DB メッセージ → App 識別子へ明示変換後に useNoticeErrors チャネルに渡す。
 *             pending は try/finally で確実に false にリセット（EDGE-003 二重送信防止）
 * 【EDGE-005 核心】: DB の 'invitation_not_found' と App の 'invitation_not_found_by_link' は文字列が異なるため
 *             useJoinGroup 内で明示変換して setNotice に渡す（素朴な includes では一致しない）
 * 【テスト対応】: TC1 (成功 → RPC 引数検証 + refresh 呼出 + notice null)
 *              TC2 (invitation_not_found → 明示変換で INVITATION_NOT_FOUND_BY_LINK + notice 反映)
 *              TC3 (already_in_group → 詰め替え不要で notice 反映)
 *              TC4 (invitation_expired → 詰め替え不要で notice 反映)
 * 🔵 TASK-0011.md §実装詳細 / dataflow.md §4 D5-1〜D5-4 / interfaces.ts §5 UseJoinGroupReturn
 */

import { APP_ERROR_CODES } from '~/types/error-codes'
import type { Database } from '~/types/supabase'
import type { Ref } from 'vue'

/**
 * ActionResult<T>: アクション関数の共通戻り値型 (interfaces.ts §3 契約に従う) 🔵
 * 【型重複 TODO】: useCreateGroup.ts にも同名インターフェースが存在する。
 *   設計上の共通定義は docs/design/auth-onboarding/interfaces.ts §3 にある。
 *   将来 app/types/interfaces.ts 等への集約を検討するが、既存 composable のテストを
 *   壊さず移行するには慎重な作業が必要なため、本タスクスコープ外とし TODO のみ記録。 🟡
 */
interface ActionResult<T> {
  data: T | null
  error: unknown
}

/**
 * UseJoinGroupReturn: useJoinGroup の戻り値型 (interfaces.ts §5 契約に従う) 🔵
 * 【型重複 TODO】: UseCreateGroupReturn と同様、将来 app/types/interfaces.ts への集約候補。
 *   設計上の契約は docs/design/auth-onboarding/interfaces.ts §5 UseJoinGroupReturn 参照。 🟡
 */
interface UseJoinGroupReturn {
  join: (inviteCode: string) => Promise<ActionResult<string>>
  pending: Ref<boolean>
  notice: Ref<string | null>
}

/**
 * 【機能概要】: グループ参加 RPC composable
 * 【実装方針】: UseJoinGroupReturn 契約に従い { join, pending, notice } を返す
 *             clear() → pending=true → rpc → 成否分岐 → pending=false(finally) の順序を厳守
 * 🔵 interfaces.ts §5 UseJoinGroupReturn / architecture.md §既存 API マッピング
 * @returns UseJoinGroupReturn — { join, pending: Ref<boolean>, notice: Ref<string | null> }
 */
export function useJoinGroup(): UseJoinGroupReturn {
  // 【pending state 初期化】: 二重送信防止のため false で初期化 (EDGE-003) 🔵
  const pending = ref(false)

  // 【useNoticeErrors 取得】: notice / setNotice / clear を notice チャネルとして使用 🔵
  const { notice, setNotice, clear } = useNoticeErrors()

  // 【Supabase クライアント取得】: Database 型付きで型安全に RPC を呼ぶ 🔵
  const supabase = useSupabaseClient<Database>()

  /**
   * 【機能概要】: 招待コードを受け取り join_group_with_code RPC を実行する
   * 【実装方針】:
   *   1. clear() で前回 notice をリセット
   *   2. pending.value = true で二重送信ガード
   *   3. rpc('join_group_with_code', { invite_code }) を await
   *   4. エラー時: 明示変換 (EDGE-005) 後に setNotice(mapped) → refresh は呼ばない
   *      - 'invitation_not_found' → APP_ERROR_CODES.INVITATION_NOT_FOUND_BY_LINK に詰め替え
   *      - 'already_in_group' / 'invitation_expired' は文字列一致するため詰め替え不要
   *   5. 成功時: useCurrentGroup().refresh() を await して所属状態を最新化
   *   6. finally で pending.value = false（成功・エラーどちらでも確実にリセット）
   *   7. return { data, error } — error は詰め替え前の元エラーを返す（setNotice 用の詰め替えは戻り値に影響しない）
   * 🔵 TASK-0011.md §実装詳細 / dataflow.md §4 D5-1〜D5-4 / architecture.md 注2 (EDGE-005)
   * @param inviteCode - 招待コード (URL から取得)
   * @returns ActionResult<string> — { data: group_id | null, error: unknown }
   */
  async function join(inviteCode: string): Promise<ActionResult<string>> {
    // 【前回通知消去】: 再送信前に前回の notice チャネルをクリア (D5-1) 🔵
    clear()

    // 【pending 開始】: RPC 実行中は pending=true で UI 側がボタン disabled を制御可能にする (EDGE-003) 🔵
    pending.value = true

    try {
      // 【RPC 実行】: join_group_with_code を invite_code 引数で呼ぶ 🔵
      const { data, error } = await supabase.rpc('join_group_with_code', { invite_code: inviteCode })

      if (error) {
        // 【EDGE-005 明示変換】: DB の 'invitation_not_found' と App 識別子 'invitation_not_found_by_link' は文字列が異なる。
        //   isAppError は message.includes(code) で判定するため、詰め替えなしでは fallthrough して errors.generic になる。
        //   明示変換: 'invitation_not_found' を含み 'invitation_not_found_by_link' を含まない場合に App 識別子へ詰め替える。
        //   【意図的な二重条件】: includes('invitation_not_found') && !includes('invitation_not_found_by_link') の二重条件は
        //   一見冗長に見えるが意図的である。'invitation_not_found_by_link' は 'invitation_not_found' を includes するため、
        //   後者の否定がないと App 識別子(詰め替え後)を誤って再変換してしまう。将来 DB 側が識別子を変更した場合の
        //   安全弁としても機能する。削除・簡略化しないこと。 🔵
        const msg = (error as { message?: string }).message ?? ''
        const mapped = msg.includes('invitation_not_found') && !msg.includes('invitation_not_found_by_link')
          ? { ...error, message: APP_ERROR_CODES.INVITATION_NOT_FOUND_BY_LINK }
          : error

        // 【setNotice 呼び出し】: 詰め替え後のエラーを渡す（文言変換は useNoticeErrors → useErrorMessage の責務） 🔵
        //   already_in_group / invitation_expired は文字列一致するため詰め替え不要で mapped === error のまま
        setNotice(mapped)

        // 【戻り値】: error は詰め替え前の元エラーを返す（TC2 の契約: return { data:null, error: 元エラー }） 🔵
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

  // 【戻り値】: UseJoinGroupReturn 契約に従い { join, pending, notice } を expose 🔵
  return { join, pending, notice }
}
