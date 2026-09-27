/**
 * court-coords 単体テスト — TASK-0003 / TC-014 系 + TC-005 系
 * タップ→正規化座標（範囲外値許容・clamp しない）・往復変換・out 細分導出
 */
import { describe, it, expect } from 'vitest'
import { toNormalized, fromNormalized, deriveOutDirection } from '~/utils/annotation/court-coords'
import type { CourtRect } from '~/types/shot-annotation'

// コートのライン内側を (left=40, top=60, width=200, height=400) に描いた想定
const COURT: CourtRect = { left: 40, top: 60, width: 200, height: 400 }

describe('toNormalized', () => {
  it('TC-014-01: コート中央のタップ → (0.5, 0.5)', () => {
    expect(toNormalized(140, 260, COURT)).toEqual({ x: 0.5, y: 0.5 })
  })

  it('TC-014-02: 角のタップ → (0,0) / (1,1)', () => {
    expect(toNormalized(40, 60, COURT)).toEqual({ x: 0, y: 0 })
    expect(toNormalized(240, 460, COURT)).toEqual({ x: 1, y: 1 })
  })

  it('TC-014-B01: ライン外のタップ → 範囲外値で返る (clamp しない)', () => {
    const p = toNormalized(260, 260, COURT) // サイドライン外
    expect(p.x).toBeCloseTo(1.1, 5)
    expect(p.x).toBeGreaterThan(1)
    const q = toNormalized(140, 40, COURT) // バックバウンダリー外
    expect(q.y).toBeLessThan(0)
  })
})

describe('fromNormalized', () => {
  it('TC-014-B02: 往復変換の誤差が 1px 未満', () => {
    const samples = [
      { px: 137, py: 233 },
      { px: 40, py: 460 },
      { px: 263, py: 41 } // ライン外
    ]
    for (const s of samples) {
      const back = fromNormalized(toNormalized(s.px, s.py, COURT), COURT)
      expect(Math.abs(back.px - s.px)).toBeLessThan(1)
      expect(Math.abs(back.py - s.py)).toBeLessThan(1)
    }
  })
})

describe('deriveOutDirection', () => {
  it('TC-005-01: サイドライン外 → side', () => {
    expect(deriveOutDirection({ x: 1.1, y: 0.5 })).toBe('side')
    expect(deriveOutDirection({ x: -0.05, y: 0.3 })).toBe('side')
  })

  it('バックバウンダリー外 → back', () => {
    expect(deriveOutDirection({ x: 0.5, y: 1.2 })).toBe('back')
    expect(deriveOutDirection({ x: 0.5, y: -0.1 })).toBe('back')
  })

  it('TC-005-02: 両方外 (コーナー奥) → both', () => {
    expect(deriveOutDirection({ x: 1.1, y: 1.2 })).toBe('both')
  })

  it('EDGE-002: コート内座標 → null (out との矛盾 = ソフト警告の契機)', () => {
    expect(deriveOutDirection({ x: 0.4, y: 0.5 })).toBeNull()
    expect(deriveOutDirection({ x: 0, y: 1 })).toBeNull() // ライン上はイン扱い
  })
})
