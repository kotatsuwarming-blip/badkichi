/**
 * 【機能概要】: クイックパス (ラリー決着注釈) のモード composable。ラリー巡回・
 *             非対称ループ窓 (前1s/後2.5s)・end_reason → 落下点 → 決定打種別の
 *             ステップ進行・整合チェック警告を担う。
 * 【実装方針】: 動画制御は持たない (loopWindow を公開し、再生は VideoPane/page の責務)。
 *             書込は session.patchRally / patchShot 経由 (楽観 + undo は session が所有)。
 *             決着入力時に古い落下点をリセットし、再注釈でも整合が保たれるようにする。
 * TASK-0007 / REQ-004 / REQ-005 / REQ-006 / REQ-102 / EDGE-002
 */
import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { Team } from '~/utils/rule-engine/types'
import type {
  AnnotationCursor,
  AnnotationRally,
  AnnotationShot,
  CourtPoint,
  EndReason,
  LoopWindow,
  OutDirection,
  RallyEndPatch
} from '~/types/shot-annotation'
import { loopWindowFor } from '~/utils/annotation/offset'
import { deriveOutDirection } from '~/utils/annotation/court-coords'
import { checkConsistency, deriveInOut } from '~/utils/annotation/derive'

/** session のうちクイックパスが必要とする面 (構造的部分型) */
export interface QuickPassDeps {
  rallies: Ref<AnnotationRally[]>
  cursor: Ref<AnnotationCursor | null>
  shotsOf: (rallyId: string) => AnnotationShot[]
  goTo: (cursor: AnnotationCursor) => void
  patchRally: (rallyId: string, patch: RallyEndPatch, opts?: { recordUndo?: boolean }) => Promise<boolean>
}

export type QuickPassStep = 'reason' | 'landing' | 'outDirection'

/** end_reason のキー割当 (D6 初期値: 頻度順。2026-08-02 の 6値化に追従) */
export const QUICK_REASON_KEYS: Array<[string, EndReason]> = [
  ['1', 'floor'],
  ['2', 'net'],
  ['3', 'not_over'],
  ['4', 'body'],
  ['5', 'service_fault'],
  ['6', 'unknown']
]

export interface UseQuickPassReturn {
  step: Ref<QuickPassStep>
  currentRally: ComputedRef<AnnotationRally | null>
  loopWindow: ComputedRef<LoopWindow | null>
  lastHitterTeam: ComputedRef<Team | null>
  consistencyWarning: Ref<boolean>
  landingWarning: Ref<boolean>
  isDone: ComputedRef<boolean>
  /** floor の in/out 導出結果 (最終接触者 + point_winner。未確定は null)、2026-08-02 */
  derivedInOut: ComputedRef<'in' | 'out' | null>
  start: () => void
  goToRally: (rallyId: string) => void
  selectEndReason: (reason: EndReason) => Promise<void>
  setLanding: (point: CourtPoint) => Promise<void>
  skipLanding: () => void
  selectOutDirection: (direction: OutDirection) => Promise<void>
}

