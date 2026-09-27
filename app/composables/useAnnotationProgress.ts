/**
 * 【機能概要】: 注釈列の null 有無からモード別進捗 (完了率・次の未注釈位置) を導出する。
 * 【実装方針】: 専用の進捗テーブルは持たず、session のフィルタ済み配列 (レット除外済み) から
 *             毎回導出する (REQ-013。リロード耐性・チーム分担対応)。
 *             quick = rallies.end_reason / type = shots.shot_type / position = shots.hit_x。
 * TASK-0006 / REQ-013 / TC-013 系
 */
import { computed } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type {
  AnnotationCursor,
  AnnotationProgress,
  AnnotationRally,
  AnnotationShot
} from '~/types/shot-annotation'

interface ProgressDeps {
  rallies: Ref<AnnotationRally[]>
  shotsByRally: Ref<Map<string, AnnotationShot[]>>
}

export interface UseAnnotationProgressReturn {
  progress: ComputedRef<AnnotationProgress[]>
}

export function useAnnotationProgress(deps: ProgressDeps): UseAnnotationProgressReturn {
  const progress = computed<AnnotationProgress[]>(() => {
    const rallies = deps.rallies.value
    const shotsOf = (rallyId: string): AnnotationShot[] =>
      deps.shotsByRally.value.get(rallyId) ?? []

    // quick: ラリー単位 (end_reason)
    let quickDone = 0
    let quickNext: AnnotationCursor | null = null
    for (const rally of rallies) {
      if (rally.endReason !== null) {
        quickDone += 1
      } else if (quickNext === null) {
        quickNext = { setId: rally.setId, rallyId: rally.id, shotId: null }
      }
    }

    // type / position: ショット単位 (shot_type / hit_x)
    let shotTotal = 0
    let typeDone = 0
    let positionDone = 0
    let typeNext: AnnotationCursor | null = null
    let positionNext: AnnotationCursor | null = null
    for (const rally of rallies) {
      for (const shot of shotsOf(rally.id)) {
        shotTotal += 1
        if (shot.shotType !== null) {
          typeDone += 1
        } else if (typeNext === null) {
          typeNext = { setId: rally.setId, rallyId: rally.id, shotId: shot.id }
        }
        if (shot.hitX !== null) {
          positionDone += 1
        } else if (positionNext === null) {
          positionNext = { setId: rally.setId, rallyId: rally.id, shotId: shot.id }
        }
      }
    }

    return [
      { mode: 'quick', done: quickDone, total: rallies.length, nextCursor: quickNext },
      { mode: 'type', done: typeDone, total: shotTotal, nextCursor: typeNext },
      { mode: 'position', done: positionDone, total: shotTotal, nextCursor: positionNext }
    ]
  })

  return { progress }
}
