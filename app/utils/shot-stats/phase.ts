/**
 * phase — J 局面別得点率の純関数（TASK-0006 / REQ-013/014）
 *
 * 局面はリード側得点で 序盤 0〜7 / 中盤 8〜14 / 終盤 15〜 の 3 分割。
 * 接戦 = 終盤かつ 2 点差以内（20-20 以降の延長を含む）。ヒアリング2026-08-03 確定。
 */
import type { FlowRally, PhaseKey, PhaseRate, PhaseRateEntry, StatsSubject } from '~/types/shot-stats'
import { subjectTeamOf } from '~/utils/shot-stats/flow'

/** ラリー開始時スコアから局面を判定（リード側基準） */
export function phaseOf(scoreA: number, scoreB: number): PhaseKey {
  const lead = Math.max(scoreA, scoreB)
  if (lead <= 7) return 'early'
  if (lead <= 14) return 'mid'
  return 'late'
}

/** 接戦 = 終盤かつ 2 点差以内（延長含む） */
export function isClutch(scoreA: number, scoreB: number): boolean {
  return phaseOf(scoreA, scoreB) === 'late' && Math.abs(scoreA - scoreB) <= 2
}

const PHASE_KEYS: PhaseKey[] = ['early', 'mid', 'late']

function emptyRates(): PhaseRate[] {
  return PHASE_KEYS.map(phase => ({ phase, total: 0, won: 0, clutchTotal: 0, clutchWon: 0 }))
}

function addRally(rates: PhaseRate[], rally: FlowRally, won: boolean): void {
  const rate = rates.find(x => x.phase === phaseOf(rally.scoreA, rally.scoreB))!
  rate.total += 1
  if (won) rate.won += 1
  if (isClutch(rally.scoreA, rally.scoreB)) {
    rate.clutchTotal += 1
    if (won) rate.clutchWon += 1
  }
}

/**
 * 対象ごとの局面別得点率を構築する。
 * - 選手/ペア選択時: その対象 1 エントリ（出場ラリーのみ）
 * - 全体（all）: 出場選手ごとに 1 エントリ（各ラリーは 4 選手に寄与）
 */
export function buildPhaseEntries(
  rows: FlowRally[],
  subject: StatsSubject,
  nameOf: (id: string) => string
): PhaseRateEntry[] {
  if (subject.kind !== 'all') {
    const rates = emptyRates()
    for (const r of rows) {
      const team = subjectTeamOf(r, subject)
      if (team === null) continue
      addRally(rates, r, r.pointWinner === team)
    }
    const label = subject.kind === 'player'
      ? nameOf(subject.playerId)
      : `${nameOf(subject.player1Id)} / ${nameOf(subject.player2Id)}`
    const subjectId = subject.kind === 'player' ? subject.playerId : `${subject.player1Id}-${subject.player2Id}`
    return [{ subjectId, label, rates }]
  }

  const byPlayer = new Map<string, PhaseRate[]>()
  for (const r of rows) {
    for (const [team, ids] of [['A', r.teamA], ['B', r.teamB]] as const) {
      for (const id of ids) {
        let rates = byPlayer.get(id)
        if (!rates) {
          rates = emptyRates()
          byPlayer.set(id, rates)
        }
        addRally(rates, r, r.pointWinner === team)
      }
    }
  }
  return [...byPlayer.entries()]
    .map(([subjectId, rates]) => ({ subjectId, label: nameOf(subjectId), rates }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ja'))
}
