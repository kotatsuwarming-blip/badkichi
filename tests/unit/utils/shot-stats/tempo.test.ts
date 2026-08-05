/**
 * tempo 純関数 単体テスト (TASK-0007 / REQ-015/016/106 / TC-015/016/106 系)
 */
import { describe, expect, it } from 'vitest'
import { isTempoEligible, toTempoSamples, tempoValueOf } from '~/utils/shot-stats/tempo'
import type { FlowRally } from '~/types/shot-stats'

function rally(partial: Partial<FlowRally>): FlowRally {
  return {
    rallyId: 'r', matchId: 'm', setNumber: 1, rallyNumber: 1,
    servingTeam: 'A', pointWinner: 'A', scoreA: 0, scoreB: 0,
    videoStartMs: null, shotCount: 11, timedCount: 11, durationMs: 10000, last3Ms: 500,
    teamA: ['p0', 'p1'], teamB: ['p2', 'p3'], ...partial
  }
}

describe('isTempoEligible (REQ-106)', () => {
  it('全ショット時刻あり・2本以上・時間>0 は適格', () => {
    expect(isTempoEligible(rally({}))).toBe(true)
  })
  it('TC-106-E01: 1本でも時刻欠損があればラリーごと対象外', () => {
    expect(isTempoEligible(rally({ shotCount: 10, timedCount: 9 }))).toBe(false)
  })
  it('TC-106-B01: ラリー時間 0 は対象外 (EDGE-104)', () => {
    expect(isTempoEligible(rally({ durationMs: 0 }))).toBe(false)
  })
  it('EDGE-102: ショット1本は対象外', () => {
    expect(isTempoEligible(rally({ shotCount: 1, timedCount: 1, durationMs: 0 }))).toBe(false)
  })
})

describe('toTempoSamples', () => {
  it('TC-015-01: 平均テンポ = (本数-1) ÷ 秒。11本10秒 → 1.0 打/秒', () => {
    const { samples } = toTempoSamples([rally({})], { kind: 'all' })
    expect(samples[0]!.avgShotsPerSec).toBeCloseTo(1.0, 5)
    expect(samples[0]!.won).toBeNull() // 視点なし
  })
  it('選手視点で won を判定し、対象外数を除外カウント', () => {
    const rows = [
      rally({ rallyId: 'r1', pointWinner: 'A' }),
      rally({ rallyId: 'r2', pointWinner: 'B' }),
      rally({ rallyId: 'r3', timedCount: 10 }) // 欠損 → 除外
    ]
    const { samples, excluded } = toTempoSamples(rows, { kind: 'player', playerId: 'p0' })
    expect(samples.map(s => s.won)).toEqual([true, false])
    expect(excluded).toBe(1)
  })
})

describe('tempoValueOf (REQ-016)', () => {
  it('TC-016-01: 終盤テンポはラスト3打の2間隔平均 (秒)', () => {
    const { samples } = toTempoSamples([rally({ last3Ms: 500 })], { kind: 'all' })
    expect(tempoValueOf(samples[0]!, 'last3')).toBeCloseTo(0.5, 5)
  })
  it('TC-106-E02: 3本未満 (last3 null) は終盤テンポ対象外・平均テンポは対象', () => {
    const { samples } = toTempoSamples([rally({ shotCount: 2, timedCount: 2, durationMs: 800, last3Ms: null })], { kind: 'all' })
    expect(tempoValueOf(samples[0]!, 'last3')).toBeNull()
    expect(tempoValueOf(samples[0]!, 'avg')).toBeCloseTo(1.25, 5)
  })
})
