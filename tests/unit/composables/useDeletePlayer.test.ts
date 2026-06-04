/**
 * useDeletePlayer 単体テスト (TC-004-01 / TC-004-02)
 *
 * mock 戦略 (useCreateGroup.test.ts 確立パターンを踏襲):
 *   - vi.hoisted() で updateMock / eqMock / delMock を先に定義 (TDZ 回避)
 *   - vi.mock('#imports') で useSupabaseClient / ref を差し替え、ref は vue 実物
 *   - vi.mock('#supabase-client') で Nuxt Vite transform への保険
 *   - beforeEach で vi.clearAllMocks() + eqMock を初期化
 *
 * 🔵 TASK-0005.md テストケース / REQ-004 / REQ-103 / REQ-104 / REQ-402 / EDGE-006
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// 【vi.hoisted】: vi.mock ファクトリより先に評価される mock 変数ブロック (TDZ 回避)
const { updateMock, eqMock, delMock } = vi.hoisted(() => {
  const eqMock = vi.fn()
  const updateMock = vi.fn(() => ({ eq: eqMock }))
  const delMock = vi.fn()

  return { updateMock, eqMock, delMock }
})

// 【#imports mock】: Nuxt auto-import を差し替える
vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return {
    ref: vue.ref,
    useSupabaseClient: () => ({
      from: () => ({ update: updateMock, delete: delMock })
    })
  }
})

// 【#supabase-client mock】: Nuxt Vite transform が直接パスに変換するケースへの保険
vi.mock(
  '#supabase-client',
  () => ({
    useSupabaseClient: () => ({
      from: () => ({ update: updateMock, delete: delMock })
    })
  })
)

// eslint-disable-next-line import/first
import { useDeletePlayer } from '~/composables/useDeletePlayer'

describe('useDeletePlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eqMock.mockResolvedValue({ error: null })
  })

  // ===================================================================
  // TC-004-01: deleted_at 設定の update を実行し物理削除しない (REQ-402)
  // ===================================================================
  it('TC-004-01: deleted_at 設定の update を実行し物理削除しない (REQ-402)', async () => {
    const { deletePlayer } = useDeletePlayer()
    const r = await deletePlayer('p1')
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ deleted_at: expect.any(String) }))
    expect(eqMock).toHaveBeenCalledWith('id', 'p1')
    expect(delMock).not.toHaveBeenCalled()
    expect(r).toEqual({ data: null, error: null })
  })

  // ===================================================================
  // TC-004-02: 試合参照中でもソフト削除に成功する (EDGE-006)
  // ===================================================================
  it('TC-004-02: 試合参照中でもソフト削除に成功する (EDGE-006)', async () => {
    eqMock.mockResolvedValue({ error: null })
    const { deletePlayer, pending } = useDeletePlayer()
    const r = await deletePlayer('p2')
    expect(r.error).toBeNull()
    expect(pending.value).toBe(false)
  })
})
