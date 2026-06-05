/**
 * useSets 単体テスト
 * mock 戦略: useMatches.test.ts 確立パターン。
 * クエリチェーン: from('sets') → select → eq(match_id) → is(deleted_at) → order(set_number)
 * REQ-002 / REQ-010
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
import { useSets } from '~/composables/useSets'

describe('useSets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    orderMock.mockResolvedValue({
      data: [
        { id: 's1', set_number: 1, target_points: 21, enable_deuce: true, deuce_point_cap: 30, first_serving_team: 'A', camera_near_team_at_start: 'A', winner: 'A' }
      ],
      error: null
    })
  })

  it('TC1: set_number 昇順で SetSummary へ射影する', async () => {
    const { data } = await useSets('m1')
    expect(fromMock).toHaveBeenCalledWith('sets')
    expect(eqMock).toHaveBeenCalledWith('match_id', 'm1')
    expect(isMock).toHaveBeenCalledWith('deleted_at', null)
    expect(orderMock).toHaveBeenCalledWith('set_number', { ascending: true })
    expect(data.value?.[0]).toEqual({
      id: 's1', setNumber: 1, targetPoints: 21, enableDeuce: true, deucePointCap: 30,
      firstServingTeam: 'A', cameraNearTeamAtStart: 'A', winner: 'A'
    })
  })

  it('TC2: 0 件は空配列', async () => {
    orderMock.mockResolvedValue({ data: [], error: null })
    const { data } = await useSets('m1')
    expect(data.value).toEqual([])
  })
})
