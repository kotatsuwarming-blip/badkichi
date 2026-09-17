/**
 * phase 純関数 単体テスト (TASK-0006 / REQ-013/014 / TC-013 系)
 */
import { describe, expect, it } from 'vitest'
import { phaseOf, isClutch, buildPhaseEntries } from '~/utils/shot-stats/phase'
import type { FlowRally } from '~/types/shot-stats'

function rally(partial: Partial<FlowRally>): FlowRally {
  return {
    rallyId: 'r', matchId: 'm', setNumber: 1, rallyNumber: 1,
    servingTeam: 'A', pointWinner: 'A', scoreA: 0, scoreB: 0,
    videoStartMs: null, shotCount: 2, timedCount: 2, durationMs: 1000, last3Ms: null,
    teamA: ['p0', 'p1'], teamB: ['p2', 'p3'], ...partial
  }
}

describe('phaseOf / isClutch', () => {
  it('TC-013-02: 3-2 は序盤', () => {
    expect(phaseOf(3, 2)).toBe('early')
  })
  it('リード側基準: 8-2 は中盤 / 15-3 は終盤', () => {
    expect(phaseOf(8, 2)).toBe('mid')
    expect(phaseOf(15, 3)).toBe('late')
  })
  it('TC-013-01: 15-14 は終盤かつ接戦', () => {
    expect(phaseOf(15, 14)).toBe('late')
    expect(isClutch(15, 14)).toBe(true)
  })
  it('TC-013-B01: 延長 20-20 は接戦', () => {
    expect(isClutch(20, 20)).toBe(true)
  })
  it('終盤でも 3 点差は接戦ではない', () => {
    expect(isClutch(18, 15)).toBe(false)
  })
  it('序盤の 1 点差は接戦ではない (終盤限定)', () => {
    expect(isClutch(3, 2)).toBe(false)
  })
})

describe('buildPhaseEntries', () => {
  const rows: FlowRally[] = [
    rally({ rallyId: 'r1', scoreA: 0, scoreB: 0, pointWinner: 'A' }), // 序盤 A
    rally({ rallyId: 'r2', scoreA: 10, scoreB: 8, pointWinner: 'B' }), // 中盤 B
    rally({ rallyId: 'r3', scoreA: 15, scoreB: 14, pointWinner: 'A' }) // 終盤・接戦 A
  ]
  const nameOf = (id: string) => `n:${id}`

  it('選手選択時: 出場チームの勝敗で局面別に集計', () => {
    const entries = buildPhaseEntries(rows, { kind: 'player', playerId: 'p0' }, nameOf)
    expect(entries).toHaveLength(1)
    const rates = Object.fromEntries(entries[0]!.rates.map(r => [r.phase, r]))
    expect(rates.early).toMatchObject({ total: 1, won: 1 })
    expect(rates.mid).toMatchObject({ total: 1, won: 0 })
    expect(rates.late).toMatchObject({ total: 1, won: 1, clutchTotal: 1, clutchWon: 1 })
  })

  it('相手チーム視点では勝敗が反転', () => {
    const entries = buildPhaseEntries(rows, { kind: 'player', playerId: 'p2' }, nameOf)
    const rates = Object.fromEntries(entries[0]!.rates.map(r => [r.phase, r]))
    expect(rates.early).toMatchObject({ total: 1, won: 0 })
    expect(rates.mid).toMatchObject({ total: 1, won: 1 })
  })

  it('ペア選択時: 両名が同チームのラリーのみ算入', () => {
    const mixed = [
      ...rows,
      // p0 と p2 は別チーム → ペア {p0,p2} には算入されない
      rally({ rallyId: 'r4', scoreA: 1, scoreB: 1, pointWinner: 'A' })
    ]
    const entries = buildPhaseEntries(mixed, { kind: 'pair', player1Id: 'p0', player2Id: 'p2' }, nameOf)
    const total = entries[0]!.rates.reduce((s, r) => s + r.total, 0)
    expect(total).toBe(0)
  })

  it('all: 出場 4 選手それぞれにエントリ', () => {
    const entries = buildPhaseEntries(rows, { kind: 'all' }, nameOf)
    expect(entries).toHaveLength(4)
    const p0 = entries.find(e => e.subjectId === 'p0')!
    expect(p0.rates.reduce((s, r) => s + r.total, 0)).toBe(3)
  })
})
