/**
 * useAnnotationProgress 単体テスト (TASK-0006 / TC-013 系)
 * null 有無からのモード別進捗導出・次の未注釈位置・データ変更での再導出
 */
import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useAnnotationProgress } from '~/composables/useAnnotationProgress'
import type { AnnotationRally, AnnotationShot } from '~/types/shot-annotation'

function rally(id: string, setId: string, setNumber: number, endReason: AnnotationRally['endReason'] = null): AnnotationRally {
  return {
    id,
    setId,
    setNumber,
    rallyNumber: 1,
    servingTeam: 'A',
    serverPlayerId: 'A1',
    receiverPlayerId: 'B1',
    pointWinner: 'A',
    isPointConfirmed: true,
    videoStartTimestampMs: null,
    endReason,
    landX: null,
    landY: null,
    outDirection: null
  }
}

function shot(id: string, rallyId: string, shotNumber: number, typed: boolean): AnnotationShot {
  return {
    id,
    rallyId,
    shotNumber,
    videoTimestampMs: null,
    annotatedTimestampMs: null,
    shotType: typed ? 'clear' : null,
    hand: null,
    hitPlayerId: null,
    hitX: null,
    hitY: null
  }
}

describe('useAnnotationProgress', () => {
  it('TC-013-01: 10ショット中6件入力済み → 種別 60%・次の未注釈はショット7', () => {
    const rallies = ref([rally('r1', 's1', 1), rally('r2', 's2', 2)])
    const shots = new Map<string, AnnotationShot[]>()
    shots.set('r1', [1, 2, 3, 4, 5, 6].map(n => shot(`s${n}`, 'r1', n, true)))
    shots.set('r2', [7, 8, 9, 10].map(n => shot(`s${n}`, 'r2', n - 6, false)))
    const shotsByRally = ref(shots)

    const { progress } = useAnnotationProgress({ rallies, shotsByRally })
    const type = progress.value.find(p => p.mode === 'type')
    expect(type).toMatchObject({ done: 6, total: 10 })
    // TC-013-02: セット1完了済み → セット2の先頭が再開位置
    expect(type?.nextCursor).toEqual({ setId: 's2', rallyId: 'r2', shotId: 's7' })
  })

  it('quick: end_reason の有無で進捗・次ラリーを導出 (shotId は null)', () => {
    const rallies = ref([rally('r1', 's1', 1, 'in'), rally('r2', 's1', 1)])
    const shotsByRally = ref(new Map<string, AnnotationShot[]>())

    const { progress } = useAnnotationProgress({ rallies, shotsByRally })
    const quick = progress.value.find(p => p.mode === 'quick')
    expect(quick).toMatchObject({ done: 1, total: 2 })
    expect(quick?.nextCursor).toEqual({ setId: 's1', rallyId: 'r2', shotId: null })
  })

  it('全注釈済みなら nextCursor は null', () => {
    const rallies = ref([rally('r1', 's1', 1, 'in')])
    const shotsByRally = ref(new Map([['r1', [shot('s1', 'r1', 1, true)]]]))
    const { progress } = useAnnotationProgress({ rallies, shotsByRally })
    expect(progress.value.find(p => p.mode === 'quick')?.nextCursor).toBeNull()
    expect(progress.value.find(p => p.mode === 'type')?.nextCursor).toBeNull()
  })

  it('TC-013-03: 進捗はデータから毎回導出される (専用テーブルなし = 変更に追従)', () => {
    const target = shot('s1', 'r1', 1, false)
    const rallies = ref([rally('r1', 's1', 1)])
    const shotsByRally = ref(new Map([['r1', [target]]]))
    const { progress } = useAnnotationProgress({ rallies, shotsByRally })

    expect(progress.value.find(p => p.mode === 'position')?.done).toBe(0)
    target.hitX = 0.5
    // Map の中身変更を computed へ伝えるため参照を張り替え (session の実装と同じ更新粒度)
    shotsByRally.value = new Map(shotsByRally.value)
    expect(progress.value.find(p => p.mode === 'position')?.done).toBe(1)
  })
})
