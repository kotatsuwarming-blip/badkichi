/**
 * 【機能概要】: matches へ試合を insert する Write composable
 * 【実装方針】: useCreatePlayer.ts の pending/try-finally を踏襲。group_id は useCurrentGroup から付与。
 *             検証は行わない (フォーム側 + matchFormSchema の責務)。同カードでも成功 (REQ-104)。
 * interfaces.ts UseCreateMatchReturn / REQ-002 / REQ-104 / matches_insert RLS
 */
import type { Database } from '~/types/supabase'
import type { CreateMatchInput, MatchListItem } from '~/types/match'
import { useCurrentGroup } from '~/composables/useCurrentGroup'

interface ActionResult<T> {
  data: T | null
  error: unknown
}

interface UseCreateMatchReturn {
  createMatch: (input: CreateMatchInput) => Promise<ActionResult<MatchListItem>>
  pending: Ref<boolean>
}

export function useCreateMatch(): UseCreateMatchReturn {
  const pending = ref(false)
  const client = useSupabaseClient<Database>()
  const currentGroup = useCurrentGroup()

  async function createMatch(input: CreateMatchInput): Promise<ActionResult<MatchListItem>> {
    pending.value = true
    try {
      // 【group_id 取得】: 未取得時は insert 不可。error を返し page 側 toast (EDGE-010)
      const gid = currentGroup.data.value?.group_id
      if (!gid) return { data: null, error: new Error('no_current_group') }

      // 【insert 実行】: camelCase → snake_case マッピング。同カードでも成功 (REQ-104/EDGE-005)
      const { data, error } = await client
        .from('matches')
        .insert({
          group_id: gid,
          name: input.name ?? null,
          match_date: input.matchDate,
          team_a_player1_id: input.teamAPlayer1Id,
          team_a_player2_id: input.teamAPlayer2Id,
          team_b_player1_id: input.teamBPlayer1Id,
          team_b_player2_id: input.teamBPlayer2Id,
          video_source_type: input.videoSourceType,
          video_source_url: input.videoSourceUrl
        })
        .select('id, name, match_date')
        .single()

      // 【エラー処理】: RLS 拒否 / 複合FK / distinct CHECK / 通信は ActionResult.error に詰める (EDGE-010)
      if (error) return { data: null, error }

      // 【成功戻り値】: 挿入行の最小射影。選手名解決は page 側 useMatches().refresh() に委ねる
      return {
        data: { id: data.id, name: data.name, matchDate: data.match_date } as unknown as MatchListItem,
        error: null
      }
    } finally {
      pending.value = false
    }
  }

  return { createMatch, pending }
}
