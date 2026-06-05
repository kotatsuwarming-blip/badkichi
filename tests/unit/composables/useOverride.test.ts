/**
 * useCreateOverride / useDeleteOverride 単体テスト
 * mock: from('position_overrides') → insert→select→single / delete→eq
 * REQ-105 / REQ-110c
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fromMock, insertMock, singleMock, deleteMock, eqMock } = vi.hoisted(() => {
  const singleMock = vi.fn()
  const selectAfterInsert = vi.fn(() => ({ single: singleMock }))
  const insertMock = vi.fn(() => ({ select: selectAfterInsert }))
  const eqMock = vi.fn()
  const deleteMock = vi.fn(() => ({ eq: eqMock }))
  const fromMock = vi.fn(() => ({ insert: insertMock, delete: deleteMock }))
  return { fromMock, insertMock, singleMock, deleteMock, eqMock }
})

vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return { ref: vue.ref, useSupabaseClient: () => ({ from: fromMock }) }
})
vi.mock('#supabase-client', () => ({ useSupabaseClient: () => ({ from: fromMock }) }))

// eslint-disable-next-line import/first
import { useCreateOverride } from '~/composables/useCreateOverride'
// eslint-disable-next-line import/first
import { useDeleteOverride } from '~/composables/useDeleteOverride'

describe('useCreateOverride', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    singleMock.mockResolvedValue({ data: { id: 'ov1' }, error: null })
  })

  it('TC1: rally_id/team/override_type を insert し id を返す', async () => {
    const { createOverride } = useCreateOverride()
    const r = await createOverride({ rallyId: 'r1', team: 'A', overrideType: 'swapped' })
    expect(fromMock).toHaveBeenCalledWith('position_overrides')
    expect(insertMock).toHaveBeenCalledWith({ rally_id: 'r1', team: 'A', override_type: 'swapped' })
    expect(r).toEqual({ data: 'ov1', error: null })
  })
})

describe('useDeleteOverride (物理削除)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eqMock.mockResolvedValue({ error: null })
  })

  it('TC1: override を物理削除', async () => {
    const { deleteOverride } = useDeleteOverride()
    const r = await deleteOverride({ overrideId: 'ov1' })
    expect(deleteMock).toHaveBeenCalled()
    expect(eqMock).toHaveBeenCalledWith('id', 'ov1')
    expect(r).toEqual({ data: true, error: null })
  })

  it('TC2: error は ActionResult.error に詰める', async () => {
    eqMock.mockResolvedValue({ error: new Error('rls') })
    const { deleteOverride } = useDeleteOverride()
    const r = await deleteOverride({ overrideId: 'ov1' })
    expect(r.error).toBeInstanceOf(Error)
  })
})
