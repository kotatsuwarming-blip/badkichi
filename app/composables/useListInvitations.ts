/**
 * 【機能概要】: 指定グループの招待リンク一覧を取得する Read 専用 composable
 * 【実装方針】: useAsyncData('invitations-list:{groupId}', handler) でラップし、
 *             useGenerateInvitation と同一キーを共有して refresh 時に自動再フェッチを保証する (D5-4)
 * 【テスト対応】: TC1 (group_id + deleted_at is null 絞り込み検証 + Invitation[] 素通し確認)
 * 🔵 REQ-006 / TASK-0012.md §TC1 / interfaces.ts UseListInvitationsReturn / Invitation
 */

import type { Database } from '~/types/supabase'

/**
 * 【型定義】: group_invitations テーブルから UI で必要な列のみ Pick する Invitation 型
 * 【設計方針】: status 列は DB に存在しない。有効/期限切れは expires_at < now() で UI が派生算出する。
 * 🔵 interfaces.ts Invitation / note.md §6 「group_invitations に status 列は無い」
 * TODO: interfaces.ts の設計文書定義と一致しているが、ローカル定義のまま。
 *       将来 app/types/interfaces.ts に集約して useListInvitations からインポートする形に変更する（TASK-0012 Refactor スコープ外）。 🔴
 */
type Invitation = Pick<
  Database['public']['Tables']['group_invitations']['Row'],
  'id' | 'code' | 'created_at' | 'expires_at'
>

/**
 * 【機能概要】: 指定グループの招待リンク一覧を取得する composable
 * 【実装方針】: group_invitations テーブルから id/code/created_at/expires_at の 4 列を SELECT し、
 *             group_id 絞り込み + deleted_at is null フィルタで論理削除済みを除外する。
 *             useAsyncData キーは 'invitations-list:{groupId}' で固定し、
 *             useGenerateInvitation が同じキーで refresh を呼ぶことで一覧が自動更新される (D5-4)。
 * 【設計契約】: interfaces.ts UseListInvitationsReturn = AsyncState<Invitation[]> と対応
 *             (data / pending / error / refresh の 4 プロパティを返す)
 * 🔵 architecture.md §既存 API マッピング / TASK-0012.md 実装詳細 / dataflow.md §5 D5-4
 * @param groupId - 取得対象のグループ ID
 * @returns AsyncData<Invitation[]> — useGenerateInvitation と同一キー共有で refresh が効く
 */
export function useListInvitations(groupId: string) {
  // 【Supabase クライアント取得】: Database 型付きで型安全に PostgREST SELECT を呼ぶ 🔵
  const supabase = useSupabaseClient<Database>()

  // 【useAsyncData 動的キー + handler】:
  //   キー: 'invitations-list:{groupId}' — groupId ごとに独立したキャッシュを持つ
  //   useGenerateInvitation.generate(targetGroupId) 内で useListInvitations(targetGroupId).refresh() を呼ぶと
  //   同一キーのキャッシュが無効化されて再フェッチが走る (D5-4 同一キー refresh パターン)。
  //   文字列連結形式は note.md §6「invitations-list' + ':' + groupId 文字列連結明示」に従う。 🔵
  return useAsyncData<Invitation[]>('invitations-list:' + groupId, async () => {
    // 【SELECT 実行】: id/code/created_at/expires_at の 4 列のみ取得
    //   status 列は DB に存在しないため SELECT しない (note.md §6 UI 派生値)。 🔵
    const { data, error } = await supabase
      .from('group_invitations')
      .select('id, code, created_at, expires_at')
      // 【group_id 絞り込み】: 指定グループの招待リンクのみを取得 🔵
      .eq('group_id', groupId)
      // 【論理削除フィルタ】: deleted_at is null で削除済みレコードを除外
      //   MVP では削除機能がないため全件と等価だが、ソフトデリート前提で明示的に書く。
      //   将来の削除機能追加時に機能する (note.md §6 deleted_at フィルタ明示)。 🔵
      .is('deleted_at', null)

    // 【エラーハンドリング】: クエリエラーはそのまま throw して error.vue グローバルフォールバックに委ねる。
    //   本 composable はエラー整形・チャネル分岐を持たない (useCurrentGroup と同型)。 🔵
    if (error) throw error

    // 【結果返却】: データが null の場合は空配列を返す（型安全のため ?? [] 使用）🔵
    return data ?? []
  })
}
