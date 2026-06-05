/**
 * useDeleteMatch 単体テスト (TC1〜TC2)
 *
 * クエリチェーン: from('matches') → update({deleted_at}) → eq('id', id)
 * 物理 delete は呼ばない (REQ-402)。
 * REQ-004 / REQ-402 / EDGE-010
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { updateMock, eqMock, deleteMock } = vi.hoisted(() => {
  const eqMock = vi.fn()
  const updateMock = vi.fn(() => ({ eq: eqMock }))
  const deleteMock = vi.fn()
  return { updateMock, eqMock, deleteMock }
})

vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return {
    ref: vue.ref,
    useSupabaseClient: () => ({ from: () => ({ update: updateMock, delete: deleteMock }) })
  }
})

vi.mock('#supabase-client', () => ({
  useSupabaseClient: () => ({ from: () => ({ update: updateMock, delete: deleteMock }) })
}))

// eslint-disable-next-line import/first
import { useDeleteMatch } from '~/composables/useDeleteMatch'

describe('useDeleteMatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eqMock.mockResolvedValue({ error: null })
  })

  it('TC1: 成功で deleted_at がセットされ eq(id) で限定 (物理 delete なし)', async () => {
    const { deleteMatch } = useDeleteMatch()
    const r = await deleteMatch('m1')
    const arg = updateMock.mock.calls[0]![0] as { deleted_at: string }
    expect(typeof arg.deleted_at).toBe('string')
    expect(arg.deleted_at).not.toBeNull()
    expect(eqMock).toHaveBeenCalledWith('id', 'm1')
    expect(deleteMock).not.toHaveBeenCalled()
    expect(r.error).toBeNull()
  })

  it('TC2: RLS/通信エラーは ActionResult.error で返す', async () => {
    const err = { message: 'rls_denied' }
    eqMock.mockResolvedValue({ error: err })
    const { deleteMatch, pending } = useDeleteMatch()
    const r = await deleteMatch('m1')
    expect(r.data).toBeNull()
    expect(r.error).toBe(err)
    expect(pending.value).toBe(false)
  })
})
