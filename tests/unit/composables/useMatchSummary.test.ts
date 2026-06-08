/**
 * useMatchSummary 単体テスト
 * mock: from('sets') → select → eq → is → order。point_winner の COUNT でスコア導出。
 * REQ-011 / ② B-7
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fromMock, orderMock, useAsyncDataMock } = vi.hoisted(() => {
  const orderMock = vi.fn()
  const isMock = vi.fn(() => ({ order: orderMock }))
  const eqMock = vi.fn(() => ({ is: isMock }))
  const selectMock = vi.fn(() => ({ eq: eqMock }))
  const fromMock = vi.fn(() => ({ select: selectMock }))
  const useAsyncDataMock = vi.fn(async (_key: string, handler: () => Promise<unknown>) => {
    const { ref } = await import('vue')
    let data: unknown = null
    try {
      data = await handler()
    } catch {
      // noop
    }
    return { data: ref(data), pending: ref(false), error: ref(null), refresh: vi.fn() }
  })
  return { fromMock, orderMock, useAsyncDataMock }
})

vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return { ref: vue.ref, useSupabaseClient: () => ({ from: fromMock }), useAsyncData: useAsyncDataMock }
})
vi.mock('#supabase-client', () => ({ useSupabaseClient: () => ({ from: fromMock }) }))
vi.mock('#async-data', () => ({ useAsyncData: useAsyncDataMock }))

// eslint-disable-next-line import/first
import { useMatchSummary } from '~/composables/useMatchSummary'

describe('useMatchSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    orderMock.mockResolvedValue({
      data: [
        { set_number: 1, winner: 'A', deleted_at: null, rallies: [{ point_winner: 'A', deleted_at: null }, { point_winner: 'A', deleted_at: null }, { point_winner: 'B', deleted_at: null }, { point_winner: null, deleted_at: null }] },
        { set_number: 2, winner: 'A', deleted_at: null, rallies: [{ point_winner: 'A', deleted_at: null }, { point_winner: 'B', deleted_at: null }] }
      ],
      error: null
    })
  })

  it('point_winner の COUNT でセットスコアを集計し、best-of-3 で試合勝者を判定する', async () => {
    const { data } = await useMatchSummary('m1')
    expect(fromMock).toHaveBeenCalledWith('sets')
    expect(data.value?.sets[0]).toEqual({ setNumber: 1, scoreA: 2, scoreB: 1, winner: 'A' }) // let/未確定(null)は除外
    expect(data.value?.setsWonA).toBe(2)
    expect(data.value?.setsWonB).toBe(0)
    expect(data.value?.matchWinner).toBe('A') // 2セット先取
  })

  it('2セット未到達なら matchWinner は null (記録中)', async () => {
    orderMock.mockResolvedValue({
      data: [{ set_number: 1, winner: 'A', deleted_at: null, rallies: [{ point_winner: 'A', deleted_at: null }] }],
      error: null
    })
    const { data } = await useMatchSummary('m1')
    expect(data.value?.matchWinner).toBeNull()
    expect(data.value?.setsWonA).toBe(1)
  })
})
