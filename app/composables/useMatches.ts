/**
 * 【機能概要】: 所属 Group の未削除試合を match_date 降順→created_at 降順で返す Read composable
 * 【実装方針】: useAsyncData<MatchListItem[]>('matches', handler) 固定キー (ADR-007 D4)。
 *             usePlayers.ts と同型。4 選手名は PostgREST 埋め込みで解決 (EDGE-007)。
 *             matches→players は複合 FK のため、埋め込みヒントは **制約名** を使う
 *             (実地検証 2026-06-05: 単一列ヒントは PGRST200、制約名ヒントは 200 で解決。§TASK-0003 §1)。
 * interfaces.ts UseMatchesReturn / REQ-001 / REQ-201 / NFR-001 / NFR-203
 */
import type { Database } from '~/types/supabase'
import type { MatchListItem, VideoSourceType } from '~/types/match'
import { useCurrentGroup } from '~/composables/useCurrentGroup'

export function useMatches() {
  const client = useSupabaseClient<Database>()
  const currentGroup = useCurrentGroup()

  return useAsyncData<MatchListItem[]>('matches', async () => {
    const gid = currentGroup.data.value?.group_id
    // 【未取得ガード】: group_id 未取得 (未所属/未認証) はクエリ未発行で空配列 (REQ-201)
    if (!gid) return []

    // 【埋め込み select】: 複合 FK は制約名ヒントで解決 (実地検証済)。削除済 player も name を維持
    //   するため players 側に deleted_at フィルタをかけない (EDGE-007)。
    const { data, error } = await client
      .from('matches')
      .select('id, name, match_date, created_at, video_source_type, video_source_url, ta1:players!matches_group_id_team_a_player1_id_fkey(id, name), ta2:players!matches_group_id_team_a_player2_id_fkey(id, name), tb1:players!matches_group_id_team_b_player1_id_fkey(id, name), tb2:players!matches_group_id_team_b_player2_id_fkey(id, name)')
      .eq('group_id', gid)
      .is('deleted_at', null)
      .order('match_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) throw error

    // 【マッピング】: snake_case 列 + 埋め込み → MatchListItem[]
    return (data ?? []).map((row): MatchListItem => ({
      id: row.id,
      name: row.name,
      matchDate: row.match_date,
      teamA: [{ id: row.ta1.id, name: row.ta1.name }, { id: row.ta2.id, name: row.ta2.name }],
      teamB: [{ id: row.tb1.id, name: row.tb1.name }, { id: row.tb2.id, name: row.tb2.name }],
      videoSourceType: row.video_source_type as VideoSourceType,
      videoSourceUrl: row.video_source_url
    }))
  })
}
