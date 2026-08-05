/**
 * mirror 純関数 単体テスト (TASK-0010 / REQ-105 / EDGE-101 / TC-C-02, TC-011-B01)
 */
import { describe, expect, it } from 'vitest'
import { mirrorForTeam, zoneOf } from '~/utils/shot-stats/mirror'

describe('mirrorForTeam (REQ-105)', () => {
  it('TC-C-02: チーム B は点対称 (0.2, 0.3) → (0.8, 0.7)', () => {
    expect(mirrorForTeam({ x: 0.2, y: 0.3 }, 'B')).toEqual({ x: 0.8, y: 0.7 })
  })
  it('チーム A はそのまま', () => {
    expect(mirrorForTeam({ x: 0.2, y: 0.3 }, 'A')).toEqual({ x: 0.2, y: 0.3 })
  })
})

describe('zoneOf (EDGE-101)', () => {
  it('3×3: (0.8, 0.7) → row 4, col 2', () => {
    expect(zoneOf({ x: 0.8, y: 0.7 })).toEqual({ row: 4, col: 2 })
  })
  it('TC-011-B01: 範囲外はクランプ算入 (y=1.05 → 最終行)', () => {
    expect(zoneOf({ x: 0.5, y: 1.05 })).toEqual({ row: 5, col: 1 })
    expect(zoneOf({ x: -0.2, y: 0.1 })).toEqual({ row: 0, col: 0 })
  })
  it('境界値 1.0 は最終ゾーンに入る', () => {
    expect(zoneOf({ x: 1, y: 1 })).toEqual({ row: 5, col: 2 })
  })
})
