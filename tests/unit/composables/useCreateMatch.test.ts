/**
 * useCreateMatch 単体テスト (TC1〜TC5)
 *
 * mock 戦略 (useCreatePlayer.test.ts 確立パターンを踏襲):
 *   - vi.hoisted() で insert/single/groupRef を定義
 *   - vi.mock('#imports' / '#supabase-client') で auto-import を差し替え
 *   - vi.mock('~/composables/useCurrentGroup') で依存 composable を差し替え
 *
 * クエリチェーン: from('matches') → insert → select → single
 * REQ-002 / REQ-104 / EDGE-010
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { insertMock, singleMock, groupRef } = vi.hoisted(() => {
  const singleMock = vi.fn()
  const selectAfterInsert = vi.fn(() => ({ single: singleMock }))
  const insertMock = vi.fn(() => ({ select: selectAfterInsert }))
  const groupRef = { value: { group_id: 'g1' } as { group_id: string } | null }
  return { insertMock, singleMock, groupRef }
})

vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return {
    ref: vue.ref,
    useSupabaseClient: () => ({ from: () => ({ insert: insertMock }) }),
    useCurrentGroup: () => ({ data: groupRef })
  }
})

vi.mock('#supabase-client', () => ({
  useSupabaseClient: () => ({ from: () => ({ insert: insertMock }) })
}))

vi.mock('~/composables/useCurrentGroup', () => ({
  useCurrentGroup: () => ({ data: groupRef })
}))

// eslint-disable-next-line import/first
import { useCreateMatch } from '~/composables/useCreateMatch'

const input = {
  name: 'XX練習会',
  matchDate: '2026-06-05',
  teamAPlayer1Id: 'p1',
  teamAPlayer2Id: 'p2',
  teamBPlayer1Id: 'p3',
  teamBPlayer2Id: 'p4',
  videoSourceType: 'local' as const,
  videoSourceUrl: 'm1.mp4'
}

describe('useCreateMatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    groupRef.value = { group_id: 'g1' }
    singleMock.mockResolvedValue({ data: { id: 'm1', name: 'XX練習会', match_date: '2026-06-05' }, error: null })
  })

  it('TC1: local 成功 — group_id 付与 + snake_case マッピング', async () => {
    const { createMatch } = useCreateMatch()
    const r = await createMatch(input)
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      group_id: 'g1',
      team_a_player1_id: 'p1',
      team_b_player2_id: 'p4',
      video_source_type: 'local',
      match_date: '2026-06-05'
    }))
    expect(r.error).toBeNull()
  })

  it('TC2: youtube — video_source_type 分岐', async () => {
    const { createMatch } = useCreateMatch()
    await createMatch({ ...input, videoSourceType: 'youtube', videoSourceUrl: 'abcdefghijk' })
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      video_source_type: 'youtube',
      video_source_url: 'abcdefghijk'
    }))
  })

  it('TC3: group_id 未取得は error でガード', async () => {
    groupRef.value = null
    const { createMatch, pending } = useCreateMatch()
    const r = await createMatch(input)
    expect(r.error).toBeInstanceOf(Error)
    expect(insertMock).not.toHaveBeenCalled()
    expect(pending.value).toBe(false)
  })

  it('TC4: 同カードでも成功 (REQ-104/EDGE-005)', async () => {
    const { createMatch } = useCreateMatch()
    const r = await createMatch(input)
    expect(r.error).toBeNull()
  })

  it('TC5: RLS/通信エラーは ActionResult.error で返す', async () => {
    const err = { message: 'rls_denied' }
    singleMock.mockResolvedValue({ data: null, error: err })
    const { createMatch, pending } = useCreateMatch()
    const r = await createMatch(input)
    expect(r.data).toBeNull()
    expect(r.error).toBe(err)
    expect(pending.value).toBe(false)
  })
})
