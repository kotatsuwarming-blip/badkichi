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
  RallyEndPatch,
  ShotAnnotationPatch,
  ShotType
} from '~/types/shot-annotation'
import { loopWindowFor } from '~/utils/annotation/offset'
import { deriveOutDirection } from '~/utils/annotation/court-coords'
import { checkConsistency, decisiveShotIndex } from '~/utils/annotation/derive'

/** session のうちクイックパスが必要とする面 (構造的部分型) */
export interface QuickPassDeps {
  rallies: Ref<AnnotationRally[]>
  cursor: Ref<AnnotationCursor | null>
  shotsOf: (rallyId: string) => AnnotationShot[]
  goTo: (cursor: AnnotationCursor) => void
  patchRally: (rallyId: string, patch: RallyEndPatch, opts?: { recordUndo?: boolean }) => Promise<boolean>
  patchShot: (shotId: string, patch: ShotAnnotationPatch, opts?: { recordUndo?: boolean }) => Promise<boolean>
}

export type QuickPassStep = 'reason' | 'landing' | 'outDirection' | 'decisive'

export interface UseQuickPassReturn {
  step: Ref<QuickPassStep>
  currentRally: ComputedRef<AnnotationRally | null>
  loopWindow: ComputedRef<LoopWindow | null>
  decisiveShot: ComputedRef<AnnotationShot | null>
  lastHitterTeam: ComputedRef<Team | null>
  consistencyWarning: Ref<boolean>
  landingWarning: Ref<boolean>
  isDone: ComputedRef<boolean>
  start: () => void
  selectEndReason: (reason: EndReason) => Promise<void>
  setLanding: (point: CourtPoint) => Promise<void>
  skipLanding: () => void
  selectOutDirection: (direction: OutDirection) => Promise<void>
  setDecisiveType: (type: ShotType) => Promise<void>
  skipDecisive: () => void
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

  /** 決定打 = 勝者チームの最後のショット (REQ-006)。存在しない場合 null */
  const decisiveShot = computed<AnnotationShot | null>(() => {
    const rally = currentRally.value
    if (!rally || rally.endReason === null) return null
    const idx = decisiveShotIndex(currentShots.value.length, rally.endReason)
    if (idx === null) return null
    return currentShots.value[idx] ?? null
  })

  const isDone = computed(() => index.value === -1)

  function syncCursor(): void {
    const rally = currentRally.value
    if (rally) deps.goTo({ setId: rally.setId, rallyId: rally.id, shotId: null })
  }

  function resetStepState(): void {
    step.value = 'reason'
    consistencyWarning.value = false
    landingWarning.value = false
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
    resetStepState()
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
    resetStepState()
  }

  /** 落下点フェーズの後: 決定打があれば種別入力へ、なければ次ラリーへ */
  function afterLanding(): void {
    if (decisiveShot.value) {
      step.value = 'decisive'
    } else {
      advance()
    }
  }

  async function selectEndReason(reason: EndReason): Promise<void> {
    const rally = currentRally.value
    if (!rally) return
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
    if (reason === 'in' || reason === 'out') {
      step.value = 'landing'
    } else {
      afterLanding()
    }
  }

  /** 落下点入力 (in/out のみ、REQ-005)。out の細分は座標から導出するため保存しない */
  async function setLanding(point: CourtPoint): Promise<void> {
    const rally = currentRally.value
    if (!rally) return
    // EDGE-002: out なのにコート内座標 → 矛盾のソフト警告 (保存は行う)
    landingWarning.value = rally.endReason === 'out' && deriveOutDirection(point) === null
    await deps.patchRally(rally.id, { landX: point.x, landY: point.y, outDirection: null })
    afterLanding()
  }

  /** 落下点スキップ: out のときだけ細分のサブ選択へ (REQ-005 フォールバック) */
  function skipLanding(): void {
    if (currentRally.value?.endReason === 'out') {
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

  async function setDecisiveType(type: ShotType): Promise<void> {
    const shot = decisiveShot.value
    if (shot) await deps.patchShot(shot.id, { shotType: type })
    advance()
  }

  function skipDecisive(): void {
    advance()
  }

  return {
    step,
    currentRally,
    loopWindow,
    decisiveShot,
    lastHitterTeam,
    consistencyWarning,
    landingWarning,
    isDone,
    start,
    selectEndReason,
    setLanding,
    skipLanding,
    selectOutDirection,
    setDecisiveType,
    skipDecisive
  }
}
