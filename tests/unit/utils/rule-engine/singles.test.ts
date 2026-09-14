/**
 * rule-engine シングルス流用テスト (singles-support)
 *
 * 方針: シングルスは「各チーム right の 1 行」だけを与え、createInitialState が left を同一選手で埋める。
 *       以降の applyRally は無変更のダブルス実装のまま、サーブ位置の偶奇規則 (右=偶数/左=奇数) と
 *       サーバー/レシーバー (=相手) が正しく導出されることを確認する。
 */
import { describe, expect, it } from 'vitest'
import { createInitialState } from '~/utils/rule-engine/create-initial-state'
import { applyRally } from '~/utils/rule-engine/apply-rally'
import { applyOverride } from '~/utils/rule-engine/apply-override'
import type { SetConfig, SetPlayerPosition } from '~/utils/rule-engine/types'

const config: SetConfig = { targetPoints: 21, enableDeuce: true, deucePointCap: 30, firstServingTeam: 'A' }
const singles: SetPlayerPosition[] = [
  { playerId: 'A1', team: 'A', position: 'right' },
  { playerId: 'B1', team: 'B', position: 'right' }
]

describe('rule-engine singles', () => {
  it('createInitialState: 片側スロットのみの入力で両スロットが同一選手で埋まる', () => {
    const s = createInitialState(config, singles)
    expect(s.positions.teamA).toEqual({ left: 'A1', right: 'A1' })
    expect(s.positions.teamB).toEqual({ left: 'B1', right: 'B1' })
    expect(s.server).toBe('A1')
    expect(s.receiver).toBe('B1')
    expect(s.serverPosition).toBe('right')
  })

  it('applyRally: サーブ側得点で同じ選手が左コートからサーブ (奇数) → 相手がレシーブ', () => {
    let s = createInitialState(config, singles)
    s = applyRally(s, { pointWinner: 'A', isLet: false })
    expect(s.score).toEqual({ teamA: 1, teamB: 0 })
    expect(s.servingTeam).toBe('A')
    expect(s.server).toBe('A1')
    expect(s.receiver).toBe('B1')
    expect(s.serverPosition).toBe('left')
    // 左右入替が起きても同一選手なので positions は不変
    expect(s.positions.teamA).toEqual({ left: 'A1', right: 'A1' })
  })

  it('applyRally: レシーブ側得点でサーブ権が移り、相手スコアの偶奇で位置が決まる', () => {
    let s = createInitialState(config, singles)
    s = applyRally(s, { pointWinner: 'B', isLet: false }) // B 1-0 → B が右 (奇数? いや B=1 → 左)
    expect(s.servingTeam).toBe('B')
    expect(s.server).toBe('B1')
    expect(s.receiver).toBe('A1')
    expect(s.serverPosition).toBe('left')
    s = applyRally(s, { pointWinner: 'B', isLet: false }) // B 2-0 → 右
    expect(s.serverPosition).toBe('right')
    expect(s.server).toBe('B1')
  })

  it('applyOverride: シングルスでは no-op 相当 (同一選手の入替)', () => {
    const s = createInitialState(config, singles)
    const o = applyOverride(s, 'A')
    expect(o.positions).toEqual(s.positions)
    expect(o.server).toBe('A1')
    expect(o.receiver).toBe('B1')
  })

  it('doubles の 4 行入力は従来どおり (回帰)', () => {
    const s = createInitialState(config, [
      { playerId: 'A1', team: 'A', position: 'right' },
      { playerId: 'A2', team: 'A', position: 'left' },
      { playerId: 'B1', team: 'B', position: 'right' },
      { playerId: 'B2', team: 'B', position: 'left' }
    ])
    expect(s.positions.teamA).toEqual({ left: 'A2', right: 'A1' })
    expect(s.positions.teamB).toEqual({ left: 'B2', right: 'B1' })
  })
})
