/**
 * useMatches 単体テスト (TC1〜TC4)
 *
 * mock 戦略 (usePlayers.test.ts 確立パターンを踏襲):
 *   - vi.hoisted() で from/select/eq/is/order1/order2/useAsyncDataMock/groupRef を定義
 *   - vi.mock('#imports' / '#supabase-client' / '#async-data') で auto-import を差し替え
 *   - vi.mock('~/composables/useCurrentGroup') で依存 composable を差し替え
 *   - useAsyncData mock は handler を即時実行し AsyncState 互換を返す
 *
 * クエリチェーン: from('matches') → select → eq → is → order(match_date) → order(created_at)
 * REQ-001 / REQ-201 / NFR-203 / EDGE-007
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  fromMock,
  eqMock,
  isMock,
  order1Mock,
  order2Mock,
  useAsyncDataMock,
  groupRef
} = vi.hoisted(() => {
  const order2Mock = vi.fn()
  const order1Mock = vi.fn(() => ({ order: order2Mock }))
  const isMock = vi.fn(() => ({ order: order1Mock }))
  const eqMock = vi.fn(() => ({ is: isMock }))
  const selectMock = vi.fn(() => ({ eq: eqMock }))
  const fromMock = vi.fn(() => ({ select: selectMock }))

  const groupRef = { value: { group_id: 'g1' } as { group_id: string } | null }

  const useAsyncDataMock = vi.fn(async (_key: string, handler: () => Promise<unknown>) => {
    const { ref } = await import('vue')
    const errorRef = ref<Error | null>(null)
    let data: unknown = null
    try {
      data = await handler()
    } catch (e) {
      errorRef.value = e as Error
    }
    return { data: ref(data), pending: ref(false), error: errorRef, refresh: vi.fn() }
  })

  return { fromMock, eqMock, isMock, order1Mock, order2Mock, useAsyncDataMock, groupRef }
})

vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return {
    ref: vue.ref,
    useSupabaseClient: () => ({ from: fromMock }),
    useAsyncData: useAsyncDataMock
  }
})

vi.mock('#supabase-client', () => ({
  useSupabaseClient: () => ({ from: fromMock })
}))

vi.mock('#async-data', () => ({
  useAsyncData: useAsyncDataMock
}))

vi.mock('~/composables/useCurrentGroup', () => ({
  useCurrentGroup: () => ({ data: groupRef })
}))

// eslint-disable-next-line import/first
import { useMatches } from '~/composables/useMatches'

const rowFixture = {
  id: 'm1',
  name: 'XX練習会',
  match_date: '2026-06-05',
  created_at: '2026-06-05T10:00:00Z',
  video_source_type: 'local',
  video_source_url: 'm1.mp4',
  ta1: { id: 'p1', name: '佐藤' },
  ta2: { id: 'p2', name: '鈴木(削除済)' },
  tb1: { id: 'p3', name: '高橋' },
  tb2: { id: 'p4', name: '田中' }
}

describe('useMatches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    groupRef.value = { group_id: 'g1' }
    order2Mock.mockResolvedValue({ data: [rowFixture], error: null })
  })

  it('TC1: 0 件は空配列', async () => {
    order2Mock.mockResolvedValue({ data: [], error: null })
    const { data } = await useMatches()
    expect(data.value).toEqual([])
  })

  it('TC2: group_id 未取得はクエリ未発行で空配列', async () => {
    groupRef.value = null
    const { data } = await useMatches()
    expect(data.value).toEqual([])
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('TC3: match_date 降順 → created_at 降順で並べる', async () => {
    await useMatches()
    expect(fromMock).toHaveBeenCalledWith('matches')
    expect(eqMock).toHaveBeenCalledWith('group_id', 'g1')
    expect(isMock).toHaveBeenCalledWith('deleted_at', null)
    expect(order1Mock).toHaveBeenCalledWith('match_date', { ascending: false })
    expect(order2Mock).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('TC4: 削除済 player も名前解決される (EDGE-007)', async () => {
    const { data } = await useMatches()
    expect(data.value?.[0]?.teamA[1].name).toBe('鈴木(削除済)')
  })
})
