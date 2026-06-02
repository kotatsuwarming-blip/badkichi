import { describe, expect, it } from 'vitest'
import { applyRally } from '~/utils/rule-engine/apply-rally'
import { createInitialState } from '~/utils/rule-engine/create-initial-state'
import type { GameState, RallyResult, SetConfig, SetPlayerPosition } from '~/utils/rule-engine/types'

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

// 初期状態: A サーブ, A2(右)がサーバー, B1(左)がレシーバー, スコア0-0
function initialState(): GameState {
  return createInitialState(config, positions)
}

describe('applyRally', () => {
  it('レット: 状態が変化しない', () => {
    const state = initialState()
    const rally: RallyResult = { pointWinner: null, isLet: true }
    const next = applyRally(state, rally)

    expect(next).toEqual(state)
  })

  it('サーブ側得点: スコア+1、サーブ権維持、サーブ側左右入替', () => {
    const state = initialState()
    // A(サーブ側)が得点
    const rally: RallyResult = { pointWinner: 'A', isLet: false }
    const next = applyRally(state, rally)

    expect(next.score).toEqual({ teamA: 1, teamB: 0 })
    expect(next.servingTeam).toBe('A')
    // サーブ側(A)の左右が入替: A1→右, A2→左
    expect(next.positions.teamA).toEqual({ left: 'A2', right: 'A1' })
    // レシーブ側(B)は不動
    expect(next.positions.teamB).toEqual({ left: 'B1', right: 'B2' })
    // スコア1(奇数) → サーバーは左コートの選手 = A2(入替後)
    expect(next.server).toBe('A2')
    expect(next.serverPosition).toBe('left')
    // レシーバーは対角 = B2(右)
    expect(next.receiver).toBe('B2')
  })

  it('レシーブ側得点(新スコア偶数): サーブ権移動、位置不変、サーバーは右', () => {
    const state = initialState()
    // B(レシーブ側)が得点
    const rally: RallyResult = { pointWinner: 'B', isLet: false }
    const next = applyRally(state, rally)

    expect(next.score).toEqual({ teamA: 0, teamB: 1 })
    expect(next.servingTeam).toBe('B')
    // どちらも位置変更なし
    expect(next.positions.teamA).toEqual({ left: 'A1', right: 'A2' })
    expect(next.positions.teamB).toEqual({ left: 'B1', right: 'B2' })
    // Bのスコア1(奇数) → サーバーは左コートの選手 = B1
    expect(next.server).toBe('B1')
    expect(next.serverPosition).toBe('left')
    // レシーバーは対角 = A2(右)
    expect(next.receiver).toBe('A2')
  })

  it('レシーブ側得点(新スコア奇数): サーバーは左', () => {
    // Bスコアが1の状態を作る(Bサーブ, B1が左サーバー)
    const state = initialState()
    const rally1: RallyResult = { pointWinner: 'B', isLet: false }
    const afterB1 = applyRally(state, rally1)
    // Bサーブ中にAが得点 → サーブ権A、Bスコア1のまま
    const rally2: RallyResult = { pointWinner: 'A', isLet: false }
    const afterA1 = applyRally(afterB1, rally2)
    // Aサーブ中にBが得点 → サーブ権B、Bスコア2(偶数)
    const rally3: RallyResult = { pointWinner: 'B', isLet: false }
    const next = applyRally(afterA1, rally3)

    expect(next.servingTeam).toBe('B')
    expect(next.score.teamB).toBe(2)
    // Bのスコア2(偶数) → サーバーは右コート
    expect(next.serverPosition).toBe('right')
  })
})
