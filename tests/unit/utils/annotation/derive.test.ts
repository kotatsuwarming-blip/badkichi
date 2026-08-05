/**
 * derive 単体テスト — TASK-0003 / 2026-08-02 改訂 (in/out → floor 統合)
 * in/out 導出（最終接触者 + point_winner）・勝者導出・決定打導出・整合チェック
 */
import { describe, it, expect } from 'vitest'
import { checkConsistency, decisiveShotIndex, deriveInOut, deriveWinner } from '~/utils/annotation/derive'

describe('deriveInOut (floor の in/out 導出、2026-08-02 の中核)', () => {
  it('最終接触者 = 勝者 → in（決めた）', () => {
    expect(deriveInOut('A', 'A')).toBe('in')
    expect(deriveInOut('B', 'B')).toBe('in')
  })

  it('最終接触者 = 敗者 → out（外した）', () => {
    expect(deriveInOut('A', 'B')).toBe('out')
    expect(deriveInOut('B', 'A')).toBe('out')
  })

  it('point_winner 未確定 → 導出不能 (null)', () => {
    expect(deriveInOut('A', null)).toBeNull()
  })
})

describe('deriveWinner (最終接触者 = チームA)', () => {
  it('body → 打者の得点 (A)', () => {
    expect(deriveWinner('A', 'body')).toBe('A')
  })

  it('net / not_over / service_fault → 打者の失点 (B)', () => {
    expect(deriveWinner('A', 'net')).toBe('B')
    expect(deriveWinner('A', 'not_over')).toBe('B')
    expect(deriveWinner('A', 'service_fault')).toBe('B')
  })

  it('floor / unknown → end_reason からは導出不能 (null)', () => {
    expect(deriveWinner('A', 'floor')).toBeNull()
    expect(deriveWinner('A', 'unknown')).toBeNull()
  })
})

describe('decisiveShotIndex (0-based)', () => {
  it('body → 最終ショット', () => {
    expect(decisiveShotIndex(5, 'body')).toBe(4)
  })

  it('net / not_over → 最後から2番目', () => {
    expect(decisiveShotIndex(5, 'net')).toBe(3)
    expect(decisiveShotIndex(5, 'not_over')).toBe(3)
  })

  it('floor: 勝者が最終接触なら最終ショット、敗者なら1つ前', () => {
    expect(decisiveShotIndex(5, 'floor', true)).toBe(4) // in 相当
    expect(decisiveShotIndex(5, 'floor', false)).toBe(3) // out 相当
    expect(decisiveShotIndex(5, 'floor', null)).toBeNull() // point_winner 未確定
  })

  it('TC-006-B01: 1打のみのラリー (サーブでネット) → 決定打なし', () => {
    expect(decisiveShotIndex(1, 'net')).toBeNull()
    expect(decisiveShotIndex(1, 'floor', false)).toBeNull() // サーブが out 相当
  })

  it('service_fault / unknown / ショット0件 → 決定打なし', () => {
    expect(decisiveShotIndex(1, 'service_fault')).toBeNull()
    expect(decisiveShotIndex(5, 'unknown')).toBeNull()
    expect(decisiveShotIndex(0, 'floor', true)).toBeNull()
  })
})

describe('checkConsistency', () => {
  it('TC-102-01: 導出勝者と point_winner の矛盾を検出 (false = 警告)', () => {
    // 最終接触者 A・net → 導出勝者 B。だが記録は A → 矛盾
    expect(checkConsistency('A', 'net', 'A', true)).toBe(false)
  })

  it('一致していれば true', () => {
    expect(checkConsistency('A', 'net', 'B', true)).toBe(true)
    expect(checkConsistency('A', 'body', 'A', true)).toBe(true)
  })

  it('TC-102-02: 未確定ラリーはチェックをスキップ (EDGE-005)', () => {
    expect(checkConsistency('A', 'net', 'A', false)).toBe(true)
    expect(checkConsistency('A', 'net', null, true)).toBe(true)
  })

  it('floor / unknown は導出不能のためチェックしない (in/out は逆に point_winner から導出する)', () => {
    expect(checkConsistency('A', 'floor', 'B', true)).toBe(true)
    expect(checkConsistency('A', 'unknown', 'B', true)).toBe(true)
  })
})
