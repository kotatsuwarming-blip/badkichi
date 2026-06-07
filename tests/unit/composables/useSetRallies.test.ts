/**
 * useSetRallies 単体テスト
 * mock 戦略: useMatches.test.ts 確立パターン。
 * クエリチェーン: from('rallies') → select(shots(count)) → eq(set_id) → is(deleted_at) → order(rally_number)
 * REQ-009 / EDGE-003
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fromMock, eqMock, isMock, orderMock, useAsyncDataMock } = vi.hoisted(() => {
  const orderMock = vi.fn()
  const isMock = vi.fn(() => ({ order: orderMock }))
  const eqMock = vi.fn(() => ({ is: isMock }))
  const selectMock = vi.fn(() => ({ eq: eqMock }))
  const fromMock = vi.fn(() => ({ select: selectMock }))

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

  return { fromMock, eqMock, isMock, orderMock, useAsyncDataMock }
})

vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return { ref: vue.ref, useSupabaseClient: () => ({ from: fromMock }), useAsyncData: useAsyncDataMock }
})
vi.mock('#supabase-client', () => ({ useSupabaseClient: () => ({ from: fromMock }) }))
vi.mock('#async-data', () => ({ useAsyncData: useAsyncDataMock }))

// eslint-disable-next-line import/first
import { useSetRallies } from '~/composables/useSetRallies'

describe('useSetRallies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    orderMock.mockResolvedValue({
      data: [
        { rally_number: 1, serving_team: 'A', server_player_id: 'p1', receiver_player_id: 'p3', point_winner: 'A', is_let: false, is_point_confirmed: true, video_start_timestamp_ms: 12345, shots: [{ count: 3 }] },
        { rally_number: 2, serving_team: 'A', server_player_id: 'p2', receiver_player_id: 'p4', point_winner: null, is_let: false, is_point_confirmed: false, video_start_timestamp_ms: null, shots: [] }
      ],
      error: null
    })
  })

  it('TC1: RallyHistoryItem へ射影し shotCount を埋め込み count から取る', async () => {
    const { data } = await useSetRallies('s1')
    expect(fromMock).toHaveBeenCalledWith('rallies')
    expect(eqMock).toHaveBeenCalledWith('set_id', 's1')
    expect(isMock).toHaveBeenCalledWith('deleted_at', null)
    expect(orderMock).toHaveBeenCalledWith('rally_number', { ascending: true })
    expect(data.value?.[0]).toEqual({
      rallyNumber: 1, servingTeam: 'A', serverPlayerId: 'p1', receiverPlayerId: 'p3', pointWinner: 'A',
      isLet: false, isPointConfirmed: true, shotCount: 3, videoStartTimestampMs: 12345
    })
  })

  it('TC2: 未確定ラリー (is_point_confirmed=false) と shots 空は shotCount 0', async () => {
    const { data } = await useSetRallies('s1')
    expect(data.value?.[1].isPointConfirmed).toBe(false)
    expect(data.value?.[1].shotCount).toBe(0)
  })
})
