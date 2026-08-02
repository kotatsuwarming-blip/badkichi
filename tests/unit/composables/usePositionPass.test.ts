/**
 * usePositionPass 単体テスト (TASK-0009 / TASK-0010)
 *
 * 検証: 巡回/再開 / 校正 (3サンプル→平均オフセット、TC-010-01) / annotated 保存と押下時刻不変
 *       (TC-010-02) / clamp (EDGE-004) / サムネ帯時刻 (REQ-011) / 打者プレフィル (TC-012 系) /
 *       YouTube 分岐: annotated 非保存 (TC-101-03)・前長めループ窓 (TC-101-04)・サムネ帯なし。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { usePositionPass } from '~/composables/usePositionPass'
import type { PositionPassDeps } from '~/composables/usePositionPass'
import type {
  AnnotationCursor,
  AnnotationRally,
  AnnotationRosterEntry,
  AnnotationShot,
  ShotAnnotationPatch
} from '~/types/shot-annotation'

function rally(id: string, rallyNumber: number): AnnotationRally {
  return {
    id,
    setId: 's1',
    setNumber: 1,
    rallyNumber,
    servingTeam: 'A',
    serverPlayerId: 'A1',
    receiverPlayerId: 'B1',
    pointWinner: 'A',
    isPointConfirmed: true,
    videoStartTimestampMs: 0,
    endReason: null,
    landX: null,
    landY: null,
    outDirection: null
  }
}

function shot(id: string, rallyId: string, shotNumber: number, ts: number): AnnotationShot {
  return {
    id,
    rallyId,
    shotNumber,
    videoTimestampMs: ts,
    annotatedTimestampMs: null,
    shotType: null,
    hand: null,
    hitPlayerId: null,
    hitX: null,
    hitY: null
  }
}

const ROSTER: AnnotationRosterEntry[] = [
  { playerId: 'A1', name: '田中', team: 'A' },
  { playerId: 'A2', name: '鈴木', team: 'A' },
  { playerId: 'B1', name: '佐藤', team: 'B' },
  { playerId: 'B2', name: '高橋', team: 'B' }
]

function makeDeps(shotsMap: Record<string, AnnotationShot[]>, youtube = false) {
  const cursor = ref<AnnotationCursor | null>(null)
  const patchShot = vi.fn(async (shotId: string, patch: ShotAnnotationPatch) => {
    const target = Object.values(shotsMap).flat().find(s => s.id === shotId)
    if (!target) return false
    if (patch.hitX !== undefined) target.hitX = patch.hitX
    if (patch.hitY !== undefined) target.hitY = patch.hitY
    if (patch.hitPlayerId !== undefined) target.hitPlayerId = patch.hitPlayerId
    if (patch.annotatedTimestampMs !== undefined) target.annotatedTimestampMs = patch.annotatedTimestampMs
    if (patch.shotType !== undefined) target.shotType = patch.shotType
    return true
  })
  const deps: PositionPassDeps = {
    rallies: ref([rally('r1', 1)]),
    roster: ref(ROSTER),
    cursor,
    isYoutube: computed(() => youtube),
    shotsOf: (rallyId: string) => shotsMap[rallyId] ?? [],
    goTo: (c: AnnotationCursor) => {
      cursor.value = c
    },
    patchShot
  }
  return { deps, cursor, patchShot }
}

describe('usePositionPass (ローカル動画)', () => {
  let shotsMap: Record<string, AnnotationShot[]>
  let fixtures: ReturnType<typeof makeDeps>

  beforeEach(() => {
    shotsMap = {
      r1: [
        shot('sh1', 'r1', 1, 5000),
        shot('sh2', 'r1', 2, 6000),
        shot('sh3', 'r1', 3, 7000),
        shot('sh4', 'r1', 4, 8000)
      ]
    }
    fixtures = makeDeps(shotsMap)
  })

  it('TC-010-01/02: 校正3件の平均がオフセットになり、annotated 保存・押下時刻は不変', async () => {
    const pp = usePositionPass(fixtures.deps)
    pp.start()
    expect(pp.isCalibrating.value).toBe(true)

    await pp.confirmFrame(5000 - 380) // sh1: -380ms
    await pp.setPosition({ x: 0.3, y: 0.1 })
    await pp.confirmFrame(6000 - 420) // sh2: -420ms
    await pp.setPosition({ x: 0.5, y: 0.9 })
    await pp.confirmFrame(7000 - 400) // sh3: -400ms
    expect(pp.offsetMs.value).toBe(-400)
    expect(pp.isCalibrating.value).toBe(false)

    // annotated は保存され、押下時刻 (videoTimestampMs) は不変
    expect(shotsMap.r1![0]!.annotatedTimestampMs).toBe(4620)
    expect(shotsMap.r1![0]!.videoTimestampMs).toBe(5000)
  })

  it('校正後のアンカー = 押下時刻 + オフセット。サムネ帯は ±0.5s の5枚 (REQ-011)', async () => {
    const pp = usePositionPass(fixtures.deps)
    pp.start()
    await pp.confirmFrame(4600)
    await pp.setPosition({ x: 0.1, y: 0.1 })
    await pp.confirmFrame(5600)
    await pp.setPosition({ x: 0.1, y: 0.1 })
    await pp.confirmFrame(6600) // 3件 → offset = -400
    await pp.setPosition({ x: 0.1, y: 0.1 })
    await pp.selectHitter('A1') // 3打目は二択確定で前進
    // sh4 (ts=8000): anchor = 7600
    expect(pp.anchorMs.value).toBe(7600)
    expect(pp.stripTimesMs.value).toEqual([7200, 7400, 7600, 7800, 8000])
  })

  it('EDGE-004: 補正で負になるアンカーは 0 に clamp', () => {
    shotsMap.r1 = [shot('sh1', 'r1', 1, 200)]
    const pp = usePositionPass(fixtures.deps)
    pp.offsetMs.value = -500
    // 校正サンプルを埋めて校正済み状態に
    pp.start()
    expect(pp.anchorMs.value).toBe(0)
    expect(pp.stripTimesMs.value?.[0]).toBe(0)
  })

  it('TC-012-01/02: 1打目=サーバー・2打目=レシーバーを自動確定して前進', async () => {
    const pp = usePositionPass(fixtures.deps)
    pp.start()
    await pp.setPosition({ x: 0.3, y: 0.1 })
    expect(shotsMap.r1![0]!.hitPlayerId).toBe('A1')
    expect(pp.awaitingHitter.value).toBe(false)
    await pp.setPosition({ x: 0.7, y: 0.9 })
    expect(shotsMap.r1![1]!.hitPlayerId).toBe('B1')
  })

  it('TC-012-03/04: 3打目以降は該当チームの二択 → selectHitter で確定', async () => {
    const pp = usePositionPass(fixtures.deps)
    pp.start()
    await pp.setPosition({ x: 0.1, y: 0.1 }) // sh1
    await pp.setPosition({ x: 0.1, y: 0.9 }) // sh2
    // sh3 (奇数打 = サーブ側 A)
    await pp.setPosition({ x: 0.2, y: 0.2 })
    expect(pp.awaitingHitter.value).toBe(true)
    expect(pp.hitterCandidates.value.map(p => p.playerId)).toEqual(['A1', 'A2'])
    await pp.selectHitter('A2')
    expect(shotsMap.r1![2]!.hitPlayerId).toBe('A2')
    // sh4 (偶数打 = レシーブ側 B)
    expect(pp.hitterCandidates.value.map(p => p.playerId)).toEqual(['B1', 'B2'])
  })

  it('setType: 現在ショットの種別を書き込む (前進はしない。2026-08-02 同時入力)', async () => {
    const pp = usePositionPass(fixtures.deps)
    pp.start()
    await pp.setType('s') // 1打目はサーブ三択 (REQ-109 と同じ制限)
    expect(shotsMap.r1![0]!.shotType).toBe('serve_short')
    expect(pp.currentShot.value?.id).toBe('sh1') // 前進しない
    await pp.setPosition({ x: 0.1, y: 0.1 }) // 前進はタップ側
    await pp.setType('2')
    expect(shotsMap.r1![1]!.shotType).toBe('smash')
  })

  it('再開 (REQ-013): hit_x が入っていない最初のショットから', () => {
    shotsMap.r1![0]!.hitX = 0.5
    shotsMap.r1![1]!.hitX = 0.5
    const pp = usePositionPass(fixtures.deps)
    pp.start()
    expect(pp.currentShot.value?.id).toBe('sh3')
  })

  it('最終ショットの後は isDone', async () => {
    shotsMap.r1 = [shot('sh1', 'r1', 1, 5000)]
    const pp = usePositionPass(fixtures.deps)
    pp.start()
    await pp.setPosition({ x: 0.1, y: 0.1 })
    expect(pp.isDone.value).toBe(true)
  })
})

describe('usePositionPass (YouTube モード、TASK-0010)', () => {
  it('TC-101-03/04: annotated 非保存・前長めループ窓・サムネ帯なし', async () => {
    const shotsMap = { r1: [shot('sh1', 'r1', 1, 5000)] }
    const { deps, patchShot } = makeDeps(shotsMap, true)
    const pp = usePositionPass(deps)
    pp.start()

    // 校正なし・サムネ帯なし・ループ窓は前1.2s/後0.3s (向きが逆)
    expect(pp.isCalibrating.value).toBe(false)
    expect(pp.stripTimesMs.value).toBeNull()
    expect(pp.loopWindow.value).toEqual({ fromMs: 3800, toMs: 5300 })

    // フレーム確定は no-op (精度不明の時刻を教師データに混ぜない)
    await pp.confirmFrame(4600)
    expect(patchShot).not.toHaveBeenCalled()
    expect(shotsMap.r1![0]!.annotatedTimestampMs).toBeNull()

    // 打点座標は保存される (hit_x/y はソース非依存)
    await pp.setPosition({ x: 0.4, y: 0.2 })
    expect(shotsMap.r1![0]!.hitX).toBe(0.4)
  })
})
