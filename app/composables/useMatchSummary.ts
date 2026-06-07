/**
 * 【機能概要】: 試合のサマリー（各セットのスコア + 取得セット数 + 試合勝者）を集計する Read composable。完了確認用。
 * 【実装方針】: sets + rallies(point_winner) を埋め込みで取得し、point_winner の COUNT でスコアを導出（② B-7）。
 *             score_team_a/b 列は持たないためクライアント集計。RLS (sets_select FK 経由) でスコープ。
 *             matchWinner は best-of-3 (先に2セット) を既定とする（MVP、REQ-011）。
 * interfaces.ts MatchSummary / REQ-011
 */
import type { Database } from '~/types/supabase'
import type { MatchSummary, SetScore } from '~/types/match-recording'
import type { Team } from '~/utils/rule-engine/types'

const MATCH_SET_TARGET = 2

export function useMatchSummary(matchId: string) {
  const client = useSupabaseClient<Database>()

  return useAsyncData<MatchSummary>(`match-summary-${matchId}`, async () => {
    const { data, error } = await client
      .from('sets')
      .select('set_number, winner, deleted_at, rallies(point_winner, deleted_at)')
      .eq('match_id', matchId)
      .is('deleted_at', null)
      .order('set_number', { ascending: true })

    if (error) throw error

    const sets = (data ?? []).map((s): SetScore => {
      const rs = (s.rallies ?? []).filter(r => r.deleted_at === null)
      return {
        setNumber: s.set_number,
        scoreA: rs.filter(r => r.point_winner === 'A').length,
        scoreB: rs.filter(r => r.point_winner === 'B').length,
        winner: s.winner as Team | null
      }
    })

    const setsWonA = sets.filter(s => s.winner === 'A').length
    const setsWonB = sets.filter(s => s.winner === 'B').length
    const matchWinner: Team | null = setsWonA >= MATCH_SET_TARGET ? 'A' : setsWonB >= MATCH_SET_TARGET ? 'B' : null

    return { sets, setsWonA, setsWonB, matchWinner }
  })
}
