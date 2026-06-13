import { describe, expect, it } from 'vitest'
import { computePlayerRate, toPairRates, toPlayerRates } from '~/utils/stats-dashboard/compute-player-rate'
import type { PairRateRow, PlayerRateRow } from '~/types/stats-dashboard'

describe('computePlayerRate', () => {
  it('母数 0 は rate=null（0 除算回避, EDGE-001）', () => {
    expect(computePlayerRate(0, 0)).toEqual({ rate: null, denominator: 0, numerator: 0 })
  })

  it('4 件中 3 件で 0.75・母数 4 を併記', () => {
    expect(computePlayerRate(4, 3)).toEqual({ rate: 0.75, denominator: 4, numerator: 3 })
  })

  it('境界: 全勝 1.0 / 全敗 0.0', () => {
    expect(computePlayerRate(2, 2).rate).toBe(1)
    expect(computePlayerRate(2, 0).rate).toBe(0)
  })
})

describe('toPlayerRates', () => {
  it('RPC 行を選手名解決つきで PlayerRate へ変換', () => {
    const rows: PlayerRateRow[] = [
      { player_id: 'p1', serve_total: 3, serve_won: 2, receive_total: 0, receive_won: 0 }
    ]
    const result = toPlayerRates(rows, id => (id === 'p1' ? '田中' : '?'))
    expect(result[0].playerName).toBe('田中')
    expect(result[0].serve.rate).toBeCloseTo(2 / 3)
    expect(result[0].receive.rate).toBeNull() // 母数 0
  })
})

describe('toPairRates', () => {
  it('ペアラベルを「名前 / 名前」で生成', () => {
    const rows: PairRateRow[] = [
      { player1_id: 'a', player2_id: 'b', serve_total: 4, serve_won: 3, receive_total: 2, receive_won: 1 }
    ]
    const result = toPairRates(rows, id => (id === 'a' ? '田中' : '佐藤'))
    expect(result[0].pairLabel).toBe('田中 / 佐藤')
    expect(result[0].serve.rate).toBe(0.75)
  })
})
