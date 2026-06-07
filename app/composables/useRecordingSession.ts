/**
 * useRecordingSession — 録画セッションの集約オーケストレータ。
 *
 * 関連: architecture.md / dataflow.md / interfaces.ts UseRecordingSessionReturn
 *       REQ-002〜008 / REQ-101〜107 / REQ-110 / REQ-203 / REQ-410
 *
 * 責務:
 * - rule-engine の GameState を所有し、操作別 composable を統合する。
 * - getCurrentTimeMs は呼び出し側 (page → useVideoPlayer) から注入 (テスト時はフェイク、NFR-303)。
 * - 永続化はハイブリッド: セット境界/ラリー生成=同期、ショット/得点/override=楽観 (非同期 write-behind)。
 * - 統一「取り消し」: 直近の記録操作を1つ戻す linear undo (物理削除/snapshot 復元、REQ-110)。
 *
 * MVP 既知の制限:
 * - matchWinner は best-of-3 (先に2セット先取) 固定 (REQ-011、先取数ルールは将来可変化)。
 * - override が既存ラリー行 (ショット後) に対して起きた場合、当該行の denorm server 列は
 *   作成時の値のまま (engine 状態は正)。override は通常ラリー開始時のため影響は限定的。
 */
import { ref } from 'vue'
import type { Team, GameState } from '~/utils/rule-engine/types'
import type {
  CurrentRally,
  RallyHistoryItem,
  SetPositionInput,
  SetSetupInput,
  SetSummary,
  UseRecordingSessionReturn
} from '~/types/match-recording'
import { createInitialState } from '~/utils/rule-engine/create-initial-state'
import { applyRally } from '~/utils/rule-engine/apply-rally'
import { applyOverride } from '~/utils/rule-engine/apply-override'
import { determineSetWinner } from '~/utils/rule-engine/determine-set-winner'
import { mapGameStateToRallyDenorm } from '~/utils/match-recording/map-game-state'
import { decideOverrideType } from '~/utils/match-recording/decide-override-type'
import { useCreateSet } from '~/composables/useCreateSet'
import { useCreateSetPositions } from '~/composables/useCreateSetPositions'
import { useUpdateSet } from '~/composables/useUpdateSet'
import { useCreateRally } from '~/composables/useCreateRally'
import { useUpdateRally } from '~/composables/useUpdateRally'
import { useCreateShot } from '~/composables/useCreateShot'
import { useDeleteShot } from '~/composables/useDeleteShot'
import { useDeleteRally } from '~/composables/useDeleteRally'
import { useCreateOverride } from '~/composables/useCreateOverride'
import { useDeleteOverride } from '~/composables/useDeleteOverride'

const UNDO_LABEL: Record<string, string> = {
  shot: 'record.undo.shot',
  point: 'record.undo.point',
  let: 'record.undo.let',
  skip: 'record.undo.skip',
  override: 'record.undo.override'
}

// 内部 undo ステップ (公開 UndoStep より豊富なスナップショットを保持)
type Step
  = | { kind: 'shot', rallyId: string, shotIdP: Promise<string | null> }
    | { kind: 'point' | 'let' | 'skip', rallyId: string, prevState: GameState, prevRally: CurrentRally, addedHistory: boolean, decidedWinner: Team | null }
    | { kind: 'override', rallyId: string, prevState: GameState, team: Team, overrideIdP: Promise<string | null> }

const MATCH_SET_TARGET = 2 // best-of-3: 先に2セット

