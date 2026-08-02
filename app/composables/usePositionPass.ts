/**
 * 【機能概要】: 打点パス (全ショットの打点座標 + 打者) のモード composable。
 *             ローカル動画: オフセット校正 → 静止フレーム/サムネ帯 → 座標タップ。
 *             YouTube: スローループ窓 (前後1.2s) のみ、annotated_timestamp_ms 非保存。
 * 【実装方針】: フレーム描画・ループ再生は component/page の責務 (D1)。ここは
 *             巡回・アンカー時刻計算・校正 (REQ-010)・打者プレフィル (REQ-012)・
 *             書込オーケストレーションの純粋な状態機械に徹する。
 * TASK-0009 / TASK-0010 / REQ-009 / REQ-010 / REQ-011 / REQ-012 / REQ-101 / EDGE-004
 */
import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { Team } from '~/utils/rule-engine/types'
import type {
  AnnotationCursor,
  AnnotationRally,
  AnnotationRosterEntry,
  AnnotationShot,
  CourtPoint,
  LoopWindow,
  ShotAnnotationPatch
} from '~/types/shot-annotation'
import { averageOffset, loopWindowFor } from '~/utils/annotation/offset'
import { keyToShotType } from '~/utils/annotation/taxonomy'

/** session のうち打点パスが必要とする面 (構造的部分型) */
export interface PositionPassDeps {
  rallies: Ref<AnnotationRally[]>
  roster: Ref<AnnotationRosterEntry[]>
  cursor: Ref<AnnotationCursor | null>
  isYoutube: ComputedRef<boolean> | Ref<boolean>
  shotsOf: (rallyId: string) => AnnotationShot[]
  goTo: (cursor: AnnotationCursor) => void
  patchShot: (shotId: string, patch: ShotAnnotationPatch, opts?: { recordUndo?: boolean }) => Promise<boolean>
}

interface PassEntry {
  shot: AnnotationShot
  rally: AnnotationRally
}

/** 校正に使う冒頭ショット数 (REQ-010「冒頭数ショット」の初期値、D6 で試用後調整) */
const CALIBRATION_SAMPLES = 3
/** サムネ帯: 補正後時刻の前後 ±0.5 秒から 5 枚 (REQ-011、初期値は D6) */
const STRIP_OFFSETS_MS = [-400, -200, 0, 200, 400]

export interface UsePositionPassReturn {
  currentShot: ComputedRef<AnnotationShot | null>
  currentRally: ComputedRef<AnnotationRally | null>
  /** 表示アンカー時刻 (ローカル: 押下時刻 + 校正オフセット / YouTube: 生の押下時刻) */
  anchorMs: ComputedRef<number | null>
  /** サムネ帯の抽出時刻列 (ローカルのみ。YouTube は null、REQ-101) */
  stripTimesMs: ComputedRef<number[] | null>
  /** スローループ窓 (YouTube のみ。前長め = hitSearch、REQ-101) */
  loopWindow: ComputedRef<LoopWindow | null>
  /** 校正中か (ローカルの冒頭ショット、REQ-010) */
  isCalibrating: ComputedRef<boolean>
  offsetMs: Ref<number>
  /** 打者の二択候補 (プレフィルで確定できない 3 打目以降のみ、REQ-012) */
  hitterCandidates: ComputedRef<AnnotationRosterEntry[]>
  awaitingHitter: Ref<boolean>
  isDone: ComputedRef<boolean>
  recordHand: Ref<boolean>
  start: () => void
  goToRally: (rallyId: string) => void
  /** 特定ショットへ移動 (undo 後の位置復元など、2026-08-03) */
  goToShot: (shotId: string) => void
  /** 現在ショットの種別入力 (打点との同時入力。特に YouTube 向け、2026-08-02)。前進しない */
  setType: (key: string, opts?: { backhand?: boolean }) => Promise<void>
  /** フレーム確定 (ローカルのみ実書込)。校正中はサンプルにも追加 */
  confirmFrame: (frameMs: number) => Promise<void>
  setPosition: (point: CourtPoint) => Promise<void>
  selectHitter: (playerId: string) => Promise<void>
  skipShot: () => void
}

