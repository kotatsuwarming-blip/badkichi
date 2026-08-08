/**
 * placement 純関数 単体テスト (配球ヒートマップ改訂, ヒアリング2026-08-08 #2〜#4)
 */
import { describe, expect, it } from 'vitest'
import { buildDestCells, buildDestExtras, buildOriginCells, buildOriginProfile, FRONT_ZONE_TYPES } from '~/utils/shot-stats/placement'
import type { ShotPlacementRow } from '~/types/shot-stats'

function row(partial: Partial<ShotPlacementRow>): ShotPlacementRow {
  return {
    hit_player_id: 'p0', shot_type: 'smash', origin_row: 2, origin_col: 0,
    dest_kind: 'in', dest_out: null, dest_row: 2, dest_col: 1, shots: 1, ...partial
  }
}

const rows: ShotPlacementRow[] = [
  // 左前 (origin 2,0) から: スマッシュ 3 本 → 奥バック中央 (dest 2,1)
  row({ shots: 3 }),
  // 左前から: ヘアピン 1 本 → 奥ネット左 (dest 0,0)
  row({ shot_type: 'hairpin', dest_row: 0, dest_col: 0 }),
  // 右後 (origin 0,2) から: クリア 2 本 → 奥バック中央 (dest 2,1)
  row({ shot_type: 'clear_high', origin_row: 0, origin_col: 2, shots: 2 }),
  // 左前から: スマッシュ 1 本 → 左アウト (#4)
  row({ dest_kind: 'out', dest_out: 'left', dest_row: null, dest_col: null }),
  // 左前から: ヘアピン 2 本 → ネット (#4)
  row({ shot_type: 'hairpin', dest_kind: 'net', dest_row: null, dest_col: null, shots: 2 }),
  // 右後から: クリア 1 本 → バックアウト (#4)
  row({ shot_type: 'clear_high', origin_row: 0, origin_col: 2, dest_kind: 'out', dest_out: 'back', dest_row: null, dest_col: null })
]

describe('buildOriginCells', () => {
  it('手前セル別の打数 (ミス行き先も含む総打数) + 球種内訳 (#4)', () => {
    const cells = buildOriginCells(rows)
    const leftFront = cells.find(c => c.row === 2 && c.col === 0)!
    expect(leftFront.count).toBe(7) // smash 3+1 + hairpin 1+2
    expect(leftFront.breakdown).toEqual([
      { type: 'smash', count: 4, miss: 1 },
      { type: 'hairpin', count: 3, miss: 2 }
    ])
    expect(cells.find(c => c.row === 0 && c.col === 2)!.count).toBe(3)
  })
})

describe('buildDestCells', () => {
  it('コート内 (in) のみをセル集計。未選択時は全セル起点の合計 + 球種内訳', () => {
    const cells = buildDestCells(rows, null)
    const back = cells.find(c => c.row === 2 && c.col === 1)!
    expect(back.count).toBe(5) // smash 3 + clear 2
    expect(back.breakdown).toEqual([
      { type: 'smash', count: 3, miss: 0 },
      { type: 'clear_high', count: 2, miss: 0 }
    ])
  })

  it('手前セル選択時はそのセル起点の配球のみ (左前 → smash/hairpin だけ)', () => {
    const cells = buildDestCells(rows, { row: 2, col: 0 })
    const back = cells.find(c => c.row === 2 && c.col === 1)!
    expect(back.count).toBe(3) // clear は右後起点なので落ちる
    expect(back.breakdown).toEqual([{ type: 'smash', count: 3, miss: 0 }])
    expect(cells.find(c => c.row === 0 && c.col === 0)!.count).toBe(1)
  })

  it('未注釈種別は type null として内訳に出る', () => {
    const cells = buildDestCells([row({ shot_type: null, shots: 2 })], null)
    expect(cells[0]!.breakdown).toEqual([{ type: null, count: 2, miss: 0 }])
  })
})

describe('buildDestExtras (#4: ネット/アウトを寄せずに表示)', () => {
  it('未選択時: 全セル起点のネット/アウトを方向別に集計 + 球種内訳', () => {
    const extras = buildDestExtras(rows, null)
    expect(extras.net.count).toBe(2)
    expect(extras.net.breakdown).toEqual([{ type: 'hairpin', count: 2, miss: 2 }])
    expect(extras.left.count).toBe(1)
    expect(extras.left.breakdown).toEqual([{ type: 'smash', count: 1, miss: 1 }])
    expect(extras.back.count).toBe(1)
    expect(extras.right.count).toBe(0)
  })

  it('手前セル選択に連動して絞り込まれる', () => {
    const extras = buildDestExtras(rows, { row: 2, col: 0 })
    expect(extras.net.count).toBe(2)
    expect(extras.left.count).toBe(1)
    expect(extras.back.count).toBe(0) // バックアウトは右後起点
  })
})

describe('buildOriginProfile (#5: ゾーン別候補つきプロファイル)', () => {
  it('前ゾーン (row=2): 候補は 0 本でも表示され「打てていない選択肢」が見える', () => {
    const profile = buildOriginProfile([{ type: 'hairpin', count: 3, miss: 1 }], 2)
    expect(profile.map(p => p.type)).toEqual(FRONT_ZONE_TYPES)
    expect(profile.find(p => p.type === 'hairpin')!.count).toBe(3)
    expect(profile.find(p => p.type === 'push')!.count).toBe(0)
  })
  it('後ろゾーン (row=0): ドロップ 0 本が可視化される', () => {
    const profile = buildOriginProfile([{ type: 'smash', count: 5, miss: 0 }], 0)
    expect(profile.find(p => p.type === 'drop')!.count).toBe(0)
    expect(profile.find(p => p.type === 'smash')!.count).toBe(5)
  })
  it('候補外の実打 (サーブ等) は末尾に追加され消えない', () => {
    const profile = buildOriginProfile([{ type: 'serve_short', count: 2, miss: 0 }], 2)
    expect(profile[profile.length - 1]).toEqual({ type: 'serve_short', count: 2, miss: 0 })
  })
  it('真ん中 (row=1) は候補固定なし・実打のみ', () => {
    const profile = buildOriginProfile([{ type: 'drive', count: 4, miss: 2 }], 1)
    expect(profile).toEqual([{ type: 'drive', count: 4, miss: 2 }])
  })
})
