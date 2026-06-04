/**
 * 【機能概要】: 所属 Group の未削除選手一覧を name 昇順で返す Read composable
 * 【実装方針】: useAsyncData<Player[]>('players', handler) 固定キー (ADR-007 D4)。
 *             useCurrentGroup の group_id を読み、deleted_at IS NULL でフィルタして取得する。
 * 🔵 interfaces.ts UsePlayersReturn / useCurrentGroup.ts / REQ-001 / NFR-001
 */
import type { Database } from '~/types/supabase'
import type { Player } from '~/types/player'
import { useCurrentGroup } from '~/composables/useCurrentGroup'

export function usePlayers() {
  // 【型付きクライアント】: useCurrentGroup.ts と同じ Database 型付きクライアントを共有 🔵
  const client = useSupabaseClient<Database>()

  // 【所属 Group 読取】: ADR-006 で 1 user = 1 group。group_id を AsyncData から読む 🔵
  const currentGroup = useCurrentGroup()

  // 【固定キー useAsyncData】: 'players' 固定で 1 ナビゲーション 1 クエリを保証 (ADR-007 D4) 🔵
  return useAsyncData<Player[]>('players', async () => {
    // 【group_id 取得】: useCurrentGroup の data から group_id を読む 🔵
    const gid = currentGroup.data.value?.group_id

    // 【未取得ガード】: group_id 未取得 (未所属/未認証) はクエリ未発行で空配列を返す (REQ-201) 🔵
    if (!gid) return []

    // 【players SELECT】: 自 Group・未削除のみを name 昇順で取得。
    //   eq('group_id', gid) を明示 (RLS と二重)、is('deleted_at', null) で部分インデックス対象 (NFR-001, EDGE-005)。 🔵
    const { data, error } = await client
      .from('players')
      .select('id, name, handedness')
      .eq('group_id', gid)
      .is('deleted_at', null)
      .order('name')

    // 【エラー処理】: クエリエラーは throw して error.vue グローバルフォールバックに委ねる 🔵
    if (error) throw error

    // 【結果返却】: 0 件は空配列。handedness を Handedness に narrow して Player[] を返す 🔵
    return (data ?? []) as Player[]
  })
}
