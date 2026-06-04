/**
 * useUpdatePlayer 単体テスト (TC-003-01 / TC-003-B01)
 *
 * mock 戦略 (useCreateGroup.test.ts 確立パターンを踏襲):
 *   - vi.hoisted() で updateMock / eqMock / singleMock を先に定義 (TDZ 回避)
 *   - vi.mock('#imports') で useSupabaseClient / ref を差し替え、ref は vue 実物
 *   - vi.mock('#supabase-client') で Nuxt Vite transform への保険
 *   - beforeEach で vi.clearAllMocks() + singleMock を初期化
 *
 * 🔵 TASK-0004.md テストケース / REQ-003 / REQ-101 / REQ-401
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// 【vi.hoisted】: vi.mock ファクトリより先に評価される mock 変数ブロック (TDZ 回避)
const { updateMock, eqMock, singleMock } = vi.hoisted(() => {
  const singleMock = vi.fn()
  const selectAfterEq = vi.fn(() => ({ single: singleMock }))
  const eqMock = vi.fn(() => ({ select: selectAfterEq }))
  const updateMock = vi.fn(() => ({ eq: eqMock }))

  return { updateMock, eqMock, singleMock }
})

// 【#imports mock】: Nuxt auto-import を差し替える
vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return {
    ref: vue.ref,
    useSupabaseClient: () => ({
      from: () => ({ update: updateMock })
    })
  }
})

// 【#supabase-client mock】: Nuxt Vite transform が直接パスに変換するケースへの保険
vi.mock(
  '#supabase-client',
  () => ({
    useSupabaseClient: () => ({
      from: () => ({ update: updateMock })
    })
  })
)

// eslint-disable-next-line import/first
import { useUpdatePlayer } from '~/composables/useUpdatePlayer'

describe('useUpdatePlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    singleMock.mockResolvedValue({ data: { id: 'p1', name: '佐藤', handedness: 'left' }, error: null })
  })

  // ===================================================================
  // TC-003-01: name/handedness 更新を eq(id) で反映する
  // ===================================================================
  it('TC-003-01: name/handedness 更新を eq(id) で反映する', async () => {
    const { updatePlayer } = useUpdatePlayer()
    const r = await updatePlayer('p1', { name: '佐藤', handedness: 'left' })
    expect(updateMock).toHaveBeenCalledWith({ name: '佐藤', handedness: 'left' })
    expect(eqMock).toHaveBeenCalledWith('id', 'p1')
    expect(r.data).toEqual({ id: 'p1', name: '佐藤', handedness: 'left' })
    expect(r.error).toBeNull()
  })

  // ===================================================================
  // TC-003-B01: エラーは ActionResult.error で返し pending を戻す
  // ===================================================================
  it('TC-003-B01: エラーは ActionResult.error で返し pending を戻す (検証はフォーム側責務)', async () => {
    const err = { message: 'players_name_length_check' }
    singleMock.mockResolvedValue({ data: null, error: err })
    const { updatePlayer, pending } = useUpdatePlayer()
    const r = await updatePlayer('p1', { name: '', handedness: 'unknown' })
    expect(r.data).toBeNull()
    expect(r.error).toBe(err)
    expect(pending.value).toBe(false)
  })
})
