/**
 * useCreatePlayer 単体テスト (TC-002-01 / TC-002-02 / エラー時返却)
 *
 * mock 戦略 (useCreateGroup.test.ts 確立パターンを踏襲):
 *   - vi.hoisted() で insertMock / singleMock / groupRef を先に定義 (TDZ 回避)
 *   - vi.mock('#imports') で useSupabaseClient / ref を差し替え、ref は vue 実物
 *   - vi.mock('#supabase-client') で Nuxt Vite transform への保険
 *   - vi.mock('~/composables/useCurrentGroup') で useCurrentGroup を差し替え
 *   - beforeEach で vi.clearAllMocks() + singleMock / groupRef を初期化
 *
 * 🔵 TASK-0003.md テストケース / REQ-002 / REQ-102 / EDGE-003 / EDGE-004
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// 【vi.hoisted】: vi.mock ファクトリより先に評価される mock 変数ブロック (TDZ 回避)
const { insertMock, singleMock, groupRef } = vi.hoisted(() => {
  const singleMock = vi.fn()
  const selectAfterInsert = vi.fn(() => ({ single: singleMock }))
  const insertMock = vi.fn(() => ({ select: selectAfterInsert }))

  // 【groupRef】: useCurrentGroup().data を差し替えるスタブ
  const groupRef = { value: { group_id: 'g1' } as { group_id: string } | null }

  return { insertMock, singleMock, groupRef }
})

// 【#imports mock】: Nuxt auto-import を差し替える
vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return {
    ref: vue.ref,
    useSupabaseClient: () => ({
      from: () => ({ insert: insertMock })
    }),
    useCurrentGroup: () => ({ data: groupRef })
  }
})

// 【#supabase-client mock】: Nuxt Vite transform が直接パスに変換するケースへの保険
vi.mock(
  '#supabase-client',
  () => ({
    useSupabaseClient: () => ({
      from: () => ({ insert: insertMock })
    })
  })
)

// 【useCurrentGroup 直接 mock】: composable ファイルを直接 mock
vi.mock('~/composables/useCurrentGroup', () => ({
  useCurrentGroup: () => ({ data: groupRef })
}))

// eslint-disable-next-line import/first
import { useCreatePlayer } from '~/composables/useCreatePlayer'

describe('useCreatePlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    groupRef.value = { group_id: 'g1' }
    singleMock.mockResolvedValue({ data: { id: 'p1', name: '田中', handedness: 'unknown' }, error: null })
  })

  // ===================================================================
  // TC-002-01: name のみ → handedness=unknown で insert する (EDGE-003)
  // ===================================================================
  it('TC-002-01: name のみ → handedness=unknown で insert する (EDGE-003)', async () => {
    const { createPlayer } = useCreatePlayer()
    const r = await createPlayer({ name: '田中' })
    expect(insertMock).toHaveBeenCalledWith({ group_id: 'g1', name: '田中', handedness: 'unknown' })
    expect(r.data).toEqual({ id: 'p1', name: '田中', handedness: 'unknown' })
    expect(r.error).toBeNull()
  })

  // ===================================================================
  // TC-002-02: 同名でも成功する (REQ-102/EDGE-004)
  // ===================================================================
  it('TC-002-02: 同名でも成功する (REQ-102/EDGE-004)', async () => {
    singleMock.mockResolvedValue({ data: { id: 'p2', name: '田中', handedness: 'left' }, error: null })
    const { createPlayer } = useCreatePlayer()
    const r = await createPlayer({ name: '田中', handedness: 'left' })
    expect(insertMock).toHaveBeenCalledWith({ group_id: 'g1', name: '田中', handedness: 'left' })
    expect(r.error).toBeNull()
    expect(r.data).toMatchObject({ name: '田中', handedness: 'left' })
  })

  // ===================================================================
  // エラー時は ActionResult.error を返し pending を false に戻す
  // ===================================================================
  it('エラー時は ActionResult.error を返し pending を false に戻す', async () => {
    const err = { message: 'rls denied' }
    singleMock.mockResolvedValue({ data: null, error: err })
    const { createPlayer, pending } = useCreatePlayer()
    const r = await createPlayer({ name: '田中' })
    expect(r.data).toBeNull()
    expect(r.error).toBe(err)
    expect(pending.value).toBe(false)
  })
})
