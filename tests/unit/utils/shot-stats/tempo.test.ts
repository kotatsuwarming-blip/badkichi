/**
 * tempo 純関数 単体テスト (TASK-0007 / REQ-015/016/106 + 改修2026-08-12)
 * 2 軸散布図用: x = 全体平均間隔 / y = 終盤4打平均間隔（秒/打）。対象 = 4打以上・全打点時刻あり。
 */
import { describe, expect, it } from 'vitest'
import { isTempoEligible, toTempoSamples } from '~/utils/shot-stats/tempo'
import type { FlowRally } from '~/types/shot-stats'

function rally(partial: Partial<FlowRally>): FlowRally {
  return {
    rallyId: 'r', matchId: 'm', setNumber: 1, rallyNumber: 1,
    servingTeam: 'A', pointWinner: 'A', scoreA: 0, scoreB: 0,
    videoStartMs: 1000, shotCount: 11, timedCount: 11, durationMs: 10000,
    last3Ms: 500, last4Ms: 600, videoSourceType: 'youtube', videoSourceUrl: 'u',
    teamA: ['p0', 'p1'], teamB: ['p2', 'p3'], ...partial
  }
}

describe('isTempoEligible (REQ-106 + 4打以上・2026-08-12)', () => {
  it('全ショット時刻あり・4本以上・時間>0・last4 あり は適格', () => {
    expect(isTempoEligible(rally({}))).toBe(true)
  })
  it('TC-106-E01: 1本でも時刻欠損があればラリーごと対象外', () => {
    expect(isTempoEligible(rally({ shotCount: 10, timedCount: 9 }))).toBe(false)
  })
  it('TC-106-B01: ラリー時間 0 は対象外 (EDGE-104)', () => {
    expect(isTempoEligible(rally({ durationMs: 0 }))).toBe(false)
  })
  it('4打未満は対象外（終盤4打が取れない）', () => {
    expect(isTempoEligible(rally({ shotCount: 3, timedCount: 3, last4Ms: null }))).toBe(false)
  })
  it('last4 が null（4打の時刻不足）は対象外', () => {
    expect(isTempoEligible(rally({ last4Ms: null }))).toBe(false)
  })
})

describe('toTempoSamples', () => {
  it('全体平均 = ラリー時間 ÷ (本数-1)。11本10秒 → 1.0 秒/打', () => {
    const { samples } = toTempoSamples([rally({})], { kind: 'all' })
    expect(samples[0]!.avgIntervalSec).toBeCloseTo(1.0, 5)
    expect(samples[0]!.won).toBeNull() // 視点なし
  })
  it('終盤4打平均は last4Ms を秒へ変換。動画ジャンプ用 videoStartMs を保持', () => {
    const { samples } = toTempoSamples([rally({ last4Ms: 600, videoStartMs: 5000 })], { kind: 'all' })
    expect(samples[0]!.last4IntervalSec).toBeCloseTo(0.6, 5)
    expect(samples[0]!.videoStartMs).toBe(5000)
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
  it('対象が出場していないラリーは母数外（excluded にも入らない）', () => {
    const { samples, excluded } = toTempoSamples(
      [rally({ teamA: ['px', 'py'], teamB: ['pz', 'pw'] })],
      { kind: 'player', playerId: 'p0' }
    )
    expect(samples).toHaveLength(0)
    expect(excluded).toBe(0)
  })
})
