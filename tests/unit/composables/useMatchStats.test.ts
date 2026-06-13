/**
 * useMatchStats / useMatchRallies 単体テスト
 *
 * mock 戦略（useMatches.test.ts 踏襲）:
 *   - vi.hoisted で rpcMock / fromMock / useAsyncDataMock を定義
 *   - #imports / #supabase-client / #async-data の auto-import を差し替え
 *   - useAsyncData mock は handler を即時実行
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpcMock, fromMock, useAsyncDataMock, state } = vi.hoisted(() => {
  const state = {
    player: [{ player_id: 'p1', serve_total: 3, serve_won: 2, receive_total: 0, receive_won: 0 }] as unknown[],
    pair: [] as unknown[],
    length: [{ shot_count: 3, rallies: 2, serve_won: 1 }] as unknown[],
    rallies: [{ rally_id: 'r1', match_id: 'm1', shot_count: 3 }] as unknown[]
  }
  const rpcMock = vi.fn((fn: string) => {
    const map: Record<string, unknown[]> = {
      stats_player_rates: state.player,
      stats_pair_rates: state.pair,
      stats_rally_length: state.length,
      stats_rallies: state.rallies
    }
    return Promise.resolve({ data: map[fn] ?? [], error: null })
  })
  const selectMock = vi.fn(() => Promise.resolve({ data: [{ id: 'p1', name: '田中' }], error: null }))
  const fromMock = vi.fn(() => ({ select: selectMock }))
  const useAsyncDataMock = vi.fn(async (_key: string, handler: () => Promise<unknown>) => {
    const { ref } = await import('vue')
    const errorRef = ref<unknown>(null)
    let data: unknown = null
    try {
      data = await handler()
    } catch (e) {
      errorRef.value = e
    }
    return { data: ref(data), pending: ref(false), error: errorRef, refresh: vi.fn() }
  })
  return { rpcMock, fromMock, useAsyncDataMock, state }
})

const clientMock = { rpc: rpcMock, from: fromMock }

vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return { ref: vue.ref, useSupabaseClient: () => clientMock, useAsyncData: useAsyncDataMock }
})
vi.mock('#supabase-client', () => ({ useSupabaseClient: () => clientMock }))
vi.mock('#async-data', () => ({ useAsyncData: useAsyncDataMock }))

// eslint-disable-next-line import/first
import { useMatchStats } from '~/composables/useMatchStats'
// eslint-disable-next-line import/first
import { useMatchRallies } from '~/composables/useMatchRallies'

describe('useMatchStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.player = [{ player_id: 'p1', serve_total: 3, serve_won: 2, receive_total: 0, receive_won: 0 }]
    state.length = [{ shot_count: 3, rallies: 2, serve_won: 1 }]
  })

  it('RPC を p_match_id で呼び、選手名解決つき集計を返す', async () => {
    const { data } = await useMatchStats('m1')
    expect(rpcMock).toHaveBeenCalledWith('stats_player_rates', { p_match_id: 'm1' })
    const agg = data.value!
    expect(agg.playerRates[0].playerName).toBe('田中')
    expect(agg.playerRates[0].serve.rate).toBeCloseTo(2 / 3)
    expect(agg.isEmpty).toBe(false)
  })

  it('確定ラリー 0 件（player/length 空）は isEmpty=true', async () => {
    state.player = []
    state.length = []
    const { data } = await useMatchStats('m1')
    expect(data.value!.isEmpty).toBe(true)
  })
})

describe('useMatchRallies', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stats_rallies を p_match_id で呼びラリー行を返す', async () => {
    const { data } = await useMatchRallies('m1')
    expect(rpcMock).toHaveBeenCalledWith('stats_rallies', { p_match_id: 'm1' })
    expect(data.value).toHaveLength(1)
  })
})
