/**
 * useDeleteShot / useDeleteRally 単体テスト (物理削除)
 * mock: from(table) → delete → eq (resolves {error})
 * REQ-110a（hard delete: soft delete でないことを検証）
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fromMock, deleteMock, updateMock, eqMock } = vi.hoisted(() => {
  const eqMock = vi.fn()
  const deleteMock = vi.fn(() => ({ eq: eqMock }))
  const updateMock = vi.fn(() => ({ eq: eqMock }))
  const fromMock = vi.fn(() => ({ delete: deleteMock, update: updateMock }))
  return { fromMock, deleteMock, updateMock, eqMock }
})

vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return { ref: vue.ref, useSupabaseClient: () => ({ from: fromMock }) }
})
vi.mock('#supabase-client', () => ({ useSupabaseClient: () => ({ from: fromMock }) }))

// eslint-disable-next-line import/first
import { useDeleteShot } from '~/composables/useDeleteShot'
// eslint-disable-next-line import/first
import { useDeleteRally } from '~/composables/useDeleteRally'

describe('useDeleteShot (物理削除)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eqMock.mockResolvedValue({ error: null })
  })

  it('TC1: shots を物理削除 (delete を使い update でない)', async () => {
    const { deleteShot } = useDeleteShot()
    const r = await deleteShot({ shotId: 'sh1' })
    expect(fromMock).toHaveBeenCalledWith('shots')
    expect(deleteMock).toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled() // soft delete でない
    expect(eqMock).toHaveBeenCalledWith('id', 'sh1')
    expect(r).toEqual({ data: true, error: null })
  })

  it('TC2: error は ActionResult.error に詰める', async () => {
    eqMock.mockResolvedValue({ error: new Error('rls') })
    const { deleteShot } = useDeleteShot()
    const r = await deleteShot({ shotId: 'sh1' })
    expect(r.data).toBeNull()
    expect(r.error).toBeInstanceOf(Error)
  })
})

describe('useDeleteRally (物理削除)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eqMock.mockResolvedValue({ error: null })
  })

  it('TC1: 空 rally を物理削除', async () => {
    const { deleteRally } = useDeleteRally()
    const r = await deleteRally({ rallyId: 'r1' })
    expect(fromMock).toHaveBeenCalledWith('rallies')
    expect(deleteMock).toHaveBeenCalled()
    expect(eqMock).toHaveBeenCalledWith('id', 'r1')
    expect(r).toEqual({ data: true, error: null })
  })
})
