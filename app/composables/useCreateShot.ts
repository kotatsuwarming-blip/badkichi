/**
 * 【機能概要】: shots へショットを insert する Write composable (楽観)。
 * 【実装方針】: 「打った」で session が getCurrentTimeMs を取り、rally_id 既知のまま楽観 insert。
 *             input_source は MVP 'manual' 固定 (将来 'ai' 拡張)。RLS (shots_insert FK 経由)。
 * interfaces.ts ShotDraft / REQ-005
 */
import type { Database } from '~/types/supabase'
import type { ActionResult } from '~/types/match-recording'

interface CreateShotInput {
  rallyId: string
  shotNumber: number
  videoTimestampMs: number
}

interface UseCreateShotReturn {
  createShot: (input: CreateShotInput) => Promise<ActionResult<string>>
}

export function useCreateShot(): UseCreateShotReturn {
  const client = useSupabaseClient<Database>()

  async function createShot(input: CreateShotInput): Promise<ActionResult<string>> {
    const { data, error } = await client
      .from('shots')
      .insert({
        rally_id: input.rallyId,
        shot_number: input.shotNumber,
        video_timestamp_ms: input.videoTimestampMs,
        input_source: 'manual'
      })
      .select('id')
      .single()

    if (error) return { data: null, error }
    return { data: data.id, error: null }
  }

  return { createShot }
}
