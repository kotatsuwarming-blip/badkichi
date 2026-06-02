/**
 * 【機能概要】: 指定グループのメンバー一覧を取得する Read 専用 composable
 * 【実装方針】:
 *   - group_members テーブルから user_id / joined_at を SELECT する。
 *   - auth.users の user_metadata (full_name / name / email / avatar_url) は、
 *     Supabase RLS の制約により他ユーザーのメタデータをクライアントから直接取得することができないため、
 *     本 composable は user_id のみを返す。UI 側で現在ログイン中ユーザーと突き合わせて表示する。
 *   - page から supabase を直叩きしない (REQ-406 / ADR-005 D1)
 * 【制約確定メモ】: 🟡
 *   - Supabase の auth.users テーブルはクライアント SDK からは直接参照不可。
 *   - profiles テーブルが存在しないため、他メンバーの表示名・avatar の取得は現時点で不可能。
 *   - 現在の実装では user_id 一覧を返し、UI 側で useSupabaseUser() と照合して自分のみ表示名を出す。
 * 🟡 TASK-0019 / REQ-006 / requirements.md §3 メンバー一覧取得制約 (実装時確定)
 */

import type { Database } from '~/types/supabase'

/**
 * 【型定義】: メンバー一覧の各メンバー型
 * 【設計方針】: user_id と joined_at のみ返す。表示名・avatar は UI 側で useSupabaseUser() を使って
 *             現在ユーザーと照合して補完する。
 * 🟡 実装時確定。将来 profiles テーブル追加後にこの型を拡張する。
 *
 * TODO: profiles テーブル追加後に display_name / avatar_url フィールドをこの型に追加し、
 *       JOIN クエリで全メンバーの表示名・avatar を取得できるよう本 composable を拡張する。
 *       それまでは UI 側が useSupabaseUser() と照合して現在ユーザーのみ表示名を補完している。
 */
export type GroupMember = {
  user_id: string
  joined_at: string
}

/**
 * 【機能概要】: 指定グループのメンバー一覧を取得する composable
 * 【実装方針】: group_members テーブルから user_id / joined_at を SELECT して返す。
 *             RLS により当該グループのメンバーのみ参照可能 (data-foundation 実装済)。
 *             deleted_at IS NULL フィルタでソフトデリート済みメンバーを除外する。
 * 🟡 信頼性レベル: TASK-0019 requirements.md §3「group_members で当該グループのメンバー集合を取得」に基づく
 *    ただし取得方法は実装時確定事項 (🟡) のため、取得可能なカラムに絞った実装
 * @param groupId - 取得対象のグループ ID
 * @returns AsyncData<GroupMember[]>
 */
export function useListGroupMembers(groupId: string) {
  // 【Supabase クライアント取得】: Database 型付きで型安全に SELECT を呼ぶ 🔵
  const supabase = useSupabaseClient<Database>()

  // 【useAsyncData 動的キー】: 'group-members-list:{groupId}' でグループごとにキャッシュを分離 🟡
  return useAsyncData<GroupMember[]>('group-members-list:' + groupId, async () => {
    // 【group_members SELECT】: user_id と joined_at のみ取得。
    //   auth.users の user_metadata は RLS 制約により他ユーザー分は取得不可のため SELECT しない。 🟡
    const { data, error } = await supabase
      .from('group_members')
      .select('user_id, joined_at')
      // 【group_id 絞り込み】: 対象グループのメンバーのみ取得 🔵
      .eq('group_id', groupId)
      // 【論理削除フィルタ】: deleted_at IS NULL で削除済みメンバーを除外 🟡
      .is('deleted_at', null)

    // 【エラーハンドリング】: クエリエラーは throw して error.vue グローバルフォールバックに委ねる 🔵
    if (error) throw error

    // 【結果返却】: データが null の場合は空配列を返す 🔵
    return data ?? []
  })
}
