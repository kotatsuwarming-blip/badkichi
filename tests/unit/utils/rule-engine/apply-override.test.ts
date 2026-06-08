import { describe, expect, it } from 'vitest'
import { applyOverride } from '~/utils/rule-engine/apply-override'
import { createInitialState } from '~/utils/rule-engine/create-initial-state'
import type { SetConfig, SetPlayerPosition } from '~/utils/rule-engine/types'

const positions: SetPlayerPosition[] = [
  { playerId: 'A1', team: 'A', position: 'left' },
  { playerId: 'A2', team: 'A', position: 'right' },
  { playerId: 'B1', team: 'B', position: 'left' },
  { playerId: 'B2', team: 'B', position: 'right' }
]

const config: SetConfig = {
  targetPoints: 21,
  enableDeuce: true,
  deucePointCap: 30,
  firstServingTeam: 'A'
}

describe('applyOverride', () => {
  it('サーブ側Override: 左右入替、サーバー変更、スコア・サーブ権・相手は不変', () => {
    // 初期: A2(右)がサーバー, B2(右)がレシーバー, スコア0-0
    const state = createInitialState(config, positions)
    const next = applyOverride(state, 'A')

    // A の左右が入替
    expect(next.positions.teamA).toEqual({ left: 'A2', right: 'A1' })
    // 相手Bは不変
    expect(next.positions.teamB).toEqual({ left: 'B1', right: 'B2' })
    // スコア・サーブ権は不変
    expect(next.score).toEqual({ teamA: 0, teamB: 0 })
    expect(next.servingTeam).toBe('A')
    // サーバーは右コート(スコア0=偶数) = A1(入替後)
    expect(next.server).toBe('A1')
    expect(next.serverPosition).toBe('right')
  })

  it('レシーブ側Override: 左右入替、レシーバー変更、サーブ側は不変', () => {
    const state = createInitialState(config, positions)
    const next = applyOverride(state, 'B')

    // B の左右が入替
    expect(next.positions.teamB).toEqual({ left: 'B2', right: 'B1' })
    // サーブ側Aは不変
    expect(next.positions.teamA).toEqual({ left: 'A1', right: 'A2' })
    // サーバーは変わらない
    expect(next.server).toBe('A2')
    // レシーバーはB同コートの右 = B1(入替後)
    expect(next.receiver).toBe('B1')
  })

  it('2回適用で元に戻る（トグル）', () => {
    const state = createInitialState(config, positions)
    const next = applyOverride(applyOverride(state, 'A'), 'A')

    expect(next).toEqual(state)
  })
})
