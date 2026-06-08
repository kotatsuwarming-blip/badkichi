/**
 * useUpdateSet 単体テスト
 * mock: from('sets') → update → eq (resolves {error})
 * REQ-010
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
import { useUpdateSet } from '~/composables/useUpdateSet'

describe('useUpdateSet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eqMock.mockResolvedValue({ error: null })
  })

  it('TC1: winner を update し対象 set を eq で絞る', async () => {
    const { setWinner } = useUpdateSet()
    const r = await setWinner({ setId: 's1', winner: 'B' })
    expect(updateMock).toHaveBeenCalledWith({ winner: 'B' })
    expect(eqMock).toHaveBeenCalledWith('id', 's1')
    expect(r).toEqual({ data: true, error: null })
  })

  it('TC2: error は ActionResult.error に詰める', async () => {
    eqMock.mockResolvedValue({ error: new Error('rls') })
    const { setWinner } = useUpdateSet()
    const r = await setWinner({ setId: 's1', winner: 'A' })
    expect(r.data).toBeNull()
    expect(r.error).toBeInstanceOf(Error)
  })
})
