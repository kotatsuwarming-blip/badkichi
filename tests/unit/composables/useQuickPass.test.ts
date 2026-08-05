/**
 * useQuickPass 単体テスト (TASK-0007 / 2026-08-02 改訂: in/out → floor 統合)
 *
 * 改訂: in/out は動画から判定できないため入力させず、「floor (越えて床へ)」だけを記録し、
 *       in/out は最終接触者 + point_winner から導出する (ドッグフーディングの決定)。
 * 検証: 開始位置 / 非対称ループ窓 / floor → 落下点 → 次ラリーの進行 / in/out 導出 /
 *       整合チェック警告 (net 等の導出可能な決着のみ、REQ-102) / EDGE-002 座標×導出の矛盾 /
 *       out_direction フォールバック。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useQuickPass } from '~/composables/useQuickPass'
import type { QuickPassDeps } from '~/composables/useQuickPass'
import type {
  AnnotationCursor,
  AnnotationRally,
  AnnotationShot,
  RallyEndPatch
} from '~/types/shot-annotation'

function rally(id: string, over: Partial<AnnotationRally> = {}): AnnotationRally {
  return {
    id,
    setId: 's1',
    setNumber: 1,
    rallyNumber: 1,
    servingTeam: 'A',
    serverPlayerId: 'A1',
    receiverPlayerId: 'B1',
    pointWinner: 'A',
    isPointConfirmed: true,
    videoStartTimestampMs: 1000,
    endReason: null,
    landX: null,
    landY: null,
    outDirection: null,
    ...over
  }
}

function shot(id: string, rallyId: string, shotNumber: number, videoTimestampMs: number): AnnotationShot {
  return {
    id,
    rallyId,
    shotNumber,
    videoTimestampMs,
    annotatedTimestampMs: null,
    shotType: null,
    hand: null,
    hitPlayerId: null,
    hitX: null,
    hitY: null
  }
}

function makeDeps(rallies: AnnotationRally[], shotsMap: Record<string, AnnotationShot[]>) {
  const ralliesRef = ref(rallies)
  const cursor = ref<AnnotationCursor | null>(null)
  const patchRally = vi.fn(async (rallyId: string, patch: RallyEndPatch) => {
    const target = ralliesRef.value.find(r => r.id === rallyId)
    if (!target) return false
    if (patch.endReason !== undefined) target.endReason = patch.endReason
    if (patch.landX !== undefined) target.landX = patch.landX
    if (patch.landY !== undefined) target.landY = patch.landY
    if (patch.outDirection !== undefined) target.outDirection = patch.outDirection
    return true
  })
  const deps: QuickPassDeps = {
    rallies: ralliesRef,
    cursor,
    shotsOf: (rallyId: string) => shotsMap[rallyId] ?? [],
    goTo: (c: AnnotationCursor) => {
      cursor.value = c
    },
    patchRally
  }
  return { deps, cursor, patchRally }
}

describe('useQuickPass', () => {
  let fixtures: ReturnType<typeof makeDeps>

  beforeEach(() => {
    // r1: 3打 (最終接触者 = サーブ側 A)、r2: 1打 (サーブのみ)
    fixtures = makeDeps(
      [rally('r1'), rally('r2', { rallyNumber: 2, pointWinner: 'B' })],
      {
        r1: [shot('sh1', 'r1', 1, 5000), shot('sh2', 'r1', 2, 6000), shot('sh3', 'r1', 3, 7000)],
        r2: [shot('sh4', 'r2', 1, 20000)]
      }
    )
  })

  it('start: 最初の未注釈ラリーへ移動しカーソル同期・決着ループは後ろ長め (REQ-004)', () => {
    fixtures.deps.rallies.value[0]!.endReason = 'floor' // r1 は注釈済み
    const qp = useQuickPass(fixtures.deps)
    qp.start()
    expect(qp.currentRally.value?.id).toBe('r2')
    expect(fixtures.cursor.value).toEqual({ setId: 's1', rallyId: 'r2', shotId: null })
    // アンカー = 最終ショット押下時刻 20000ms、窓 = 前1s/後2.5s
    expect(qp.loopWindow.value).toEqual({ fromMs: 19000, toMs: 22500 })
  })

  it('floor を選択 → 落下点ステップへ。in/out は導出される (最終接触者 A = 勝者 A → in)', async () => {
    const qp = useQuickPass(fixtures.deps)
    qp.start()
    await qp.selectEndReason('floor')
    expect(qp.consistencyWarning.value).toBe(false) // floor は整合チェック対象外
    expect(qp.step.value).toBe('landing')
    expect(qp.derivedInOut.value).toBe('in')
    expect(fixtures.patchRally).toHaveBeenCalledWith('r1', {
      endReason: 'floor',
      landX: null,
      landY: null,
      outDirection: null
    })
  })

  it('floor で最終接触者 = 敗者なら out と導出される', async () => {
    fixtures.deps.rallies.value[0]!.pointWinner = 'B' // 最終接触 A ≠ 勝者 B
    const qp = useQuickPass(fixtures.deps)
    qp.start()
    await qp.selectEndReason('floor')
    expect(qp.derivedInOut.value).toBe('out')
  })

  it('落下点が不要な決着 (net 等) は選択後すぐ次ラリーへ', async () => {
    fixtures.deps.rallies.value[0]!.pointWinner = 'B' // net → 導出勝者 B と整合
    const qp = useQuickPass(fixtures.deps)
    qp.start()
    await qp.selectEndReason('net')
    expect(qp.consistencyWarning.value).toBe(false)
    expect(qp.currentRally.value?.id).toBe('r2')
    expect(qp.step.value).toBe('reason')
  })

  it('TC-102-01: 導出可能な決着 (net) で point_winner と矛盾 → ソフト警告 (保存はされる)', async () => {
    // 最終接触 A・net → 導出勝者 B。だが記録は A → 矛盾
    const qp = useQuickPass(fixtures.deps)
    qp.start()
    await qp.selectEndReason('net')
    expect(qp.consistencyWarning.value).toBe(true)
    expect(fixtures.patchRally).toHaveBeenCalled()
  })

  it('EDGE-002: 導出 out なのにコート内座標 → 警告。座標は保存され次ラリーへ', async () => {
    fixtures.deps.rallies.value[0]!.pointWinner = 'B' // derived out
    const qp = useQuickPass(fixtures.deps)
    qp.start()
    await qp.selectEndReason('floor')
    await qp.setLanding({ x: 0.4, y: 0.5 }) // コート内 = 矛盾
    expect(qp.landingWarning.value).toBe(true)
    expect(fixtures.patchRally).toHaveBeenLastCalledWith('r1', {
      landX: 0.4,
      landY: 0.5,
      outDirection: null
    })
    expect(qp.currentRally.value?.id).toBe('r2')
  })

  it('導出 in なのにライン外座標 → 警告 (EDGE-002 の逆向き)', async () => {
    const qp = useQuickPass(fixtures.deps)
    qp.start()
    await qp.selectEndReason('floor') // derived in
    await qp.setLanding({ x: 1.2, y: 0.5 })
    expect(qp.landingWarning.value).toBe(true)
  })

  it('落下点スキップ: 導出 out のときだけ out_direction サブ選択 → 次ラリーへ (REQ-005)', async () => {
    fixtures.deps.rallies.value[0]!.pointWinner = 'B' // derived out
    const qp = useQuickPass(fixtures.deps)
    qp.start()
    await qp.selectEndReason('floor')
    qp.skipLanding()
    expect(qp.step.value).toBe('outDirection')
    await qp.selectOutDirection('back')
    expect(fixtures.patchRally).toHaveBeenLastCalledWith('r1', { outDirection: 'back' })
    expect(qp.currentRally.value?.id).toBe('r2')
  })

  it('落下点スキップ: 導出 in ならサブ選択なしで次ラリーへ', async () => {
    const qp = useQuickPass(fixtures.deps)
    qp.start()
    await qp.selectEndReason('floor') // derived in
    qp.skipLanding()
    expect(qp.currentRally.value?.id).toBe('r2')
  })

  it('最終ラリーの注釈が終わると isDone', async () => {
    const qp = useQuickPass(fixtures.deps)
    qp.start()
    await qp.selectEndReason('floor')
    await qp.setLanding({ x: 0.5, y: 0.5 })
    // r2 (1打・point_winner B = サーブ側 A の失点で整合)
    await qp.selectEndReason('net')
    expect(qp.consistencyWarning.value).toBe(false)
    expect(qp.isDone.value).toBe(true)
  })
})
