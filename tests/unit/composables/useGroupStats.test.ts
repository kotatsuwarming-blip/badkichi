/**
 * useGroupStats / useGroupRallies 単体テスト
 *
 * useAsyncData mock は options.immediate を尊重し、immediate:false のときは handler を
 * 即時実行せず refresh で実行する（useGroupRallies の遅延取得検証のため）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpcMock, fromMock, useAsyncDataMock } = vi.hoisted(() => {
  const rpcMock = vi.fn((fn: string) => {
    const map: Record<string, unknown[]> = {
      stats_player_rates: [{ player_id: 'p1', serve_total: 2, serve_won: 1, receive_total: 0, receive_won: 0 }],
      stats_pair_rates: [],
      stats_rally_length: [{ shot_count: 4, rallies: 1, serve_won: 1 }],
      stats_rallies: [{ rally_id: 'r1', match_id: 'm1' }]
    }
    return Promise.resolve({ data: map[fn] ?? [], error: null })
  })
  const eqMock = vi.fn(() => Promise.resolve({ data: [{ id: 'p1', name: '田中' }], error: null }))
  const selectMock = vi.fn(() => ({ eq: eqMock }))
  const fromMock = vi.fn(() => ({ select: selectMock }))
  const useAsyncDataMock = vi.fn(async (_key: string, handler: () => Promise<unknown>, opts?: { immediate?: boolean }) => {
    const { ref } = await import('vue')
    const dataRef = ref<unknown>(null)
    const errorRef = ref<unknown>(null)
    const run = async () => {
      try {
        dataRef.value = await handler()
      } catch (e) {
        errorRef.value = e
      }
    }
    if (opts?.immediate !== false) await run()
    return { data: dataRef, pending: ref(false), error: errorRef, refresh: run }
  })
  return { rpcMock, fromMock, useAsyncDataMock }
})

const clientMock = { rpc: rpcMock, from: fromMock }

vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return { ref: vue.ref, useSupabaseClient: () => clientMock, useAsyncData: useAsyncDataMock }
})
vi.mock('#supabase-client', () => ({ useSupabaseClient: () => clientMock }))
vi.mock('#async-data', () => ({ useAsyncData: useAsyncDataMock }))

// eslint-disable-next-line import/first
import { useGroupStats } from '~/composables/useGroupStats'
// eslint-disable-next-line import/first
import { useGroupRallies } from '~/composables/useGroupRallies'

describe('useGroupStats', () => {
  beforeEach(() => vi.clearAllMocks())

  it('p_group_id で集計 RPC を呼ぶ', async () => {
    const { data } = await useGroupStats('g1')
    expect(rpcMock).toHaveBeenCalledWith('stats_player_rates', { p_group_id: 'g1' })
    expect(data.value!.playerRates[0].playerName).toBe('田中')
  })
})

describe('useGroupRallies', () => {
  beforeEach(() => vi.clearAllMocks())

  it('初期は取得せず（immediate:false）、refresh でフィルタ付き取得', async () => {
    const { data, refresh } = await useGroupRallies('g1', () => ({
      pairPlayer1Id: 'p0', pairPlayer2Id: 'p1', role: 'serve', limit: 200
    }))
    // 初期はフェッチしない
    expect(data.value).toBeNull()
    expect(rpcMock).not.toHaveBeenCalled()
    // 絞り込み確定後に取得
    await refresh()
    expect(rpcMock).toHaveBeenCalledWith('stats_rallies', expect.objectContaining({
      p_group_id: 'g1', p_pair_player1_id: 'p0', p_pair_player2_id: 'p1', p_role: 'serve', p_limit: 200
    }))
    expect(data.value).toHaveLength(1)
  })
})
