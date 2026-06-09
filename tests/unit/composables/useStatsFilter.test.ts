import { describe, expect, it } from 'vitest'
import { useStatsFilter } from '~/composables/useStatsFilter'
import type { MatchRoster } from '~/utils/stats-dashboard/filter-rallies'
import type { RallyRow, Team } from '~/types/stats-dashboard'

const roster: MatchRoster = { pairA: ['p0', 'p1'], pairB: ['p2', 'p3'] }

function row(n: number, servingTeam: Team, server: string, receiver: string, shots: number): RallyRow {
  return {
    rally_id: `r${n}`, match_id: 'm', match_name: 'M', set_number: 1, rally_number: n,
    serving_team: servingTeam, server_player_id: server, receiver_player_id: receiver,
    point_winner: 'A', is_let: false, is_point_confirmed: true,
    shot_count: shots, video_start_timestamp_ms: n * 1000,
    video_source_type: 'youtube', video_source_url: 'u'
  }
}

describe('useStatsFilter — setFilter / toggle', () => {
  it('選手+役割を設定、同一再選択でトグル解除', () => {
    const { filter, setFilter } = useStatsFilter()
    setFilter({ playerId: 'p0', role: 'serve' })
    expect(filter.value.playerId).toBe('p0')
    expect(filter.value.role).toBe('serve')
    // 同一再クリック → 解除
    setFilter({ playerId: 'p0', role: 'serve' })
    expect(filter.value.playerId).toBeNull()
    expect(filter.value.role).toBeNull()
  })

  it('別の役割は解除ではなく置換', () => {
    const { filter, setFilter } = useStatsFilter()
    setFilter({ playerId: 'p0', role: 'serve' })
    setFilter({ playerId: 'p0', role: 'receive' })
    expect(filter.value.role).toBe('receive')
  })

  it('shotBinKeys は複数選択をそのまま置換', () => {
    const { filter, setFilter } = useStatsFilter()
    setFilter({ shotBinKeys: ['1-3', '4-7'] })
    expect(filter.value.shotBinKeys).toEqual(['1-3', '4-7'])
  })

  it('clear で全解除', () => {
    const { filter, setFilter, clear } = useStatsFilter()
    setFilter({ playerId: 'p0', role: 'serve', shotBinKeys: ['1-3'] })
    clear()
    expect(filter.value).toEqual({ playerId: null, pair: null, role: null, shotBinKeys: [] })
  })
})

describe('useStatsFilter — apply（roster 利用）', () => {
  it('ペア serve はペアが serving 側に絞る', () => {
    const { setFilter, apply } = useStatsFilter({ roster: () => roster })
    setFilter({ pair: { player1Id: 'p0', player2Id: 'p1' }, role: 'serve' })
    const rows = [row(1, 'A', 'p0', 'p2', 2), row(2, 'B', 'p2', 'p0', 5)]
    expect(apply(rows).map(r => r.rally_id)).toEqual(['r1'])
  })
})

describe('useStatsFilter — toQueryArgs', () => {
  it('ペア+role+ビン → RPC 引数へ変換', () => {
    const { setFilter, toQueryArgs } = useStatsFilter()
    setFilter({ pair: { player1Id: 'p0', player2Id: 'p1' }, role: 'serve' })
    setFilter({ shotBinKeys: ['1-3'] })
    const args = toQueryArgs()
    expect(args.pairPlayer1Id).toBe('p0')
    expect(args.pairPlayer2Id).toBe('p1')
    expect(args.role).toBe('serve')
    expect(args.shotRanges).toEqual([{ min: 1, max: 3 }])
    expect(args.limit).toBe(200)
  })

  it('選手 receive はレシーバー側引数へ', () => {
    const { setFilter, toQueryArgs } = useStatsFilter()
    setFilter({ playerId: 'p0', role: 'receive' })
    const args = toQueryArgs()
    expect(args.receiverPlayerId).toBe('p0')
    expect(args.serverPlayerId).toBeUndefined()
  })
})
