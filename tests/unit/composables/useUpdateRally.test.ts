/**
 * useUpdateRally 単体テスト
 * mock: from('rallies') → update → eq
 * REQ-006 / REQ-103 / REQ-110b
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { updateMock, eqMock } = vi.hoisted(() => {
  const eqMock = vi.fn()
  const updateMock = vi.fn(() => ({ eq: eqMock }))
  return { updateMock, eqMock }
})

vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return { ref: vue.ref, useSupabaseClient: () => ({ from: () => ({ update: updateMock }) }) }
})
vi.mock('#supabase-client', () => ({ useSupabaseClient: () => ({ from: () => ({ update: updateMock }) }) }))

// eslint-disable-next-line import/first
import { useUpdateRally } from '~/composables/useUpdateRally'

describe('useUpdateRally', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eqMock.mockResolvedValue({ error: null })
  })

  it('TC1: 得点確定 — point_winner/is_let/is_point_confirmed を update', async () => {
    const { updateRally } = useUpdateRally()
    const r = await updateRally({ rallyId: 'r1', pointWinner: 'A', isLet: false, isPointConfirmed: true })
    expect(updateMock).toHaveBeenCalledWith({ point_winner: 'A', is_let: false, is_point_confirmed: true })
    expect(eqMock).toHaveBeenCalledWith('id', 'r1')
    expect(r).toEqual({ data: true, error: null })
  })

  it('TC2: スキップ保留 — point_winner=null / is_point_confirmed=false', async () => {
    const { updateRally } = useUpdateRally()
    await updateRally({ rallyId: 'r1', pointWinner: null, isLet: false, isPointConfirmed: false })
    expect(updateMock).toHaveBeenCalledWith({ point_winner: null, is_let: false, is_point_confirmed: false })
  })

  it('TC3: error は ActionResult.error に詰める', async () => {
    eqMock.mockResolvedValue({ error: new Error('rls') })
    const { updateRally } = useUpdateRally()
    const r = await updateRally({ rallyId: 'r1', pointWinner: 'A', isLet: false, isPointConfirmed: true })
    expect(r.data).toBeNull()
    expect(r.error).toBeInstanceOf(Error)
  })
})
