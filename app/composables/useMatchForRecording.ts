/**
 * 【機能概要】: 録画対象の試合を1件 (by id) 読み、VideoSource 構築材料 + 4 選手ロスターへ射影する Read composable
 * 【実装方針】: useMatches.ts と同型。複合 FK は制約名ヒントで埋め込み (実地検証済)。
 *             単件のため RLS (matches_select = is_member_of(group_id)) でスコープされる。
 *             削除済 player も name を維持するため players 側に deleted_at フィルタをかけない (EDGE-007)。
 * interfaces.ts MatchForRecording / REQ-001 / REQ-004
 */
import type { Database } from '~/types/supabase'
import type { MatchForRecording } from '~/types/match-recording'

export function useMatchForRecording(matchId: string) {
  const client = useSupabaseClient<Database>()

  return useAsyncData<MatchForRecording | null>(`match-for-recording-${matchId}`, async () => {
    // 【埋め込み select】: 複合 FK は制約名ヒントで解決 (useMatches.ts と同様)
    const { data, error } = await client
      .from('matches')
      .select('id, name, match_type, video_source_type, video_source_url, completed_at, ta1:players!matches_group_id_team_a_player1_id_fkey(id, name), ta2:players!matches_group_id_team_a_player2_id_fkey(id, name), tb1:players!matches_group_id_team_b_player1_id_fkey(id, name), tb2:players!matches_group_id_team_b_player2_id_fkey(id, name)')
      .eq('id', matchId)
      .is('deleted_at', null)
      .single()

    if (error) throw error
    if (!data) return null

    // 【マッピング】: snake_case 列 + 埋め込み → MatchForRecording (team 付きロスター)。
    //   singles は player2 の埋め込みが null → 各チーム 1 人 (計 2 人)、doubles は計 4 人。
    const roster: MatchForRecording['roster'] = []
    if (data.ta1) roster.push({ playerId: data.ta1.id, name: data.ta1.name, team: 'A' })
    if (data.ta2) roster.push({ playerId: data.ta2.id, name: data.ta2.name, team: 'A' })
    if (data.tb1) roster.push({ playerId: data.tb1.id, name: data.tb1.name, team: 'B' })
    if (data.tb2) roster.push({ playerId: data.tb2.id, name: data.tb2.name, team: 'B' })

    return {
      id: data.id,
      name: data.name,
      matchType: data.match_type as MatchForRecording['matchType'],
      videoSourceType: data.video_source_type as MatchForRecording['videoSourceType'],
      videoSourceUrl: data.video_source_url,
      completedAt: data.completed_at,
      roster
    }
  })
}
