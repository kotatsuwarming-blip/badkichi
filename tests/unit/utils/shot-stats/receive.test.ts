/**
 * receive 純関数 単体テスト (レシーブドリルダウン, 2026-08-08 #6)
 */
import { describe, expect, it } from 'vitest'
import { buildCourses, buildReturnEntries, buildServeFacets } from '~/utils/shot-stats/receive'
import type { ReceiveDetailRow } from '~/types/shot-stats'

function row(partial: Partial<ReceiveDetailRow>): ReceiveDetailRow {
  return {
    receiver_player_id: 'p2', server_position: 'right',
    serve_type: 'serve_short', receive_type: 'hairpin',
    dest_kind: 'in', dest_out: null, dest_row: 0, dest_col: 0,
    total: 1, won: 1, ...partial
  }
}

const rows: ReceiveDetailRow[] = [
  // ショートサーブ → ヘアピン 3本 (2勝) → ネット前左
  row({ total: 3, won: 2 }),
  // ショートサーブ → ロブ(ハイ) 2本 (0勝) → バック中央
  row({ receive_type: 'lob_high', dest_row: 2, dest_col: 1, total: 2, won: 0 }),
  // ロングサーブ → クリア 1本 (1勝) → コース不明
  row({ serve_type: 'serve_long', receive_type: 'clear_high', dest_kind: null, dest_row: null, dest_col: null, won: 1 }),
  // ショートサーブ → ヘアピン 1本 (0勝) → ネットミス
  row({ dest_kind: 'net', dest_row: null, dest_col: null, won: 0 })
]

describe('buildServeFacets (Level 1)', () => {
  it('サーブ種別を固定順で返し、0 本の種別も含む', () => {
    const facets = buildServeFacets(rows)
    expect(facets.map(f => f.type)).toEqual(['serve_short', 'serve_long', 'serve_drive', null])
    const short = facets[0]!
    expect(short.total).toBe(6) // 3+2+1
    expect(short.won).toBe(2)
    expect(facets[2]!.total).toBe(0) // ドライブサーブは 0 本でも出る
  })
})

describe('buildReturnEntries (Level 2)', () => {
  it('選択サーブへの返球種別ごとに本数降順', () => {
    const returns = buildReturnEntries(rows, 'serve_short')
    expect(returns.map(r => r.type)).toEqual(['hairpin', 'lob_high'])
    expect(returns[0]).toMatchObject({ total: 4, won: 2 }) // ヘアピン 3 + ネットミス 1
  })
})

describe('buildCourses (Level 3)', () => {
  it('選択サーブのコース別 本数・得点率 + ネット/不明を分離', () => {
    const courses = buildCourses(rows, { serveType: 'serve_short' })
    expect(courses.cells.find(c => c.row === 0 && c.col === 0)).toMatchObject({ total: 3, won: 2 })
    expect(courses.cells.find(c => c.row === 2 && c.col === 1)).toMatchObject({ total: 2, won: 0 })
    expect(courses.net).toEqual({ total: 1, won: 0 })
    expect(courses.unknown.total).toBe(0)
  })
  it('返球種別でさらに絞り込める（ドリルダウン）', () => {
    const courses = buildCourses(rows, { serveType: 'serve_short', receiveType: 'hairpin' })
    expect(courses.cells.find(c => c.row === 0 && c.col === 0)).toMatchObject({ total: 3, won: 2 })
    expect(courses.cells.find(c => c.row === 2 && c.col === 1)).toBeUndefined() // lob は落ちる
    expect(courses.net.total).toBe(1)
  })
  it('コース不明 (dest_kind null) は unknown に集計', () => {
    const courses = buildCourses(rows, { serveType: 'serve_long' })
    expect(courses.unknown).toEqual({ total: 1, won: 1 })
  })
})
