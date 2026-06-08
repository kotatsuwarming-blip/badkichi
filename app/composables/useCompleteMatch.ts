/**
 * 【機能概要】: 試合の完了フラグ (matches.completed_at) を設定/解除する Write composable。
 * 【実装方針】: useUpdateMatch.ts 準拠。RLS (matches_update = is_member_of)。
 *             completed=true で now()、false で null。2セット先取に依らずユーザーが明示的に完了にできる。
 * 手動検証フィードバック (1セットでも完了にしたい)
 */
import type { Database } from '~/types/supabase'
import type { ActionResult } from '~/types/match-recording'

interface UseCompleteMatchReturn {
  setCompleted: (input: { matchId: string, completed: boolean, at?: string }) => Promise<ActionResult<true>>
  pending: Ref<boolean>
}

export function useCompleteMatch(): UseCompleteMatchReturn {
  const pending = ref(false)
  const client = useSupabaseClient<Database>()

  async function setCompleted(input: { matchId: string, completed: boolean, at?: string }): Promise<ActionResult<true>> {
    pending.value = true
    try {
      // at は呼び出し側がタイムスタンプを渡す (テスト容易性 / new Date() 直書き回避)
      const completedAt = input.completed ? (input.at ?? new Date().toISOString()) : null
      const { error } = await client
        .from('matches')
        .update({ completed_at: completedAt })
        .eq('id', input.matchId)
      if (error) return { data: null, error }
      return { data: true, error: null }
    } finally {
      pending.value = false
    }
  }

  return { setCompleted, pending }
}
