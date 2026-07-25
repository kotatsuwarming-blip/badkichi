/**
 * 【機能概要】: 種別パス (全ショットの球種入力) のモード composable。連続再生中の
 *             キー入力を順番マッチングで shot_type へ対応づけ、hand トグル・
 *             レシーブハイライト・ラリーやり直しを担う。
 * 【実装方針】: 再生制御は持たない (ラリー境界の自動停止は currentRally/rallyComplete を
 *             見て page が行う)。キー入力は「タイミングでなく順番」(REQ-007)。
 *             hand はパス単位トグル: ON なら無印 = forehand を明示保存 (REQ-104)。
 * TASK-0008 / REQ-007 / REQ-008 / REQ-103 / REQ-104 / REQ-109 / EDGE-003
 */
import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type {
  AnnotationCursor,
  AnnotationRally,
  AnnotationShot,
  ShotAnnotationPatch
} from '~/types/shot-annotation'
import { isReceiveContext, keyToShotType } from '~/utils/annotation/taxonomy'
import { matchKeyToShot } from '~/utils/annotation/order-matching'

/** session のうち種別パスが必要とする面 (構造的部分型) */
export interface TypePassDeps {
  rallies: Ref<AnnotationRally[]>
  cursor: Ref<AnnotationCursor | null>
  shotsOf: (rallyId: string) => AnnotationShot[]
  goTo: (cursor: AnnotationCursor) => void
  patchShot: (shotId: string, patch: ShotAnnotationPatch, opts?: { recordUndo?: boolean }) => Promise<boolean>
}

export interface UseTypePassReturn {
  recordHand: Ref<boolean>
  currentRally: ComputedRef<AnnotationRally | null>
  currentShots: ComputedRef<AnnotationShot[]>
  /** 次のキー入力が対応するショット (null = ラリー内すべて入力済み) */
  expectedShot: ComputedRef<AnnotationShot | null>
  /** 直前ショットがスマッシュ/プッシュ/ドライブ → レシーブ3種をハイライト (REQ-103) */
  receiveHighlight: ComputedRef<boolean>
  rallyComplete: ComputedRef<boolean>
  overflowWarning: Ref<boolean>
  isDone: ComputedRef<boolean>
  start: () => void
  handleKey: (key: string, opts?: { backhand?: boolean }) => Promise<void>
  advanceRally: () => void
  redoRally: () => Promise<void>
}

export function useTypePass(deps: TypePassDeps): UseTypePassReturn {
  /** 巡回位置。-1 = 未開始 or 完了 */
  const index = ref(-1)
  /** ラリー内で消費したキー入力数 (= 次に対応するショットの 0-based index) */
  const inputCount = ref(0)
  const recordHand = ref(false)
  const overflowWarning = ref(false)

  const currentRally = computed(() => deps.rallies.value[index.value] ?? null)
  const currentShots = computed(() =>
    currentRally.value ? deps.shotsOf(currentRally.value.id) : []
  )
  const expectedShot = computed(() => currentShots.value[inputCount.value] ?? null)
  const rallyComplete = computed(() =>
    currentRally.value !== null && inputCount.value >= currentShots.value.length
  )
  const receiveHighlight = computed(() => {
    const prev = currentShots.value[inputCount.value - 1]
    return isReceiveContext(prev?.shotType ?? null)
  })
  const isDone = computed(() => index.value === -1)

  function firstUntypedIndex(shots: AnnotationShot[]): number {
    const i = shots.findIndex(s => s.shotType === null)
    return i === -1 ? shots.length : i
  }

  function syncCursor(): void {
    const rally = currentRally.value
    if (!rally) return
    const shot = expectedShot.value
    deps.goTo({ setId: rally.setId, rallyId: rally.id, shotId: shot?.id ?? null })
  }

  function enterRally(nextIndex: number): void {
    index.value = nextIndex
    overflowWarning.value = false
    const rally = deps.rallies.value[nextIndex]
    inputCount.value = rally ? firstUntypedIndex(deps.shotsOf(rally.id)) : 0
    syncCursor()
  }

  /** 最初の未注釈ショットを含むラリーから開始 (再開対応、REQ-013) */
  function start(): void {
    const rallies = deps.rallies.value
    const firstMissing = rallies.findIndex(r =>
      deps.shotsOf(r.id).some(s => s.shotType === null)
    )
    if (rallies.length === 0) {
      index.value = -1
      return
    }
    enterRally(firstMissing === -1 ? 0 : firstMissing)
  }

  /**
   * キー入力: ラリー内 k 回目の入力 = k 番目のショット (REQ-007)。
   * 超過は無視 + 警告 (EDGE-003)。未割当キー・1打目の非サーブキーは無視 (REQ-109)。
   */
  async function handleKey(key: string, opts: { backhand?: boolean } = {}): Promise<void> {
    const shots = currentShots.value
    const idx = matchKeyToShot(shots.length, inputCount.value)
    if (idx === null) {
      overflowWarning.value = true
      return
    }
    const shot = shots[idx]
    if (!shot) return
    const type = keyToShotType(key, shot.shotNumber)
    if (type === null) return

    const patch: ShotAnnotationPatch = { shotType: type }
    if (recordHand.value) {
      // トグル ON: 無印 = forehand を明示保存 (null の曖昧性排除、REQ-104)
      patch.hand = opts.backhand ? 'backhand' : 'forehand'
    }
    await deps.patchShot(shot.id, patch)
    inputCount.value += 1
    syncCursor()
  }

  /** ラリー境界での前進 (自動一時停止後の再開は page の責務、REQ-008) */
  function advanceRally(): void {
    if (index.value >= 0 && index.value < deps.rallies.value.length - 1) {
      enterRally(index.value + 1)
    } else {
      index.value = -1
    }
  }

  /** ラリーやり直し: 当該ラリーの shot_type / hand をクリアして再入力 (EDGE-003) */
  async function redoRally(): Promise<void> {
    const rally = currentRally.value
    if (!rally) return
    for (const shot of currentShots.value) {
      if (shot.shotType !== null || shot.hand !== null) {
        await deps.patchShot(shot.id, { shotType: null, hand: null }, { recordUndo: false })
      }
    }
    inputCount.value = 0
    overflowWarning.value = false
    syncCursor()
  }

  return {
    recordHand,
    currentRally,
    currentShots,
    expectedShot,
    receiveHighlight,
    rallyComplete,
    overflowWarning,
    isDone,
    start,
    handleKey,
    advanceRally,
    redoRally
  }
}