export function useQuickPass(deps: QuickPassDeps): UseQuickPassReturn {
  /** 巡回位置。-1 = 未開始 or 全ラリー完了 */
  const index = ref(-1)
  const step = ref<QuickPassStep>('reason')
  const consistencyWarning = ref(false)
  const landingWarning = ref(false)

  const currentRally = computed(() => deps.rallies.value[index.value] ?? null)
  const currentShots = computed(() =>
    currentRally.value ? deps.shotsOf(currentRally.value.id) : []
  )

  /**
   * 最終接触者のチーム。全接触がショット行の前提 (ADR-017 §7) なので
   * 打順の偶奇で決まる: 奇数打目 = サーブ側、偶数打目 = レシーブ側。
   */
  const lastHitterTeam = computed<Team | null>(() => {
    const rally = currentRally.value
    const n = currentShots.value.length
    if (!rally || n === 0) return null
    if (n % 2 === 1) return rally.servingTeam
    return rally.servingTeam === 'A' ? 'B' : 'A'
  })

  /** 決着ループの非対称窓 (REQ-004)。アンカー = 最終ショットの押下時刻 */
  const loopWindow = computed<LoopWindow | null>(() => {
    const rally = currentRally.value
    if (!rally) return null
    const last = currentShots.value[currentShots.value.length - 1]
    const anchor = last?.videoTimestampMs ?? rally.videoStartTimestampMs ?? 0
    return loopWindowFor('rallyEnd', anchor)
  })

  const isDone = computed(() => index.value === -1)

  /**
   * floor の in/out 導出 (2026-08-02): 最終接触者 = 勝者 → in / 敗者 → out。
   * in/out は動画から判定できないため入力させず、実測の point_winner から導く。
   */
  const derivedInOut = computed<'in' | 'out' | null>(() => {
    const rally = currentRally.value
    if (!rally || rally.endReason !== 'floor') return null
    if (!rally.isPointConfirmed || lastHitterTeam.value === null) return null
    return deriveInOut(lastHitterTeam.value, rally.pointWinner)
  })

  function syncCursor(): void {
    const rally = currentRally.value
    if (rally) deps.goTo({ setId: rally.setId, rallyId: rally.id, shotId: null })
  }

  /**
   * ステップだけ戻す。警告は消さない — 決着入力直後に次ラリーへ自動前進するため、
   * ここで消すと直前の矛盾警告が一瞬も見えない。警告は次の入力時にクリアする。
   */
  function resetStep(): void {
    step.value = 'reason'
  }

  /** 最初の未注釈ラリーから開始 (全て注釈済みなら先頭から見直し) */
  function start(): void {
    const rallies = deps.rallies.value
    const firstMissing = rallies.findIndex(r => r.endReason === null)
    if (rallies.length === 0) {
      index.value = -1
    } else {
      index.value = firstMissing === -1 ? 0 : firstMissing
    }
    resetStep()
    consistencyWarning.value = false
    landingWarning.value = false
    syncCursor()
  }

  /** 任意のラリーへ戻って上書き (REQ-108 の主手段) */
  function goToRally(rallyId: string): void {
    const i = deps.rallies.value.findIndex(r => r.id === rallyId)
    if (i === -1) return
    index.value = i
    resetStep()
    consistencyWarning.value = false
    landingWarning.value = false
    syncCursor()
  }

  /** 次のラリーへ (最後まで来たら完了 = isDone) */
  function advance(): void {
    if (index.value >= 0 && index.value < deps.rallies.value.length - 1) {
      index.value += 1
      syncCursor()
    } else {
      index.value = -1
    }
    resetStep()
  }

  /**
   * 落下点フェーズの後は次ラリーへ。決定打の「種別」はここでは聞かない —
   * 決定打は機械的導出 (derive.decisiveShotIndex)、種別ラベルは種別パスの責務
   * (クイックと種別の分離。ドッグフーディング 2026-07-29 の決定)。
   */
  function afterLanding(): void {
    advance()
  }

  async function selectEndReason(reason: EndReason): Promise<void> {
    const rally = currentRally.value
    if (!rally) return
    // 新しい入力が始まったので前ラリーの警告をクリア
    landingWarning.value = false
    // REQ-102: 導出勝者 vs 記録済み point_winner の矛盾はソフト警告 (保存は拒否しない)
    consistencyWarning.value = lastHitterTeam.value !== null
      && !checkConsistency(lastHitterTeam.value, reason, rally.pointWinner, rally.isPointConfirmed)
    // 再注釈で決着が変わった場合に備え、古い落下点/細分をリセットして書く
    await deps.patchRally(rally.id, {
      endReason: reason,
      landX: null,
      landY: null,
      outDirection: null
    })
    if (reason === 'floor') {
      step.value = 'landing'
    } else {
      afterLanding()
    }
  }

  /** 落下点入力 (floor のみ、REQ-005)。out の細分は座標から導出するため保存しない */
  async function setLanding(point: CourtPoint): Promise<void> {
    const rally = currentRally.value
    if (!rally) return
    // EDGE-002: 導出された in/out と座標の内外が矛盾 → ソフト警告 (保存は行う)
    const derived = derivedInOut.value
    const direction = deriveOutDirection(point)
    landingWarning.value = (derived === 'out' && direction === null)
      || (derived === 'in' && direction !== null)
    await deps.patchRally(rally.id, { landX: point.x, landY: point.y, outDirection: null })
    afterLanding()
  }

  /** 落下点スキップ: 導出が out のときだけ細分のサブ選択へ (REQ-005 フォールバック) */
  function skipLanding(): void {
    if (derivedInOut.value === 'out') {
      step.value = 'outDirection'
    } else {
      afterLanding()
    }
  }

  async function selectOutDirection(direction: OutDirection): Promise<void> {
    const rally = currentRally.value
    if (!rally) return
    await deps.patchRally(rally.id, { outDirection: direction })
    afterLanding()
  }

  return {
    step,
    currentRally,
    loopWindow,
    lastHitterTeam,
    consistencyWarning,
    landingWarning,
    isDone,
    derivedInOut,
    start,
    goToRally,
    selectEndReason,
    setLanding,
    skipLanding,
    selectOutDirection
  }
}
