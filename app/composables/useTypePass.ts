/**
 * 【機能概要】: 種別パス (キーボード専用) のモード composable。全ショットパスと同じ
 *             ショット単位のステップ&ループ方式で、種別 (+Shift=バック) → 打者 (1/2) を
 *             キーボードだけで入力して自動前進する (ドッグフーディング 2026-08-03 再設計。
 *             旧: 連続再生 + 順番マッチング REQ-007/008 は廃止)。
 * 【実装方針】: 巡回・アンカー・打者プレフィルは usePositionPass と同じ構造。打点タップと
 *             ローカル校正を持たない代わりに、前進は種別キー (1-2打目) / 打者選択 (3打目以降)。
 *             動画のループ再生は page の責務 (D1)。
 * TASK-0008 / REQ-103 / REQ-104 / REQ-109 / REQ-012
 */
import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { Team } from '~/utils/rule-engine/types'
import type {
  AnnotationCursor,
  AnnotationRally,
  AnnotationRosterEntry,
  AnnotationShot,
  LoopWindow,
  ShotAnnotationPatch
} from '~/types/shot-annotation'
import { loopWindowFor } from '~/utils/annotation/offset'
import { isReceiveContext, keyToShotType } from '~/utils/annotation/taxonomy'

/** session のうち種別パスが必要とする面 (構造的部分型) */
export interface TypePassDeps {
  rallies: Ref<AnnotationRally[]>
  roster: Ref<AnnotationRosterEntry[]>
  cursor: Ref<AnnotationCursor | null>
  shotsOf: (rallyId: string) => AnnotationShot[]
  goTo: (cursor: AnnotationCursor) => void
  patchShot: (shotId: string, patch: ShotAnnotationPatch, opts?: { recordUndo?: boolean }) => Promise<boolean>
}

interface PassEntry {
  shot: AnnotationShot
  rally: AnnotationRally
}

export interface UseTypePassReturn {
  currentShot: ComputedRef<AnnotationShot | null>
  currentRally: ComputedRef<AnnotationRally | null>
  /** 現在ラリーのショット一覧 (チップ表示・ショットジャンプ用) */
  currentShots: ComputedRef<AnnotationShot[]>
  /** ループ窓のアンカー時刻 (注釈済み打刻 → 押下 → 近傍 → ラリー開始の順) */
  anchorMs: ComputedRef<number | null>
  /** スローループ窓 (種別判定には動きが必要なため、ローカル動画でもループ) */
  loopWindow: ComputedRef<LoopWindow | null>
  /** 直前ショットがスマッシュ/プッシュ/ドライブ → レシーブ3種をハイライト (REQ-103) */
  receiveHighlight: ComputedRef<boolean>
  /** 打者の二択候補 (3打目以降のみ、REQ-012) */
  hitterCandidates: ComputedRef<AnnotationRosterEntry[]>
  awaitingHitter: Ref<boolean>
  isDone: ComputedRef<boolean>
  recordHand: Ref<boolean>
  start: () => void
  goToRally: (rallyId: string) => void
  goToShot: (shotId: string) => void
  /** 種別入力。1-2打目は打者プレフィルつきで前進、3打目以降は打者二択を待つ */
  inputType: (key: string, opts?: { backhand?: boolean }) => Promise<void>
  selectHitter: (playerId: string) => Promise<void>
  skipShot: () => void
}

