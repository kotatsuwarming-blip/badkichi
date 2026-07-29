/**
 * derive 単体テスト — TASK-0003 / TC-006 系 + TC-102 系
 * 勝者導出（ADR-017 §7 の表）・決定打導出・point_winner 整合チェック
 */
import { describe, it, expect } from 'vitest'
import { deriveWinner, decisiveShotIndex, checkConsistency } from '~/utils/annotation/derive'

describe('deriveWinner (最終接触者 = チームA)', () => {
  it('in / body → 打者の得点 (A)', () => {
    expect(deriveWinner('A', 'in')).toBe('A')
    expect(deriveWinner('A', 'body')).toBe('A')
  })

  it('out / net / not_over → 打者の失点 (B)', () => {
    expect(deriveWinner('A', 'out')).toBe('B')
    expect(deriveWinner('A', 'net')).toBe('B')
    expect(deriveWinner('A', 'not_over')).toBe('B')
  })

  it('service_fault → サーバー側の失点', () => {
    expect(deriveWinner('A', 'service_fault')).toBe('B')
  })

  it('unknown → 導出不能 (null)', () => {
    expect(deriveWinner('A', 'unknown')).toBeNull()
  })
})

describe('decisiveShotIndex (0-based)', () => {
  it('TC-006-01: in (最終接触者 = 勝者側) → 最終ショット', () => {
    expect(decisiveShotIndex(5, 'in')).toBe(4)
    expect(decisiveShotIndex(5, 'body')).toBe(4)
  })

  it('TC-006-02: net (最終接触者 = 敗者側) → 最後から2番目', () => {
    expect(decisiveShotIndex(5, 'net')).toBe(3)
    expect(decisiveShotIndex(5, 'out')).toBe(3)
    expect(decisiveShotIndex(5, 'not_over')).toBe(3)
  })

  it('TC-006-B01: 1打のみのラリー (サーブでネット) → 決定打なし', () => {
    expect(decisiveShotIndex(1, 'net')).toBeNull()
  })

  it('service_fault / unknown / ショット0件 → 決定打なし', () => {
    expect(decisiveShotIndex(1, 'service_fault')).toBeNull()
    expect(decisiveShotIndex(5, 'unknown')).toBeNull()
    expect(decisiveShotIndex(0, 'in')).toBeNull()
  })
})

describe('checkConsistency', () => {
  it('TC-102-01: 導出勝者と point_winner の矛盾を検出 (false = 警告)', () => {
    // 最終接触者 A・end_reason=in → 導出勝者 A。だが記録は B → 矛盾
    expect(checkConsistency('A', 'in', 'B', true)).toBe(false)
  })

  it('一致していれば true', () => {
    expect(checkConsistency('A', 'in', 'A', true)).toBe(true)
    expect(checkConsistency('A', 'net', 'B', true)).toBe(true)
  })

  it('TC-102-02: 未確定ラリーはチェックをスキップ (EDGE-005)', () => {
    expect(checkConsistency('A', 'in', 'B', false)).toBe(true)
    expect(checkConsistency('A', 'in', null, true)).toBe(true)
  })

  it('unknown は導出不能のためチェックしない', () => {
    expect(checkConsistency('A', 'unknown', 'B', true)).toBe(true)
  })
})
