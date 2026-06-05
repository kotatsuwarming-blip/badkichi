/**
 * useRecordingSession 単体テスト (TASK-0010 + TASK-0011)
 *
 * mock 戦略: 依存 Write composable を vi.mock で全て差し替え (DB なし)。rule-engine は実物 (純関数)。
 *           getCurrentTimeMs はフェイク注入 (NFR-303)。
 * 検証: セットアップ / ショット (遅延生成・未ロードno-op) / 得点→engine前進・履歴・次ラリー /
 *       レット / スキップ→確定 / override トグル / 統一undo / セット決着。
 * REQ-002〜008 / REQ-101〜107 / REQ-110 / REQ-410
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  createSet: vi.fn(),
  createSetPositions: vi.fn(),
  persistSetWinner: vi.fn(),
  createRally: vi.fn(),
  updateRally: vi.fn(),
  createShot: vi.fn(),
  deleteShot: vi.fn(),
  deleteRally: vi.fn(),
  createOverride: vi.fn(),
  deleteOverride: vi.fn()
}))

vi.mock('~/composables/useCreateSet', () => ({ useCreateSet: () => ({ createSet: m.createSet, pending: { value: false } }) }))
vi.mock('~/composables/useCreateSetPositions', () => ({ useCreateSetPositions: () => ({ createSetPositions: m.createSetPositions, pending: { value: false } }) }))
vi.mock('~/composables/useUpdateSet', () => ({ useUpdateSet: () => ({ setWinner: m.persistSetWinner, pending: { value: false } }) }))
vi.mock('~/composables/useCreateRally', () => ({ useCreateRally: () => ({ createRally: m.createRally, pending: { value: false } }) }))
vi.mock('~/composables/useUpdateRally', () => ({ useUpdateRally: () => ({ updateRally: m.updateRally }) }))
vi.mock('~/composables/useCreateShot', () => ({ useCreateShot: () => ({ createShot: m.createShot }) }))
vi.mock('~/composables/useDeleteShot', () => ({ useDeleteShot: () => ({ deleteShot: m.deleteShot }) }))
vi.mock('~/composables/useDeleteRally', () => ({ useDeleteRally: () => ({ deleteRally: m.deleteRally }) }))
vi.mock('~/composables/useCreateOverride', () => ({ useCreateOverride: () => ({ createOverride: m.createOverride }) }))
vi.mock('~/composables/useDeleteOverride', () => ({ useDeleteOverride: () => ({ deleteOverride: m.deleteOverride }) }))

// eslint-disable-next-line import/first
import { useRecordingSession } from '~/composables/useRecordingSession'
// eslint-disable-next-line import/first
import type { SetPositionInput, SetSetupInput } from '~/types/match-recording'

const positions: SetPositionInput[] = [
  { playerId: 'A1', team: 'A', position: 'left' },
  { playerId: 'A2', team: 'A', position: 'right' },
  { playerId: 'B1', team: 'B', position: 'left' },
  { playerId: 'B2', team: 'B', position: 'right' }
]

const setup: SetSetupInput = {
  setNumber: 1, targetPoints: 21, enableDeuce: true, deucePointCap: 30,
  firstServingTeam: 'A', cameraNearTeamAtStart: 'A'
}

let now = 1000
function makeSession() {
  return useRecordingSession('m1', { getCurrentTimeMs: () => now })
}

beforeEach(() => {
  vi.clearAllMocks()
  now = 1000
  let rc = 0
  m.createSet.mockResolvedValue({ data: 's1', error: null })
  m.createSetPositions.mockResolvedValue({ data: true, error: null })
  m.persistSetWinner.mockResolvedValue({ data: true, error: null })
  m.createRally.mockImplementation(async () => ({ data: `r${++rc}`, error: null }))
  m.updateRally.mockResolvedValue({ data: true, error: null })
  m.createShot.mockResolvedValue({ data: 'sh1', error: null })
  m.deleteShot.mockResolvedValue({ data: true, error: null })
  m.deleteRally.mockResolvedValue({ data: true, error: null })
  m.createOverride.mockResolvedValue({ data: 'ov1', error: null })
  m.deleteOverride.mockResolvedValue({ data: true, error: null })
})

async function startedSession() {
  const s = makeSession()
  await s.configureAndStartSet(setup, positions)
  return s
}

describe('useRecordingSession: セットアップ', () => {
  it('configureAndStartSet で GameState を初期化し第1ラリーを開始する', async () => {
    const s = await startedSession()
    expect(m.createSet).toHaveBeenCalledWith(expect.objectContaining({ matchId: 'm1', setNumber: 1 }))
    expect(m.createSetPositions).toHaveBeenCalled()
    expect(s.gameState.value?.servingTeam).toBe('A')
    expect(s.gameState.value?.server).toBe('A2') // 右コートがサーバー (スコア0=偶数)
    expect(s.currentRally.value?.rallyNumber).toBe(1)
    expect(s.currentSetNumber.value).toBe(1)
  })
})

describe('useRecordingSession: ショット', () => {
  it('打った: 遅延生成でラリー行を作り shot を追加する', async () => {
    const s = await startedSession()
    await s.recordShot()
    expect(m.createRally).toHaveBeenCalledTimes(1)
    expect(m.createShot).toHaveBeenCalledWith(expect.objectContaining({ shotNumber: 1, videoTimestampMs: 1000 }))
    expect(s.currentRally.value?.shots).toHaveLength(1)
  })

  it('未ロード (ms=null) は no-op (EDGE-001)', async () => {
    const s = makeSession()
    await s.configureAndStartSet(setup, positions)
    const sNull = useRecordingSession('m1', { getCurrentTimeMs: () => null })
    await sNull.configureAndStartSet(setup, positions)
    await sNull.recordShot()
    expect(s.currentRally.value?.shots ?? []).toHaveLength(0)
  })
})

describe('useRecordingSession: 得点とエンジン前進', () => {
  it('得点A: スコア+1・履歴追加・次ラリーへ', async () => {
    const s = await startedSession()
    await s.recordPoint('A')
    expect(s.gameState.value?.score).toEqual({ teamA: 1, teamB: 0 })
    expect(s.history.value).toHaveLength(1)
    expect(s.history.value[0]?.pointWinner).toBe('A')
    expect(s.currentRally.value?.rallyNumber).toBe(2)
    expect(m.updateRally).toHaveBeenCalledWith(expect.objectContaining({ pointWinner: 'A', isPointConfirmed: true }))
  })

  it('レット: スコア不変・履歴に追加', async () => {
    const s = await startedSession()
    await s.recordLet()
    expect(s.gameState.value?.score).toEqual({ teamA: 0, teamB: 0 })
    expect(s.history.value[0]?.isLet).toBe(true)
  })
})

describe('useRecordingSession: スキップと確定', () => {
  it('スキップで pending、確定で前進', async () => {
    const s = await startedSession()
    await s.recordShot()
    await s.skipRally()
    expect(s.currentRally.value?.isPending).toBe(true)
    expect(s.history.value).toHaveLength(0) // 確定まで履歴に載らない
    await s.confirmSkipped('B')
    expect(s.history.value).toHaveLength(1)
    expect(s.history.value[0]?.pointWinner).toBe('B')
    expect(s.currentRally.value?.isPending).toBe(false)
  })
})

describe('useRecordingSession: override トグル', () => {
  it('override で当該チームの左右が入れ替わる', async () => {
    const s = await startedSession()
    const before = s.gameState.value!.positions.teamA
    await s.recordOverride('A')
    const after = s.gameState.value!.positions.teamA
    expect(after.left).toBe(before.right)
    expect(after.right).toBe(before.left)
    expect(m.createOverride).toHaveBeenCalledWith(expect.objectContaining({ team: 'A', overrideType: 'swapped' }))
  })
})

describe('useRecordingSession: 統一 undo', () => {
  it('ショットの取り消し: メモリから除去し物理削除 (空 rally も削除)', async () => {
    const s = await startedSession()
    await s.recordShot()
    await s.undoLast()
    expect(s.currentRally.value?.shots).toHaveLength(0)
    expect(m.deleteShot).toHaveBeenCalledWith({ shotId: 'sh1' })
    expect(m.deleteRally).toHaveBeenCalled() // 空になった遅延生成 rally
  })

  it('得点の取り消し: engine 復元・履歴 pop・ラリー reopen', async () => {
    const s = await startedSession()
    await s.recordPoint('A')
    await s.undoLast()
    expect(s.gameState.value?.score).toEqual({ teamA: 0, teamB: 0 })
    expect(s.history.value).toHaveLength(0)
    expect(s.currentRally.value?.rallyNumber).toBe(1)
    expect(m.updateRally).toHaveBeenLastCalledWith(expect.objectContaining({ pointWinner: null, isPointConfirmed: false }))
  })
})

describe('useRecordingSession: セット決着', () => {
  it('21-0 でセット勝者を検知し sets.winner を保存', async () => {
    const s = await startedSession()
    for (let i = 0; i < 21; i++) await s.recordPoint('A')
    expect(s.setWinner.value).toBe('A')
    expect(m.persistSetWinner).toHaveBeenCalledWith(expect.objectContaining({ winner: 'A' }))
    expect(s.currentRally.value).toBeNull() // 決着後はアクティブラリーなし
  })
})
