/**
 * useUpdateMatch 単体テスト (TC1〜TC2)
 *
 * クエリチェーン: from('matches') → update → eq('id', id) → select → single
 * REQ-003 / EDGE-010
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { updateMock, eqMock, singleMock } = vi.hoisted(() => {
  const singleMock = vi.fn()
  const selectAfterUpdate = vi.fn(() => ({ single: singleMock }))
  const eqMock = vi.fn(() => ({ select: selectAfterUpdate }))
  const updateMock = vi.fn(() => ({ eq: eqMock }))
  return { updateMock, eqMock, singleMock }
})

vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return {
    ref: vue.ref,
    useSupabaseClient: () => ({ from: () => ({ update: updateMock }) })
  }
})

vi.mock('#supabase-client', () => ({
  useSupabaseClient: () => ({ from: () => ({ update: updateMock }) })
}))

// eslint-disable-next-line import/first
import { useUpdateMatch } from '~/composables/useUpdateMatch'

const input = {
  name: '更新後',
  matchDate: '2026-06-06',
  teamAPlayer1Id: 'p1',
  teamAPlayer2Id: 'p2',
  teamBPlayer1Id: 'p3',
  teamBPlayer2Id: 'p4',
  videoSourceType: 'youtube' as const,
  videoSourceUrl: 'abcdefghijk'
}

describe('useUpdateMatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    singleMock.mockResolvedValue({ data: { id: 'm1', name: '更新後', match_date: '2026-06-06' }, error: null })
  })

  it('TC1: 全項目更新 — snake_case + group_id 非送信 + eq(id)', async () => {
    const { updateMatch } = useUpdateMatch()
    const r = await updateMatch('m1', input)
    const arg = updateMock.mock.calls[0]![0] as Record<string, unknown>
    expect(arg).toMatchObject({
      name: '更新後',
      match_date: '2026-06-06',
      team_a_player1_id: 'p1',
      video_source_type: 'youtube'
    })
    expect(arg).not.toHaveProperty('group_id')
    expect(eqMock).toHaveBeenCalledWith('id', 'm1')
    expect(r.error).toBeNull()
  })

  it('TC2: RLS/通信エラーは ActionResult.error で返す', async () => {
    const err = { message: 'rls_denied' }
    singleMock.mockResolvedValue({ data: null, error: err })
    const { updateMatch, pending } = useUpdateMatch()
    const r = await updateMatch('m1', input)
    expect(r.data).toBeNull()
    expect(r.error).toBe(err)
    expect(pending.value).toBe(false)
  })
})
