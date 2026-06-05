/**
 * 【機能概要】: 既存試合の全項目を update する Write composable (REQ-003)
 * 【実装方針】: useUpdatePlayer.ts の pending/try-finally を踏襲。
 *             update({…}).eq('id', id).select().single() を実行する。group_id は送らない。
 * interfaces.ts UseUpdateMatchReturn / REQ-003 / matches_update RLS
 */
import type { Database } from '~/types/supabase'
import type { UpdateMatchInput, MatchListItem } from '~/types/match'

interface ActionResult<T> {
  data: T | null
  error: unknown
}

interface UseUpdateMatchReturn {
  updateMatch: (id: MatchListItem['id'], input: UpdateMatchInput) => Promise<ActionResult<MatchListItem>>
  pending: Ref<boolean>
}

export function useUpdateMatch(): UseUpdateMatchReturn {
  const pending = ref(false)
  const client = useSupabaseClient<Database>()

  async function updateMatch(id: MatchListItem['id'], input: UpdateMatchInput): Promise<ActionResult<MatchListItem>> {
    pending.value = true
    try {
      // 【update 実行】: 全項目を eq('id', id) で対象行に限定。
      //   RLS matches_update = is_member_of(group_id) で自 Group のみ更新可。group_id は送らない
      const { data, error } = await client
        .from('matches')
        .update({
          name: input.name ?? null,
          match_date: input.matchDate,
          team_a_player1_id: input.teamAPlayer1Id,
          team_a_player2_id: input.teamAPlayer2Id,
          team_b_player1_id: input.teamBPlayer1Id,
          team_b_player2_id: input.teamBPlayer2Id,
          video_source_type: input.videoSourceType,
          video_source_url: input.videoSourceUrl
        })
        .eq('id', id)
        .select('id, name, match_date')
        .single()

      // 【エラー処理】: RLS 拒否 / 複合FK / distinct CHECK / 通信は ActionResult.error に詰める (EDGE-010)
      if (error) return { data: null, error }

      // 【成功戻り値】: 更新後行の最小射影。選手名解決は page 側 useMatches().refresh() に委ねる
      return {
        data: { id: data.id, name: data.name, matchDate: data.match_date } as unknown as MatchListItem,
        error: null
      }
    } finally {
      pending.value = false
    }
  }

  return { updateMatch, pending }
}
