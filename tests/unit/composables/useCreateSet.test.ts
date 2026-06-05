/**
 * useCreateSet 単体テスト
 * mock: from('sets') → insert → select → single (useCreateMatch.test.ts パターン)
 * REQ-002
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { insertMock, singleMock } = vi.hoisted(() => {
  const singleMock = vi.fn()
  const selectAfterInsert = vi.fn(() => ({ single: singleMock }))
  const insertMock = vi.fn(() => ({ select: selectAfterInsert }))
  return { insertMock, singleMock }
})

vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return { ref: vue.ref, useSupabaseClient: () => ({ from: () => ({ insert: insertMock }) }) }
})
vi.mock('#supabase-client', () => ({ useSupabaseClient: () => ({ from: () => ({ insert: insertMock }) }) }))

// eslint-disable-next-line import/first
import { useCreateSet } from '~/composables/useCreateSet'

const input = {
  matchId: 'm1', setNumber: 1, targetPoints: 21, enableDeuce: true,
  deucePointCap: 30, firstServingTeam: 'A' as const, cameraNearTeamAtStart: 'A' as const
}

describe('useCreateSet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    singleMock.mockResolvedValue({ data: { id: 's1' }, error: null })
  })

  it('TC1: 成功 — snake_case マッピングで insert し set id を返す', async () => {
    const { createSet } = useCreateSet()
    const r = await createSet(input)
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      match_id: 'm1', set_number: 1, target_points: 21, enable_deuce: true,
      deuce_point_cap: 30, first_serving_team: 'A', camera_near_team_at_start: 'A'
    }))
    expect(r).toEqual({ data: 's1', error: null })
  })

  it('TC2: error は ActionResult.error に詰める', async () => {
    singleMock.mockResolvedValue({ data: null, error: new Error('rls') })
    const { createSet } = useCreateSet()
    const r = await createSet(input)
    expect(r.data).toBeNull()
    expect(r.error).toBeInstanceOf(Error)
  })
})