export function usePositionPass(deps: PositionPassDeps): UsePositionPassReturn {
  const index = ref(-1)
  const offsetMs = ref(0)
  const samples = ref<number[]>([])
  const awaitingHitter = ref(false)
  /** hand トグル (REQ-104 と同じ作法。ON なら無印 = forehand を明示保存)、2026-08-03 */
  const recordHand = ref(false)

  const entries = computed<PassEntry[]>(() =>
    deps.rallies.value.flatMap(rally =>
      deps.shotsOf(rally.id).map(shot => ({ shot, rally }))
    )
  )

  const currentEntry = computed(() => entries.value[index.value] ?? null)
  const currentShot = computed(() => currentEntry.value?.shot ?? null)
  const currentRally = computed(() => currentEntry.value?.rally ?? null)
  const isDone = computed(() => index.value === -1)
  const isYoutube = computed(() => deps.isYoutube.value)

  /** ローカルの冒頭ショットで校正 (サンプルが揃うまで)。YouTube は校正なし (REQ-101) */
  const isCalibrating = computed(() =>
    !isYoutube.value && samples.value.length < CALIBRATION_SAMPLES && currentShot.value !== null
  )

  /**
   * アンカーの元時刻: ショット自身の押下時刻 → 後続/直前の近傍ショット → ラリー開始押下。
   * 挿入されたショット行は video_timestamp_ms が null のことがある (先頭挿入・空ラリーへの
   * 連続挿入)。null のままだとループ窓が作れず「ラリーへ遷移できない」ため近傍へ倒す
   * (ドッグフーディング 2026-08-03)。
   */
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
    // 確定済みならそれを最優先 (再訪時。ローカルのみ保存される)
    if (!isYoutube.value && entry.shot.annotatedTimestampMs !== null) {
      return Math.max(0, entry.shot.annotatedTimestampMs) // EDGE-004
    }
    const base = baseTimestampMs(entry)
    if (base === null) return null
    if (isYoutube.value) return base
    return Math.max(0, base + offsetMs.value) // 押下時刻 + 校正オフセット (EDGE-004)
  })

  const stripTimesMs = computed<number[] | null>(() => {
    if (isYoutube.value) return null
    const anchor = anchorMs.value
    if (anchor === null) return null
    return STRIP_OFFSETS_MS.map(offset => Math.max(0, anchor + offset))
  })

  const loopWindow = computed<LoopWindow | null>(() => {
    if (!isYoutube.value) return null
    const anchor = anchorMs.value
    if (anchor === null) return null
    return loopWindowFor('hitSearch', anchor)
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

  /** 最初の未注釈 (hit_x が null) ショットから開始 (REQ-013 再開) */
  function start(): void {
    const list = entries.value
    const firstMissing = list.findIndex(e => e.shot.hitX === null)
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

  /** 特定ショットへ移動 (undo 後の位置復元、2026-08-03) */
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
   * フレーム確定 (REQ-010)。ローカル: annotated_timestamp_ms へ保存し、校正中は
   * (確定時刻 − 押下時刻) をサンプルに追加。YouTube: フレーム精度がないため何も書かない
   * (TC-101-03。精度不明の時刻を教師データに混ぜない)。
   */
  async function confirmFrame(frameMs: number): Promise<void> {
    const shot = currentShot.value
    if (!shot || isYoutube.value) return
    if (isCalibrating.value && shot.videoTimestampMs !== null) {
      samples.value = [...samples.value, frameMs - shot.videoTimestampMs]
      if (samples.value.length >= CALIBRATION_SAMPLES) {
        offsetMs.value = averageOffset(samples.value)
      }
    }
    await deps.patchShot(shot.id, { annotatedTimestampMs: frameMs })
  }

  /**
   * 種別の同時入力 (2026-08-02、YouTube の種別パスが実質スロー視聴になる問題への対応)。
   * ステップ&ループ方式では動画が待ってくれるため、種別 + 打点の同時入力が成立する。
   * 前進は打点タップ側が担う。
   */
  async function setType(key: string, opts: { backhand?: boolean } = {}): Promise<void> {
    const shot = currentShot.value
    if (!shot) return
    const type = keyToShotType(key, shot.shotNumber)
    if (type === null) return
    const patch: ShotAnnotationPatch = { shotType: type }
    if (recordHand.value) {
      // トグル ON: 無印 = forehand を明示保存 (null の曖昧性排除、REQ-104 と同じ作法)
      patch.hand = opts.backhand ? 'backhand' : 'forehand'
    }
    await deps.patchShot(shot.id, patch)
  }

  /** 打点タップ (REQ-009/014)。打者はプレフィルで確定できれば同時書込、二択なら保留 */
  async function setPosition(point: CourtPoint): Promise<void> {
    const entry = currentEntry.value
    if (!entry) return
    const patch: ShotAnnotationPatch = { hitX: point.x, hitY: point.y }
    // プレフィル: 1打目 = サーバー / 2打目 = レシーバー (REQ-012、入力不要)
    if (entry.shot.shotNumber === 1) {
      patch.hitPlayerId = entry.rally.serverPlayerId
    } else if (entry.shot.shotNumber === 2) {
      patch.hitPlayerId = entry.rally.receiverPlayerId
    }
    await deps.patchShot(entry.shot.id, patch)
    if (entry.shot.shotNumber <= 2 || entry.shot.hitPlayerId !== null) {
      advance()
    } else {
      // 3打目以降: チームは偶奇で確定済み。ペア2人の二択のみ人に聞く (REQ-012)
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
    anchorMs,
    stripTimesMs,
    loopWindow,
    isCalibrating,
    offsetMs,
    hitterCandidates,
    awaitingHitter,
    isDone,
    recordHand,
    start,
    goToRally,
    goToShot,
    setType,
    confirmFrame,
    setPosition,
    selectHitter,
    skipShot
  }
}
