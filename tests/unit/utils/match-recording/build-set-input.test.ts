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
  aFirstPlayerId: 'A1', bFirstPlayerId: 'B1'
}

describe('buildSetInput', () => {
  it('ファースト(偶数側=右)選択から4スロットを重複なく組み立てる (EDGE-002)', () => {
    const { setup, positions } = buildSetInput(roster, base)
    expect(setup).toEqual({ setNumber: 1, targetPoints: 21, enableDeuce: true, deucePointCap: 30, firstServingTeam: 'A', cameraNearTeamAtStart: 'A' })
    expect(positions).toEqual([
      { playerId: 'A1', team: 'A', position: 'right' },
      { playerId: 'A2', team: 'A', position: 'left' },
      { playerId: 'B1', team: 'B', position: 'right' },
      { playerId: 'B2', team: 'B', position: 'left' }
    ])
  })

  it('ファーストに A2 を選ぶと A2 が右(偶数側)・A1 が左になる', () => {
    const { positions } = buildSetInput(roster, { ...base, aFirstPlayerId: 'A2' })
    expect(positions[0]).toEqual({ playerId: 'A2', team: 'A', position: 'right' })
    expect(positions[1]).toEqual({ playerId: 'A1', team: 'A', position: 'left' })
  })

  it('camera null を許容する', () => {
    const { setup } = buildSetInput(roster, { ...base, cameraNearTeamAtStart: null })
    expect(setup.cameraNearTeamAtStart).toBeNull()
  })

  it('チーム人数が 2 でないロスターは例外', () => {
    expect(() => buildSetInput(roster.slice(0, 3), base)).toThrow()
  })
})
