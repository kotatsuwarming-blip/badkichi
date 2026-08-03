/**
 * useTypePass 単体テスト (TASK-0008、2026-08-03 ステップ&ループ方式へ再設計)
 *
 * 検証: 開始/再開位置 / 種別入力 + 打者プレフィル (1-2打目) と前進 /
 *       3打目以降の打者二択 → 前進 / hand トグル (TC-104-01/02) /
 *       レシーブハイライト (REQ-103) / 1打目のサーブ三択制限 (REQ-109) /
 *       アンカーのフォールバックとループ窓 (ローカル動画でもループ)
 */
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useTypePass } from '~/composables/useTypePass'
import type { TypePassDeps } from '~/composables/useTypePass'
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
    videoStartTimestampMs: 900,
    endReason: null,
    landX: null,
    landY: null,
    outDirection: null
  }
}

function shot(id: string, rallyId: string, shotNumber: number): AnnotationShot {
  return {
    id,
    rallyId,
    shotNumber,
    videoTimestampMs: shotNumber * 1000,
    annotatedTimestampMs: null,
    annotatedTimestampPrecision: null,
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

function makeDeps(shotsMap: Record<string, AnnotationShot[]>, rallies?: AnnotationRally[]) {
  const cursor = ref<AnnotationCursor | null>(null)
  const patchShot = vi.fn(async (shotId: string, patch: ShotAnnotationPatch) => {
    const target = Object.values(shotsMap).flat().find(s => s.id === shotId)
    if (!target) return false
    if (patch.shotType !== undefined) target.shotType = patch.shotType
    if (patch.hand !== undefined) target.hand = patch.hand
    if (patch.hitPlayerId !== undefined) target.hitPlayerId = patch.hitPlayerId
    return true
  })
  const deps: TypePassDeps = {
    rallies: ref(rallies ?? [rally('r1', 1)]),
    roster: ref(ROSTER),
    cursor,
    shotsOf: (rallyId: string) => shotsMap[rallyId] ?? [],
    goTo: (c: AnnotationCursor) => {
      cursor.value = c
    },
    patchShot
  }
  return { deps, cursor, patchShot }
}

function fourShots(): Record<string, AnnotationShot[]> {
  return {
    r1: [shot('sh1', 'r1', 1), shot('sh2', 'r1', 2), shot('sh3', 'r1', 3), shot('sh4', 'r1', 4)]
  }
}

describe('useTypePass (ステップ&ループ方式、2026-08-03)', () => {
  it('start: 最初の未入力ショットから再開 (REQ-013)', () => {
    const shotsMap = fourShots()
    shotsMap.r1![0]!.shotType = 'serve_short'
    const { deps } = makeDeps(shotsMap)
    const tp = useTypePass(deps)
    tp.start()
    expect(tp.currentShot.value?.id).toBe('sh2')
  })

  it('1打目: サーブ種別 + サーバーをプレフィルして前進 (REQ-109/012)', async () => {
    const shotsMap = fourShots()
    const { deps } = makeDeps(shotsMap)
    const tp = useTypePass(deps)
    tp.start()
    await tp.inputType('s')
    expect(shotsMap.r1![0]!.shotType).toBe('serve_short')
    expect(shotsMap.r1![0]!.hitPlayerId).toBe('A1')
    expect(tp.currentShot.value?.id).toBe('sh2') // 前進
    // 2打目: レシーバープレフィル
    await tp.inputType('2')
    expect(shotsMap.r1![1]!.hitPlayerId).toBe('B1')
    expect(tp.currentShot.value?.id).toBe('sh3')
  })

  it('1打目にサーブ以外のキーは無効 / 2打目以降にサーブキーは無効 (REQ-109)', async () => {
    const shotsMap = fourShots()
    const { deps, patchShot } = makeDeps(shotsMap)
    const tp = useTypePass(deps)
    tp.start()
    await tp.inputType('2') // 1打目に smash は無効
    expect(patchShot).not.toHaveBeenCalled()
    await tp.inputType('l')
    await tp.inputType('l') // 2打目に serve_long は無効
    expect(shotsMap.r1![1]!.shotType).toBeNull()
    expect(tp.currentShot.value?.id).toBe('sh2')
  })

  it('3打目以降: 種別入力後に打者二択 → selectHitter で前進 (キーボード専用パス)', async () => {
    const shotsMap = fourShots()
    const { deps } = makeDeps(shotsMap)
    const tp = useTypePass(deps)
    tp.goToShot('sh3')
    await tp.inputType('2')
    expect(shotsMap.r1![2]!.shotType).toBe('smash')
    expect(tp.awaitingHitter.value).toBe(true)
    // 奇数打 = サーブ側 A の二人
    expect(tp.hitterCandidates.value.map(p => p.playerId)).toEqual(['A1', 'A2'])
    await tp.selectHitter('A2')
    expect(shotsMap.r1![2]!.hitPlayerId).toBe('A2')
    expect(tp.awaitingHitter.value).toBe(false)
    expect(tp.currentShot.value?.id).toBe('sh4')
  })

  it('TC-104-01: hand トグル ON (既定) → 無印 = forehand / Shift = backhand', async () => {
    const shotsMap = fourShots()
    const { deps } = makeDeps(shotsMap)
    const tp = useTypePass(deps)
    tp.start()
    await tp.inputType('s')
    expect(shotsMap.r1![0]!.hand).toBe('forehand')
    await tp.inputType('q', { backhand: true })
    expect(shotsMap.r1![1]!.hand).toBe('backhand')
  })

  it('TC-104-02: hand トグル OFF → hand は書かない (null = 未判定のまま)', async () => {
    const shotsMap = fourShots()
    const { deps, patchShot } = makeDeps(shotsMap)
    const tp = useTypePass(deps)
    tp.recordHand.value = false
    tp.start()
    await tp.inputType('s')
    expect(patchShot).toHaveBeenCalledWith('sh1', { shotType: 'serve_short', hitPlayerId: 'A1' })
    expect(shotsMap.r1![0]!.hand).toBeNull()
  })

  it('REQ-103: 直前ショットがスマッシュならレシーブハイライト', async () => {
    const shotsMap = fourShots()
    shotsMap.r1![1]!.shotType = 'smash'
    const { deps } = makeDeps(shotsMap)
    const tp = useTypePass(deps)
    tp.goToShot('sh3')
    expect(tp.receiveHighlight.value).toBe(true)
    tp.goToShot('sh2')
    expect(tp.receiveHighlight.value).toBe(false)
  })

  it('アンカー: 注釈済み打刻 → 押下 → 近傍 → ラリー開始の順。ループ窓は常時', () => {
    const shotsMap = fourShots()
    shotsMap.r1![0]!.videoTimestampMs = null // 先頭挿入相当
    const { deps } = makeDeps(shotsMap)
    const tp = useTypePass(deps)
    tp.start()
    expect(tp.anchorMs.value).toBe(2000) // 後続 sh2 の押下時刻へ倒す
    expect(tp.loopWindow.value).toEqual({ fromMs: 800, toMs: 3200 })
  })

  it('最終ショットの後は isDone。skipShot は入力なしで前進', () => {
    const shotsMap = { r1: [shot('sh1', 'r1', 1), shot('sh2', 'r1', 2)] }
    const { deps } = makeDeps(shotsMap)
    const tp = useTypePass(deps)
    tp.start()
    tp.skipShot()
    expect(tp.currentShot.value?.id).toBe('sh2')
    tp.skipShot()
    expect(tp.isDone.value).toBe(true)
  })

  it('goToRally: ラリー先頭ショットへ移動 (複数ラリー跨ぎ)', () => {
    const shotsMap = {
      r1: [shot('sh1', 'r1', 1)],
      r2: [shot('sh5', 'r2', 1), shot('sh6', 'r2', 2)]
    }
    const { deps, cursor } = makeDeps(shotsMap, [rally('r1', 1), rally('r2', 2)])
    const tp = useTypePass(deps)
    tp.start()
    tp.goToRally('r2')
    expect(tp.currentShot.value?.id).toBe('sh5')
    expect(cursor.value?.rallyId).toBe('r2')
  })
})