export function useTypePass(deps: TypePassDeps): UseTypePassReturn {
  const index = ref(-1)
  const awaitingHitter = ref(false)
  // 既定 ON (ドッグフーディング 2026-08-03「フォア/バックの記録はデフォルトでオンに」)
  const recordHand = ref(true)

  const entries = computed<PassEntry[]>(() =>
    deps.rallies.value.flatMap(rally =>
      deps.shotsOf(rally.id).map(shot => ({ shot, rally }))
    )
  )

  const currentEntry = computed(() => entries.value[index.value] ?? null)
  const currentShot = computed(() => currentEntry.value?.shot ?? null)
  const currentRally = computed(() => currentEntry.value?.rally ?? null)
  const currentShots = computed<AnnotationShot[]>(() => {
    const rally = currentRally.value
    return rally ? deps.shotsOf(rally.id) : []
  })
  const isDone = computed(() => index.value === -1)

  /** アンカーの元時刻 (usePositionPass と同じフォールバック。挿入ショットの null 対策) */
  function baseTimestampMs(entry: PassEntry): number | null {
    if (entry.shot.videoTimestampMs !== null) return entry.shot.videoTimestampMs
    const shots = deps.shotsOf(entry.rally.id)
    const i = shots.findIndex(s => s.id === entry.shot.id)
    const next = shots.slice(i + 1).find(s => s.videoTimestampMs !== null)
    if (next) return next.videoTimestampMs
    const prev = shots.slice(0, Math.max(0, i)).reverse().find(s => s.videoTimestampMs !== null)
    if (prev) return prev.videoTimestampMs
    return entry.rally.videoStartTimestampMs
  }

  const anchorMs = computed<number | null>(() => {
    const entry = currentEntry.value
    if (!entry) return null
    if (entry.shot.annotatedTimestampMs !== null) {
      return Math.max(0, entry.shot.annotatedTimestampMs) // EDGE-004
    }
    return baseTimestampMs(entry)
  })

  const loopWindow = computed<LoopWindow | null>(() => {
    const anchor = anchorMs.value
    if (anchor === null) return null
    return loopWindowFor('hitSearch', anchor)
  })

  const receiveHighlight = computed(() => {
    const shots = currentShots.value
    const shot = currentShot.value
    if (!shot) return false
    const i = shots.findIndex(s => s.id === shot.id)
    const prev = shots[i - 1]
    return isReceiveContext(prev?.shotType ?? null)
  })

  /** 打者チーム: 打順の偶奇で確定 (奇数打 = サーブ側、REQ-012) */
  const hitterTeam = computed<Team | null>(() => {
    const entry = currentEntry.value
    if (!entry) return null
    if (entry.shot.shotNumber % 2 === 1) return entry.rally.servingTeam
    return entry.rally.servingTeam === 'A' ? 'B' : 'A'
  })

  const hitterCandidates = computed<AnnotationRosterEntry[]>(() => {
    const team = hitterTeam.value
    if (team === null) return []
    return deps.roster.value.filter(p => p.team === team)
  })

  function syncCursor(): void {
    const entry = currentEntry.value
    if (!entry) return
    deps.goTo({ setId: entry.rally.setId, rallyId: entry.rally.id, shotId: entry.shot.id })
  }

  /** 最初の未入力 (shot_type が null) ショットから開始 (REQ-013 再開) */
  function start(): void {
    const list = entries.value
    const firstMissing = list.findIndex(e => e.shot.shotType === null)
    if (list.length === 0) {
      index.value = -1
      return
    }
    index.value = firstMissing === -1 ? 0 : firstMissing
    awaitingHitter.value = false
    syncCursor()
  }

  /** 任意のラリーの先頭ショットへ戻って上書き (REQ-108 の主手段) */
  function goToRally(rallyId: string): void {
    const i = entries.value.findIndex(e => e.rally.id === rallyId)
    if (i === -1) return
    index.value = i
    awaitingHitter.value = false
    syncCursor()
  }

  /** 特定ショットへ移動 (チップ・undo 後の位置復元) */
  function goToShot(shotId: string): void {
    const i = entries.value.findIndex(e => e.shot.id === shotId)
    if (i === -1) return
    index.value = i
    awaitingHitter.value = false
    syncCursor()
  }

  function advance(): void {
    awaitingHitter.value = false
    if (index.value >= 0 && index.value < entries.value.length - 1) {
      index.value += 1
      syncCursor()
    } else {
      index.value = -1
    }
  }

  /**
   * 種別入力。1打目 = サーバー / 2打目 = レシーバーを打者プレフィルして前進 (REQ-012)。
   * 3打目以降は打者の二択を待つ (常に聞く = 再訪時の打者上書きはこのパスが担う)。
   */
  async function inputType(key: string, opts: { backhand?: boolean } = {}): Promise<void> {
    const entry = currentEntry.value
    if (!entry) return
    const type = keyToShotType(key, entry.shot.shotNumber)
    if (type === null) return
    const patch: ShotAnnotationPatch = { shotType: type }
    if (recordHand.value) {
      // トグル ON: 無印 = forehand を明示保存 (null の曖昧性排除、REQ-104)
      patch.hand = opts.backhand ? 'backhand' : 'forehand'
    }
    if (entry.shot.shotNumber === 1) {
      patch.hitPlayerId = entry.rally.serverPlayerId
    } else if (entry.shot.shotNumber === 2) {
      patch.hitPlayerId = entry.rally.receiverPlayerId
    }
    await deps.patchShot(entry.shot.id, patch)
    if (entry.shot.shotNumber <= 2) {
      advance()
    } else {
      awaitingHitter.value = true
    }
  }

  async function selectHitter(playerId: string): Promise<void> {
    const shot = currentShot.value
    if (!shot) return
    await deps.patchShot(shot.id, { hitPlayerId: playerId })
    advance()
  }

  function skipShot(): void {
    advance()
  }

  return {
    currentShot,
    currentRally,
    currentShots,
    anchorMs,
    loopWindow,
    receiveHighlight,
    hitterCandidates,
    awaitingHitter,
    isDone,
    recordHand,
    start,
    goToRally,
    goToShot,
    inputType,
    selectHitter,
    skipShot
  }
}
