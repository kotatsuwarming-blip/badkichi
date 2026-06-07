/**
 * useCompleteMatch 単体テスト
 * mock: from('matches') → update → eq
 * 完了フラグ (completed_at) の設定/解除
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
import { useCompleteMatch } from '~/composables/useCompleteMatch'

describe('useCompleteMatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eqMock.mockResolvedValue({ error: null })
  })

  it('completed=true で completed_at にタイムスタンプを設定する', async () => {
    const { setCompleted } = useCompleteMatch()
    const r = await setCompleted({ matchId: 'm1', completed: true, at: '2026-06-08T00:00:00Z' })
    expect(updateMock).toHaveBeenCalledWith({ completed_at: '2026-06-08T00:00:00Z' })
    expect(eqMock).toHaveBeenCalledWith('id', 'm1')
    expect(r).toEqual({ data: true, error: null })
  })

  it('completed=false で completed_at を null にする (取り消し)', async () => {
    const { setCompleted } = useCompleteMatch()
    await setCompleted({ matchId: 'm1', completed: false })
    expect(updateMock).toHaveBeenCalledWith({ completed_at: null })
  })

  it('error は ActionResult.error に詰める', async () => {
    eqMock.mockResolvedValue({ error: new Error('rls') })
    const { setCompleted } = useCompleteMatch()
    const r = await setCompleted({ matchId: 'm1', completed: true, at: 'x' })
    expect(r.data).toBeNull()
    expect(r.error).toBeInstanceOf(Error)
  })
})
