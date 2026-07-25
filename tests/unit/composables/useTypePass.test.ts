/**
 * useTypePass 単体テスト (TASK-0008)
 *
 * mock 戦略: TypePassDeps を素の ref + 疑似 patch (local 反映) で構成。
 * 検証: 開始/再開位置 / 順番マッチングでの型書込 / hand トグル (TC-104-01/02) /
 *       1打目のサーブ制限 (REQ-109) / 超過警告 (EDGE-003) / やり直し (TC-007-03) /
 *       レシーブハイライト (REQ-103) / ラリー完了と前進。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useTypePass } from '~/composables/useTypePass'
import type { TypePassDeps } from '~/composables/useTypePass'
import type {
  AnnotationCursor,
  AnnotationRally,
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

function shot(id: string, rallyId: string, shotNumber: number): AnnotationShot {
  return {
    id,
    rallyId,
    shotNumber,
    videoTimestampMs: shotNumber * 1000,
    annotatedTimestampMs: null,
    shotType: null,
    hand: null,
    hitPlayerId: null,
    hitX: null,
    hitY: null
  }
}

function makeDeps(shotsMap: Record<string, AnnotationShot[]>, rallies: AnnotationRally[]) {
  const cursor = ref<AnnotationCursor | null>(null)
  const patchShot = vi.fn(async (shotId: string, patch: ShotAnnotationPatch) => {
    const target = Object.values(shotsMap).flat().find(s => s.id === shotId)
    if (!target) return false
    if (patch.shotType !== undefined) target.shotType = patch.shotType
    if (patch.hand !== undefined) target.hand = patch.hand
    return true
  })
  const deps: TypePassDeps = {
    rallies: ref(rallies),
    cursor,
    shotsOf: (rallyId: string) => shotsMap[rallyId] ?? [],
    goTo: (c: AnnotationCursor) => {
      cursor.value = c
    },
    patchShot
  }
  return { deps, cursor, patchShot }
}

describe('useTypePass', () => {
  let shotsMap: Record<string, AnnotationShot[]>
  let fixtures: ReturnType<typeof makeDeps>

  beforeEach(() => {
    shotsMap = {
      r1: [shot('sh1', 'r1', 1), shot('sh2', 'r1', 2), shot('sh3', 'r1', 3)],
      r2: [shot('sh4', 'r2', 1)]
    }
    fixtures = makeDeps(shotsMap, [rally('r1', 1), rally('r2', 2)])
  })

  it('順番マッチング: k 回目の入力が k 番目のショットへ (REQ-007)。1打目はサーブ三択 (REQ-109)', async () => {
    const tp = useTypePass(fixtures.deps)
    tp.start()
    // 1打目: 非サーブキーは無視される
    await tp.handleKey('2')
    expect(fixtures.patchShot).not.toHaveBeenCalled()
    expect(tp.expectedShot.value?.id).toBe('sh1')
    // サーブキーで前進
    await tp.handleKey('s')
    expect(shotsMap.r1![0]!.shotType).toBe('serve_short')
    // 2打目以降は通常キー
    await tp.handleKey('q')
    await tp.handleKey('2')
    expect(shotsMap.r1![1]!.shotType).toBe('receive_long')
    expect(shotsMap.r1![2]!.shotType).toBe('smash')
    expect(tp.rallyComplete.value).toBe(true)
  })

  it('TC-104-01: hand トグル ON → 無印 = forehand を明示保存 / Shift = backhand', async () => {
    const tp = useTypePass(fixtures.deps)
    tp.start()
    tp.recordHand.value = true
    await tp.handleKey('s')
    expect(shotsMap.r1![0]!.hand).toBe('forehand')
    await tp.handleKey('q', { backhand: true })
    expect(shotsMap.r1![1]!.hand).toBe('backhand')
  })

  it('TC-104-02: hand トグル OFF → hand は書かない (null = 未判定のまま)', async () => {
    const tp = useTypePass(fixtures.deps)
    tp.start()
    await tp.handleKey('s')
    expect(fixtures.patchShot).toHaveBeenCalledWith('sh1', { shotType: 'serve_short' })
    expect(shotsMap.r1![0]!.hand).toBeNull()
  })

  it('EDGE-003: ショット数を超えた入力は無視 + 警告', async () => {
    const tp = useTypePass(fixtures.deps)
    tp.start()
    await tp.handleKey('s')
    await tp.handleKey('q')
    await tp.handleKey('2')
    await tp.handleKey('1') // 4件目 = 超過
    expect(tp.overflowWarning.value).toBe(true)
    expect(fixtures.patchShot).toHaveBeenCalledTimes(3)
  })

  it('TC-007-03: redoRally で当該ラリーの shot_type / hand がクリアされ再入力可能', async () => {
    const tp = useTypePass(fixtures.deps)
    tp.start()
    tp.recordHand.value = true
    await tp.handleKey('s')
    await tp.handleKey('q')
    await tp.redoRally()
    expect(shotsMap.r1!.every(s => s.shotType === null && s.hand === null)).toBe(true)
    expect(tp.expectedShot.value?.id).toBe('sh1')
    expect(tp.overflowWarning.value).toBe(false)
  })

  it('REQ-103: 直前ショットがスマッシュ → レシーブハイライト (キー割当は不変)', async () => {
    const tp = useTypePass(fixtures.deps)
    tp.start()
    await tp.handleKey('s')
    await tp.handleKey('0') // 2打目 = lob
    expect(tp.receiveHighlight.value).toBe(false)
    // やり直して 2打目をドライブに → 3打目待ちでハイライト
    await tp.redoRally()
    await tp.handleKey('s')
    await tp.handleKey('6') // drive
    expect(tp.receiveHighlight.value).toBe(true)
  })

  it('再開 (REQ-013): 途中まで入力済みのラリーは最初の未入力ショットから', () => {
    shotsMap.r1![0]!.shotType = 'serve_long'
    const tp = useTypePass(fixtures.deps)
    tp.start()
    expect(tp.currentRally.value?.id).toBe('r1')
    expect(tp.expectedShot.value?.id).toBe('sh2')
    expect(fixtures.cursor.value?.shotId).toBe('sh2')
  })

  it('advanceRally: 次ラリーへ、最終ラリー後は isDone', async () => {
    const tp = useTypePass(fixtures.deps)
    tp.start()
    await tp.handleKey('s')
    await tp.handleKey('q')
    await tp.handleKey('2')
    tp.advanceRally()
    expect(tp.currentRally.value?.id).toBe('r2')
    await tp.handleKey('l')
    expect(shotsMap.r2![0]!.shotType).toBe('serve_long')
    tp.advanceRally()
    expect(tp.isDone.value).toBe(true)
  })
})
