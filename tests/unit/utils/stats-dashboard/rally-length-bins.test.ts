import { describe, expect, it } from 'vitest'
import { binsToRanges, toRallyLengthBins } from '~/utils/stats-dashboard/rally-length-bins'
import { toRallyLengthSeries } from '~/utils/stats-dashboard/to-rally-length-series'
import { RALLY_LENGTH_BINS } from '~/types/stats-dashboard'
import type { RallyLengthRow } from '~/types/stats-dashboard'

describe('toRallyLengthBins', () => {
  const rows: RallyLengthRow[] = [
    { shot_count: 2, rallies: 4, serve_won: 1 }, // 1-3
    { shot_count: 3, rallies: 2, serve_won: 2 }, // 1-3
    { shot_count: 5, rallies: 2, serve_won: 1 }, // 4-7
    { shot_count: 15, rallies: 1, serve_won: 0 } // 13+
  ]

  it('区間へ集約し本数合計と勝率を算出', () => {
    const bins = toRallyLengthBins(rows)
    const b13 = bins.find(b => b.bin.key === '1-3')!
    expect(b13.rallies).toBe(6) // 4 + 2
    expect(b13.serveWinRate).toBeCloseTo(3 / 6)
    const b13plus = bins.find(b => b.bin.key === '13+')!
    expect(b13plus.rallies).toBe(1)
    expect(b13plus.serveWinRate).toBe(0)
  })

  it('区間内 0 件は serveWinRate=null', () => {
    const bins = toRallyLengthBins(rows)
    const b8 = bins.find(b => b.bin.key === '8-12')! // 該当行なし
    expect(b8.rallies).toBe(0)
    expect(b8.serveWinRate).toBeNull()
  })
})

describe('binsToRanges', () => {
  it('選択ビンキー → OR 範囲（複数選択の和集合）', () => {
    expect(binsToRanges(['1-3', '4-7'])).toEqual([
      { min: 1, max: 3 },
      { min: 4, max: 7 }
    ])
  })

  it('13+ は max=null（上限なし）', () => {
    expect(binsToRanges(['13+'])).toEqual([{ min: 13, max: null }])
  })

  it('空選択は空配列（フィルタなし）', () => {
    expect(binsToRanges([])).toEqual([])
  })
})

describe('toRallyLengthSeries', () => {
  it('ビン → ラベル/本数/勝率%（null 維持）の系列', () => {
    const bins = toRallyLengthBins([{ shot_count: 2, rallies: 4, serve_won: 1 }])
    const series = toRallyLengthSeries(bins)
    expect(series.keys).toEqual(RALLY_LENGTH_BINS.map(b => b.key))
    expect(series.counts[0]).toBe(4)
    expect(series.winRatesPct[0]).toBe(25) // 1/4 = 25%
    expect(series.winRatesPct[1]).toBeNull() // 4-7 は 0 件
  })
})
