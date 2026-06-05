import { describe, expect, it } from 'vitest'
import { buildSetInput } from '~/utils/match-recording/build-set-input'

const roster = [
  { playerId: 'A1', name: '佐藤', team: 'A' as const },
  { playerId: 'A2', name: '鈴木', team: 'A' as const },
  { playerId: 'B1', name: '高橋', team: 'B' as const },
  { playerId: 'B2', name: '田中', team: 'B' as const }
]

const base = {
  setNumber: 1, targetPoints: 21, enableDeuce: true, deucePointCap: 30,
  firstServingTeam: 'A' as const, cameraNearTeamAtStart: 'A' as const,
  aLeftPlayerId: 'A1', bLeftPlayerId: 'B1'
}

describe('buildSetInput', () => {
  it('左の選手選択から左右4スロットを重複なく組み立てる (EDGE-002)', () => {
    const { setup, positions } = buildSetInput(roster, base)
    expect(setup).toEqual({ setNumber: 1, targetPoints: 21, enableDeuce: true, deucePointCap: 30, firstServingTeam: 'A', cameraNearTeamAtStart: 'A' })
    expect(positions).toEqual([
      { playerId: 'A1', team: 'A', position: 'left' },
      { playerId: 'A2', team: 'A', position: 'right' },
      { playerId: 'B1', team: 'B', position: 'left' },
      { playerId: 'B2', team: 'B', position: 'right' }
    ])
  })

  it('左に A2 を選ぶと A1 が右になる', () => {
    const { positions } = buildSetInput(roster, { ...base, aLeftPlayerId: 'A2' })
    expect(positions[0]).toEqual({ playerId: 'A2', team: 'A', position: 'left' })
    expect(positions[1]).toEqual({ playerId: 'A1', team: 'A', position: 'right' })
  })

  it('camera null を許容する', () => {
    const { setup } = buildSetInput(roster, { ...base, cameraNearTeamAtStart: null })
    expect(setup.cameraNearTeamAtStart).toBeNull()
  })

  it('チーム人数が 2 でないロスターは例外', () => {
    expect(() => buildSetInput(roster.slice(0, 3), base)).toThrow()
  })
})