export function useRecordingSession(
  matchId: string,
  opts: { getCurrentTimeMs: () => number | null }
): UseRecordingSessionReturn {
  // --- 公開 reactive state ---
  const gameState = ref<GameState | null>(null)
  const currentRally = ref<CurrentRally | null>(null)
  const history = ref<RallyHistoryItem[]>([])
  const currentSetNumber = ref<number | null>(null)
  const setWinner = ref<Team | null>(null)
  const matchWinner = ref<Team | null>(null)
  const suggestedFirstServingTeam = ref<Team | null>(null)
  const cameraNearTeam = ref<Team | null>(null)
  const undoLabelKey = ref<string | null>(null)
  const allSynced = ref(true)

  // --- 内部 state ---
  let currentSetId: string | null = null
  let currentConfig: SetSetupInput | null = null
  let pendingPositions: SetPositionInput[] | null = null // セット遅延作成用に保持
  const overrideCounts: Record<Team, number> = { A: 0, B: 0 }
  const setWins: Record<Team, number> = { A: 0, B: 0 }
  const undoStack: Step[] = []
  const pending = new Set<Promise<unknown>>()

  // --- 依存 composable ---
  const { createSet } = useCreateSet()
  const { createSetPositions } = useCreateSetPositions()
  const { setWinner: persistSetWinner } = useUpdateSet()
  const { createRally } = useCreateRally()
  const { updateRally } = useUpdateRally()
  const { createShot } = useCreateShot()
  const { deleteShot } = useDeleteShot()
  const { deleteRally } = useDeleteRally()
  const { createOverride } = useCreateOverride()
  const { deleteOverride } = useDeleteOverride()

  // 楽観書き込みを allSynced で可視化する (REQ-110d の整合にも使用)
  function track<T>(p: Promise<T>): Promise<T> {
    allSynced.value = false
    pending.add(p)
    void p.finally(() => {
      pending.delete(p)
      if (pending.size === 0) allSynced.value = true
    })
    return p
  }

  function cloneRally(r: CurrentRally): CurrentRally {
    return { rallyNumber: r.rallyNumber, rallyId: r.rallyId, shots: r.shots.map(s => ({ ...s })), isPending: r.isPending }
  }

  function updateUndoLabel(): void {
    const top = undoStack[undoStack.length - 1]
    undoLabelKey.value = top ? UNDO_LABEL[top.kind] ?? null : null
  }

  // ラリー行の遅延生成。存在すれば既存 id を返す。
  async function ensureRallyRow(firstShotMs: number | null): Promise<string | null> {
    const cr = currentRally.value
    if (!cr || !gameState.value) return null
    if (cr.rallyId) return cr.rallyId
    const setId = await ensureSetRow() // セット行の遅延作成
    if (!setId) return null
    const denorm = mapGameStateToRallyDenorm(gameState.value, cameraNearTeam.value)
    const res = await createRally({ setId, rallyNumber: cr.rallyNumber, denorm, videoStartTimestampMs: firstShotMs })
    if (res.error || !res.data) return null
    cr.rallyId = res.data
    return res.data
  }

  // ========================================
  // セットアップ
  // ========================================

  // セット行は遅延作成: 記録開始時点では DB に書かず、最初の記録操作 (ensureSetRow) で作成する。
  // 戻って再編集しても空セットが DB に溜まらない (ラリー行と同じ遅延生成方針)。
  async function configureAndStartSet(setup: SetSetupInput, positions: SetPositionInput[]) {
    currentSetId = null
    currentConfig = setup
    pendingPositions = positions
    cameraNearTeam.value = setup.cameraNearTeamAtStart
    currentSetNumber.value = setup.setNumber
    gameState.value = createInitialState(
      { targetPoints: setup.targetPoints, enableDeuce: setup.enableDeuce, deucePointCap: setup.deucePointCap, firstServingTeam: setup.firstServingTeam },
      positions
    )
    currentRally.value = { rallyNumber: 1, rallyId: null, shots: [], isPending: false }
    history.value = []
    setWinner.value = null
    overrideCounts.A = 0
    overrideCounts.B = 0
    undoStack.length = 0
    updateUndoLabel()
    return { data: null, error: null }
  }

  // セット行の遅延作成。最初の記録操作 (ensureRallyRow) から呼ばれる。
  async function ensureSetRow(): Promise<string | null> {
    if (currentSetId) return currentSetId
    if (!currentConfig || !pendingPositions) return null
    const created = await createSet({ ...currentConfig, matchId })
    if (created.error || !created.data) return null
    const pos = await createSetPositions({ setId: created.data, positions: pendingPositions })
    if (pos.error) return null
    currentSetId = created.data
    return currentSetId
  }

  // 進行中セットの再開 (リロード時): 確定ラリーを replay して GameState を復元する。
  // MVP: override の途中適用は再現しない (engine 状態は confirmed ラリーの replay で近似)。
  function resumeSet(set: SetSummary, positions: SetPositionInput[], rallies: RallyHistoryItem[]): void {
    currentSetId = set.id
    currentConfig = set // SetSummary は SetSetupInput 互換 (config + setNumber + cameraNearTeamAtStart)
    pendingPositions = null
    cameraNearTeam.value = set.cameraNearTeamAtStart
    currentSetNumber.value = set.setNumber

    let state = createInitialState(
      { targetPoints: set.targetPoints, enableDeuce: set.enableDeuce, deucePointCap: set.deucePointCap, firstServingTeam: set.firstServingTeam },
      positions
    )
    const sorted = [...rallies].sort((a, b) => a.rallyNumber - b.rallyNumber)
    history.value = []
    for (const r of sorted) {
      if (!r.isPointConfirmed) continue // 未確定 (スキップ) は replay 不可
      history.value.push({ ...r })
      state = applyRally(state, { pointWinner: r.pointWinner, isLet: r.isLet })
    }
    gameState.value = state

    const maxNum = sorted.reduce((m, r) => Math.max(m, r.rallyNumber), 0)
    currentRally.value = { rallyNumber: maxNum + 1, rallyId: null, shots: [], isPending: false }
    setWinner.value = null
    overrideCounts.A = 0
    overrideCounts.B = 0
    undoStack.length = 0
    updateUndoLabel()
  }

  function advanceToNextSet(): void {
    suggestedFirstServingTeam.value = setWinner.value
    const next = (currentSetNumber.value ?? 0) + 1
    gameState.value = null
    currentRally.value = null
    history.value = []
    setWinner.value = null
    currentSetId = null
    currentConfig = null
    pendingPositions = null
    currentSetNumber.value = next
    undoStack.length = 0
    updateUndoLabel()
  }

  // ========================================
  // ショット
  // ========================================

  async function recordShot(): Promise<void> {
    const cr = currentRally.value
    if (!cr || cr.isPending || !gameState.value) return
    const ms = opts.getCurrentTimeMs()
    if (ms === null) return // EDGE-001: 未ロードは no-op
    const rallyId = await ensureRallyRow(ms)
    if (!rallyId) return
    const shotNumber = cr.shots.length + 1
    const draft = { shotId: null as string | null, shotNumber, videoTimestampMs: ms, synced: false }
    cr.shots.push(draft)
    const shotIdP = track(createShot({ rallyId, shotNumber, videoTimestampMs: ms })).then((res) => {
      if (res.data) {
        draft.shotId = res.data
        draft.synced = true
        return res.data
      }
      return null
    })
    undoStack.push({ kind: 'shot', rallyId, shotIdP })
    updateUndoLabel()
  }

  // ========================================
  // ラリー終了 (得点 / レット / スキップ / 確定)
  // ========================================

  async function completeRally(team: Team | null, isLet: boolean, fromPending: boolean): Promise<void> {
    const cr = currentRally.value
    if (!cr || !gameState.value || !currentConfig) return
    if (cr.isPending && !fromPending) return
    const activeState = gameState.value
    const rallyId = await ensureRallyRow(null) // 内部でセット行も遅延作成
    if (!rallyId) return

    const prevRally = cloneRally(cr)
    history.value.push({
      rallyNumber: cr.rallyNumber,
      servingTeam: activeState.servingTeam,
      serverPlayerId: activeState.server,
      receiverPlayerId: activeState.receiver,
      pointWinner: team,
      isLet,
      isPointConfirmed: true,
      shotCount: cr.shots.length,
      videoStartTimestampMs: cr.shots[0]?.videoTimestampMs ?? null
    })

    track(updateRally({ rallyId, pointWinner: team, isLet, isPointConfirmed: true }))

    const newState = applyRally(activeState, { pointWinner: team, isLet })
    gameState.value = newState

    const winner = determineSetWinner(newState.score, {
      targetPoints: currentConfig.targetPoints,
      enableDeuce: currentConfig.enableDeuce,
      deucePointCap: currentConfig.deucePointCap,
      firstServingTeam: currentConfig.firstServingTeam
    })

    undoStack.push({ kind: isLet ? 'let' : 'point', rallyId, prevState: activeState, prevRally, addedHistory: true, decidedWinner: winner })

    if (winner) {
      setWinner.value = winner
      currentRally.value = null
      setWins[winner] += 1
      if (currentSetId) await persistSetWinner({ setId: currentSetId, winner })
      if (setWins[winner] >= MATCH_SET_TARGET) matchWinner.value = winner
    } else {
      currentRally.value = { rallyNumber: cr.rallyNumber + 1, rallyId: null, shots: [], isPending: false }
    }
    updateUndoLabel()
  }

  async function recordPoint(team: Team): Promise<void> {
    await completeRally(team, false, false)
  }

  async function recordLet(): Promise<void> {
    await completeRally(null, true, false)
  }

  async function skipRally(): Promise<void> {
    const cr = currentRally.value
    if (!cr || cr.isPending || !gameState.value) return
    const rallyId = await ensureRallyRow(null)
    if (!rallyId) return
    const prevRally = cloneRally(cr)
    cr.isPending = true
    track(updateRally({ rallyId, pointWinner: null, isLet: false, isPointConfirmed: false }))
    undoStack.push({ kind: 'skip', rallyId, prevState: gameState.value, prevRally, addedHistory: false, decidedWinner: null })
    updateUndoLabel()
  }

  async function confirmSkipped(team: Team): Promise<void> {
    const cr = currentRally.value
    if (!cr || !cr.isPending) return
    cr.isPending = false
    await completeRally(team, false, true)
  }

  // ========================================
  // 左右入れ替わり (override)
  // ========================================

  async function recordOverride(team: Team): Promise<void> {
    const cr = currentRally.value
    if (!cr || !gameState.value) return
    const prevState = gameState.value
    const overrideType = decideOverrideType(overrideCounts[team])
    // engine トグルを先に適用 → 新規ラリーなら post-override denorm で行生成
    gameState.value = applyOverride(prevState, team)
    const rallyId = await ensureRallyRow(null)
    if (!rallyId) {
      gameState.value = prevState // 行生成失敗は engine も巻き戻す
      return
    }
    overrideCounts[team] += 1
    const overrideIdP = track(createOverride({ rallyId, team, overrideType })).then(r => r.data)
    undoStack.push({ kind: 'override', rallyId, prevState, team, overrideIdP })
    updateUndoLabel()
  }

  // ========================================
  // 統一「取り消し」(linear undo・現在セット内)
  // ========================================

  async function undoLast(): Promise<void> {
    const step = undoStack.pop()
    if (!step) return

    if (step.kind === 'shot') {
      const cr = currentRally.value
      const shotId = await step.shotIdP.catch(() => null) // REQ-110d: insert 解決を待つ
      if (cr && cr.rallyId === step.rallyId) {
        cr.shots.pop()
        if (shotId) track(deleteShot({ shotId }))
        if (cr.shots.length === 0 && !cr.isPending) {
          const rid = cr.rallyId
          cr.rallyId = null
          if (rid) track(deleteRally({ rallyId: rid }))
        }
      } else if (shotId) {
        track(deleteShot({ shotId }))
      }
    } else if (step.kind === 'override') {
      gameState.value = step.prevState
      overrideCounts[step.team] = Math.max(0, overrideCounts[step.team] - 1)
      const ovId = await step.overrideIdP.catch(() => null)
      if (ovId) track(deleteOverride({ overrideId: ovId }))
    } else {
      // point / let / skip: engine 復元 + ラリーを進行中に戻す
      gameState.value = step.prevState
      if (step.addedHistory) history.value.pop()
      if (step.decidedWinner && currentSetId) {
        // セット決着の取り消し
        setWins[step.decidedWinner] = Math.max(0, setWins[step.decidedWinner] - 1)
        if (matchWinner.value === step.decidedWinner) matchWinner.value = null
        setWinner.value = null
      }
      const reopened = cloneRally(step.prevRally)
      reopened.isPending = false
      currentRally.value = reopened
      track(updateRally({ rallyId: step.rallyId, pointWinner: null, isLet: false, isPointConfirmed: false }))
    }
    updateUndoLabel()
  }

  // 公開は Readonly<Ref<T>> 契約 (interface)。Ref<T> は Readonly<Ref<T>> に代入可能なため
  // そのまま返す (consumer は読み取り専用の型を受け取る)。
  return {
    gameState,
    currentRally,
    history,
    currentSetNumber,
    setWinner,
    matchWinner,
    suggestedFirstServingTeam,
    cameraNearTeam,
    configureAndStartSet,
    advanceToNextSet,
    resumeSet,
    recordShot,
    recordPoint,
    recordLet,
    skipRally,
    confirmSkipped,
    recordOverride,
    undoLast,
    undoLabelKey,
    allSynced
  }
}
