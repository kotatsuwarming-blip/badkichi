/**
 * useQuickPass 単体テスト (TASK-0007)
 *
 * mock 戦略: QuickPassDeps を素の ref + 疑似 patch (session と同じく local 反映) で構成。
 * 検証: 開始位置 (最初の未注釈) / 非対称ループ窓 / end_reason ステップ進行 (in・out → 落下点) /
 *       整合チェック警告 (REQ-102) / EDGE-002 落下点矛盾 / out_direction フォールバック /
 *       決定打の特定と種別書込 / 1打ネットは決定打なしで自動前進 (TC-006-B01)。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useQuickPass } from '~/composables/useQuickPass'
import type { QuickPassDeps } from '~/composables/useQuickPass'
import type {
  AnnotationCursor,
  AnnotationRally,
  AnnotationShot,
  RallyEndPatch,
  ShotAnnotationPatch
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
  const patchShot = vi.fn(async (shotId: string, patch: ShotAnnotationPatch) => {
    const target = Object.values(shotsMap).flat().find(s => s.id === shotId)
    if (!target) return false
    if (patch.shotType !== undefined) target.shotType = patch.shotType
    return true
  })
  const deps: QuickPassDeps = {
    rallies: ralliesRef,
    cursor,
    shotsOf: (rallyId: string) => shotsMap[rallyId] ?? [],
    goTo: (c: AnnotationCursor) => {
      cursor.value = c
    },
    patchRally,
    patchShot
  }
  return { deps, cursor, patchRally, patchShot }
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
    fixtures.deps.rallies.value[0]!.endReason = 'in' // r1 は注釈済み
    const qp = useQuickPass(fixtures.deps)
    qp.start()
    expect(qp.currentRally.value?.id).toBe('r2')
    expect(fixtures.cursor.value).toEqual({ setId: 's1', rallyId: 'r2', shotId: null })
    // アンカー = 最終ショット押下時刻 20000ms、窓 = 前1s/後2.5s
    expect(qp.loopWindow.value).toEqual({ fromMs: 19000, toMs: 22500 })
  })

  it('in を選択 → 落下点ステップへ。整合していれば警告なし', async () => {
    const qp = useQuickPass(fixtures.deps)
    qp.start()
    // r1: 3打 → 最終接触者 A。in → 導出勝者 A = point_winner A で整合
    await qp.selectEndReason('in')
    expect(qp.consistencyWarning.value).toBe(false)
    expect(qp.step.value).toBe('landing')
    expect(fixtures.patchRally).toHaveBeenCalledWith('r1', {
      endReason: 'in',
      landX: null,
      landY: null,
      outDirection: null
    })
  })

  it('TC-102-01: 導出勝者と point_winner の矛盾でソフト警告 (保存はされる)', async () => {
    fixtures.deps.rallies.value[0]!.pointWinner = 'B'
    const qp = useQuickPass(fixtures.deps)
    qp.start()
    await qp.selectEndReason('in') // 導出勝者 A ≠ 記録 B
    expect(qp.consistencyWarning.value).toBe(true)
    expect(fixtures.patchRally).toHaveBeenCalled()
  })

  it('落下点入力: 座標保存 + 決定打ステップへ。out×コート内は警告 (EDGE-002)', async () => {
    const qp = useQuickPass(fixtures.deps)
    qp.start()
    fixtures.deps.rallies.value[0]!.pointWinner = 'B' // out → 導出勝者 B と整合させる
    await qp.selectEndReason('out')
    await qp.setLanding({ x: 0.4, y: 0.5 }) // コート内 = 矛盾
    expect(qp.landingWarning.value).toBe(true)
    expect(fixtures.patchRally).toHaveBeenLastCalledWith('r1', {
      landX: 0.4,
      landY: 0.5,
      outDirection: null
    })
    // out (敗者側が最終接触) → 決定打 = 最後から2番目が存在するので decisive へ
    expect(qp.step.value).toBe('decisive')
    expect(qp.decisiveShot.value?.id).toBe('sh2')
  })

  it('落下点スキップ: out のときだけ out_direction サブ選択 (REQ-005 フォールバック)', async () => {
    fixtures.deps.rallies.value[0]!.pointWinner = 'B'
    const qp = useQuickPass(fixtures.deps)
    qp.start()
    await qp.selectEndReason('out')
    qp.skipLanding()
    expect(qp.step.value).toBe('outDirection')
    await qp.selectOutDirection('back')
    expect(fixtures.patchRally).toHaveBeenLastCalledWith('r1', { outDirection: 'back' })
    expect(qp.step.value).toBe('decisive')
  })

  it('決定打種別の書込 → 次ラリーへ前進 (REQ-006)', async () => {
    const qp = useQuickPass(fixtures.deps)
    qp.start()
    await qp.selectEndReason('in')
    await qp.setLanding({ x: 0.3, y: 0.9 })
    // in → 決定打 = 最終ショット sh3
    expect(qp.decisiveShot.value?.id).toBe('sh3')
    await qp.setDecisiveType('smash')
    expect(fixtures.patchShot).toHaveBeenCalledWith('sh3', { shotType: 'smash' })
    expect(qp.currentRally.value?.id).toBe('r2')
    expect(qp.step.value).toBe('reason')
  })

  it('TC-006-B01: 1打ネット (サーブミス) は決定打なしで自動前進', async () => {
    const qp = useQuickPass(fixtures.deps)
    qp.start()
    await qp.selectEndReason('in')
    await qp.setLanding({ x: 0.5, y: 0.5 })
    await qp.setDecisiveType('smash') // r1 完了 → r2 へ
    // r2 (1打・point_winner B = サーブ側 A の失点で整合)
    await qp.selectEndReason('net')
    expect(qp.consistencyWarning.value).toBe(false)
    // 決定打なし → decisive を挟まず完了 (最終ラリーなので isDone)
    expect(qp.isDone.value).toBe(true)
  })
})
