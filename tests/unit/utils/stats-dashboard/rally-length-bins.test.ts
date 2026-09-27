import { describe, expect, it } from 'vitest'
import { binsToRanges, ralliesToLengthBins, toRallyLengthBins } from '~/utils/stats-dashboard/rally-length-bins'
import { toRallyLengthSeries } from '~/utils/stats-dashboard/to-rally-length-series'
import { RALLY_LENGTH_BINS } from '~/types/stats-dashboard'
import type { RallyLengthRow, RallyRow } from '~/types/stats-dashboard'

describe('toRallyLengthBins', () => {
  const rows: RallyLengthRow[] = [
    { shot_count: 2, rallies: 4, serve_won: 1 }, // 2 (レシーブ決着)
    { shot_count: 3, rallies: 2, serve_won: 2 }, // 3-7
    { shot_count: 5, rallies: 2, serve_won: 1 }, // 3-7
    { shot_count: 15, rallies: 1, serve_won: 0 } // 13+
  ]

  it('区間へ集約し本数合計と勝率を算出', () => {
    const bins = toRallyLengthBins(rows)
    const b2 = bins.find(b => b.bin.key === '2')!
    expect(b2.rallies).toBe(4)
    expect(b2.serveWinRate).toBeCloseTo(1 / 4)
    const b37 = bins.find(b => b.bin.key === '3-7')!
    expect(b37.rallies).toBe(4) // 2 + 2
    expect(b37.serveWinRate).toBeCloseTo(3 / 4)
    const b13plus = bins.find(b => b.bin.key === '13+')!
    expect(b13plus.rallies).toBe(1)
    expect(b13plus.serveWinRate).toBe(0)
  })

  it('区間内 0 件は serveWinRate=null', () => {
    const bins = toRallyLengthBins(rows)
    const b1 = bins.find(b => b.bin.key === '1')! // 該当行なし（サーブ決着 0 件）
    expect(b1.rallies).toBe(0)
    expect(b1.serveWinRate).toBeNull()
    const b8 = bins.find(b => b.bin.key === '8-12')! // 該当行なし
    expect(b8.rallies).toBe(0)
    expect(b8.serveWinRate).toBeNull()
  })
})

describe('binsToRanges', () => {
  it('選択ビンキー → OR 範囲（複数選択の和集合）', () => {
    expect(binsToRanges(['1', '2', '3-7'])).toEqual([
      { min: 1, max: 1 },
      { min: 2, max: 2 },
      { min: 3, max: 7 }
    ])
  })

  it('13+ は max=null（上限なし）', () => {
    expect(binsToRanges(['13+'])).toEqual([{ min: 13, max: null }])
  })

  it('空選択は空配列（フィルタなし）', () => {
    expect(binsToRanges([])).toEqual([])
  })
})

describe('ralliesToLengthBins', () => {
  function rr(shots: number, winner: 'A' | 'B' | null, isLet = false, confirmed = true): RallyRow {
    return {
      rally_id: `r${shots}-${winner}`, match_id: 'm', match_name: 'M', match_date: null, set_number: 1, rally_number: 1,
      serving_team: 'A', server_position: 'right', server_player_id: 's', receiver_player_id: 'r',
      point_winner: winner, is_let: isLet, is_point_confirmed: confirmed,
      shot_count: shots, video_start_timestamp_ms: 0, video_source_type: 'youtube', video_source_url: 'u'
    }
  }
  it('ラリー行から直接ビン集約（確定のみ・shot0/レット除外、サーブ側勝率）', () => {
    const rows: RallyRow[] = [
      rr(2, 'A'), // 2: 1本, サーブ側勝1
      rr(3, 'B'), // 3-7: 1本, サーブ側勝0
      rr(0, 'A'), // shot0 除外
      rr(2, null, true) // レット除外
    ]
    const bins = ralliesToLengthBins(rows)
    const b2 = bins.find(b => b.bin.key === '2')!
    expect(b2.rallies).toBe(1)
    expect(b2.serveWinRate).toBe(1)
    const b37 = bins.find(b => b.bin.key === '3-7')!
    expect(b37.rallies).toBe(1)
    expect(b37.serveWinRate).toBe(0)
  })
})

describe('toRallyLengthSeries', () => {
  it('ビン → ラベル/本数/勝率%（null 維持）の系列', () => {
    const bins = toRallyLengthBins([{ shot_count: 2, rallies: 4, serve_won: 1 }])
    const series = toRallyLengthSeries(bins)
    expect(series.keys).toEqual(RALLY_LENGTH_BINS.map(b => b.key))
    expect(series.counts[1]).toBe(4) // key '2'
    expect(series.winRatesPct[1]).toBe(25) // 1/4 = 25%
    expect(series.winRatesPct[0]).toBeNull() // '1' は 0 件
    expect(series.winRatesPct[2]).toBeNull() // '3-7' は 0 件
  })
})
