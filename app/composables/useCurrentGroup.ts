/**
 * 【機能概要】: ログイン中ユーザが所属している Group を 1 件読み取る Read 専用 composable
 * 【実装方針】: useAsyncData('current-group', handler) の固定キーでラップし、
 *             middleware と page が同一キーを共有して 1 ナビゲーション 1 クエリを保証する (NFR-002 / ADR-008 D4)
 * 【テスト対応】: TC1 (所属あり SELECT 結果素通し + uid 絞り込み検証) / TC2 (0 行 null 素通し検証)
 * 🔵 REQ-005 / ADR-006 / ADR-007 / ADR-008 D4 / interfaces.ts UseCurrentGroupReturn
 */

import type { Database } from '~/types/supabase'

// 【型エイリアス】: group_members + groups 埋め込みの SELECT 結果型
//   supabase.ts 生成型から group_id を直接参照し、groups embed は FK 必須でも | null 許容 (isOneToOne: false)。
//   UseCurrentGroupReturn (interfaces.ts) = AsyncState<CurrentGroup> ≈ AsyncData<CurrentGroup | null, Error>。 🔵
type CurrentGroup = {
  group_id: Database['public']['Tables']['group_members']['Row']['group_id']
  groups: Pick<Database['public']['Tables']['groups']['Row'], 'id' | 'name'> | null
}

/**
 * 【機能概要】: 現在の認証済みユーザが所属する Group を取得する composable
 * 【実装方針】: group_members テーブルを groups 埋め込み付きで SELECT し AsyncData<CurrentGroup | null> を返す。
 *             所属なし（0 行）は null を正常値として返す（例外を投げない）。
 *             クエリエラーは throw し error.vue グローバルフォールバックに委ねる。
 * 【設計契約】: interfaces.ts UseCurrentGroupReturn = AsyncState<CurrentGroup> と対応
 *             (data / pending / error / refresh の 4 プロパティを呼び出し側が await で受け取る)
 * 【テスト対応】: useAsyncData をスタブするテストが handler を即時実行して data.value を検証する
 * 🔵 architecture.md §既存 API マッピング / TASK-0009.md 実装詳細
 * @returns AsyncData<CurrentGroup | null> — middleware と page が同一キー 'current-group' を共有する
 */
export function useCurrentGroup() {
  // 【supabase クライアント取得】: Database 型付きで型安全に PostgREST SELECT を呼ぶ 🔵
  const client = useSupabaseClient<Database>()

  // 【認証ユーザ取得】: uid は user.sub (user.id ではない) — memory project_mvp_revised_scope 確定 🔵
  const user = useSupabaseUser()

  // 【useAsyncData 固定キー + 型パラメータ明示】: 'current-group' 固定でラップ。
  //   <CurrentGroup | null> 型パラメータにより handler の戻り値型を明示し、呼び出し側の data.value 型を確定させる。
  //   未所属（0 行）は null を正常値として返すため | null が必要。 🔵
  //   middleware (TASK-0013) と各保護 page が同一キーを共有し、1 ナビゲーション 1 クエリを保証する (NFR-002)。
  //   動的キーにすると重複クエリが発生するため禁止 (ADR-008 D4)。 🔵
  return useAsyncData<CurrentGroup | null>('current-group', async () => {
    // 【uid 取得】: JWT の sub claim を uid として使用 (user.id ではない点に注意) 🔵
    const uid = user.value?.sub

    // 【未認証ガード】: uid が undefined の場合はクエリを発行せず null を即返す。
    //   middleware が /confirm 等でこの composable を呼ぶ場合に未認証状態になり得るため (architecture.md §未認証)。 🔵
    if (!uid) return null

    // 【group_members SELECT】: groups を埋め込みで取得し、uid で絞り込む。
    //   ADR-006 で 1 user = 1 group が保証されるため maybeSingle() を使用。
    //   0 行は { data: null, error: null } で正常値として返る (.maybeSingle の仕様)。 🔵
    const { data, error } = await client
      .from('group_members')
      .select('group_id, groups(id, name)')
      .eq('user_id', uid)
      .maybeSingle()

    // 【エラーハンドリング】: クエリエラーはそのまま throw して error.vue グローバルフォールバックに委ねる。
    //   本 composable はエラー整形・チャネル分岐を持たない (requirements.md §3 / error-handling.md 非適用)。 🔵
    if (error) throw error

    // 【結果返却】: 所属あり → { group_id, groups: { id, name } | null } / 未所属 → null を素通しする。
    //   groups embed は supabase.ts 生成型で | null 許容確定 (requirements.md §5)。 🔵
    return data
  })
}
