/**
 * useStatsView 単体テスト
 * 方針: usePlayers/useMatches/#imports を mock。entity 別の RPC 呼び分け・期間解決・ドリルダウン導出を検証。
 * useAsyncData mock は handler を保持し refresh で再実行する。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

const { rpcMock, clientMock } = vi.hoisted(() => {
  const rpcMock = vi.fn((fn: string) => {
    const map: Record<string, unknown[]> = {
      stats_player_rates: [{ player_id: 'p0', serve_total: 2, serve_won: 1, receive_total: 0, receive_won: 0 }],
      stats_pair_rates: [],
      stats_rally_length: [],
      stats_rallies: [
        { rally_id: 'r1', match_id: 'm1', match_name: 'A', match_date: '2026-06-01', set_number: 1, rally_number: 1, serving_team: 'A', server_position: 'right', server_player_id: 'p0', receiver_player_id: 'x', point_winner: 'A', is_let: false, is_point_confirmed: true, shot_count: 3, video_start_timestamp_ms: 1000, video_source_type: 'youtube', video_source_url: 'u' },
        { rally_id: 'r2', match_id: 'm1', match_name: 'A', match_date: '2026-06-01', set_number: 1, rally_number: 2, serving_team: 'A', server_position: 'left', server_player_id: 'p0', receiver_player_id: 'x', point_winner: 'B', is_let: false, is_point_confirmed: true, shot_count: 5, video_start_timestamp_ms: 2000, video_source_type: 'youtube', video_source_url: 'u' }
      ]
    }
    return Promise.resolve({ data: map[fn] ?? [], error: null })
  })
  return { rpcMock, clientMock: { rpc: rpcMock, from: vi.fn() } }
})

// #imports / #async-data: ref を factory 内で取得し、同期的に AsyncData 互換を返す useAsyncData を提供
vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  const useAsyncData = (_k: string, handler: () => Promise<unknown>) => {
    const d = vue.ref<unknown>(null)
    const run = () => handler().then((x) => {
      d.value = x
    })
    run()
    return { data: d, pending: vue.ref(false), error: vue.ref(null), refresh: run }
  }
  return { ref: vue.ref, computed: vue.computed, useSupabaseClient: () => clientMock, useAsyncData }
})
vi.mock('#supabase-client', () => ({ useSupabaseClient: () => clientMock }))
vi.mock('#async-data', async () => {
  const vue = await import('vue')
  const useAsyncData = (_k: string, handler: () => Promise<unknown>) => {
    const d = vue.ref<unknown>(null)
    const run = () => handler().then((x) => {
      d.value = x
    })
    run()
    return { data: d, pending: vue.ref(false), error: vue.ref(null), refresh: run }
  }
  return { useAsyncData }
})
vi.mock('~/composables/usePlayers', async () => {
  const { ref } = await import('vue')
  return { usePlayers: () => ({ data: ref([{ id: 'p0', name: '田中' }]) }) }
})
vi.mock('~/composables/useMatches', async () => {
  const { ref } = await import('vue')
  return { useMatches: () => ({ data: ref([{ id: 'm1', name: 'A', matchDate: '2026-06-01' }, { id: 'm2', name: 'B', matchDate: '2026-06-10' }]) }) }
})

// eslint-disable-next-line import/first
import { useStatsView } from '~/composables/useStatsView'

describe('useStatsView (group)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('全体は集計 RPC を p_group_id + p_match_ids で呼ぶ', async () => {
    const v = useStatsView({ kind: 'group', groupId: 'g1' })
    await flushPromises()
    expect(rpcMock).toHaveBeenCalledWith('stats_player_rates', { p_group_id: 'g1', p_match_ids: ['m1', 'm2'] })
    expect(v.overview.value?.playerRates[0]?.playerName).toBe('田中')
  })

  it('全体でも stats_rallies を呼びテーブルに全ラリーを出す（U-05）', async () => {
    const v = useStatsView({ kind: 'group', groupId: 'g1' })
    await flushPromises()
    expect(rpcMock).toHaveBeenCalledWith('stats_rallies', { p_group_id: 'g1', p_match_ids: ['m1', 'm2'] })
    expect(v.tableRows.value).toHaveLength(2) // フィルタ無し（全体）でも候補が出る
  })

  it('期間フィルタで includedMatchIds を解決', () => {
    const v = useStatsView({ kind: 'group', groupId: 'g1' })
    v.setDateRange('2026-06-05', null)
    expect(v.includedMatchIds.value).toEqual(['m2'])
  })

  it('選手選択で stats_rallies を p_player_id で呼び、ブレイクダウン/テーブルを導出', async () => {
    const v = useStatsView({ kind: 'group', groupId: 'g1' })
    await flushPromises()
    v.setEntity({ kind: 'player', playerId: 'p0' })
    await v.refresh()
    expect(rpcMock).toHaveBeenCalledWith('stats_rallies', expect.objectContaining({ p_group_id: 'g1', p_player_id: 'p0' }))
    // entityRates: p0 の serve は r1(right,勝) + r2(left,負) → 母数 2
    expect(v.entityRates.value[0]?.serve.denominator).toBe(2)
    expect(v.tableRows.value).toHaveLength(2)
  })

  it('ドリルダウン position=right でテーブルが連動絞り込み', async () => {
    const v = useStatsView({ kind: 'group', groupId: 'g1' })
    await flushPromises()
    v.setEntity({ kind: 'player', playerId: 'p0' })
    await v.refresh()
    v.setDrillPosition('right')
    expect(v.tableRows.value).toHaveLength(1) // r1 のみ（right）
    expect(v.tableRows.value[0]?.rally_id).toBe('r1')
  })
})
