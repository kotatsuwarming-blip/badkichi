/**
 * 【機能概要】: 注釈列の楽観 UPDATE を直列キューで送出する Write composable。
 * 【実装方針】: 列単位の部分 UPDATE。UI は呼び出し側 (session) が即時反映済み (楽観) のため、
 *             ここは直列化 (last-write-wins の順序保証)・camel→snake 写像・エラー保持に徹する
 *             (design-interview D3)。shots への human 注釈書込では annotation_source='human' を
 *             併記する (REQ-301)。失敗してもキューは止めない (EDGE-007、通知は呼び出し側)。
 * TASK-0005 / REQ-002 / EDGE-001 / EDGE-007
 */
import { ref } from 'vue'
import type { Ref } from 'vue'
import type { Database } from '~/types/supabase'
import type { ActionResult } from '~/types/match-recording'
import type { RallyEndPatch, ShotAnnotationPatch } from '~/types/shot-annotation'

type ShotUpdate = Database['public']['Tables']['shots']['Update']
type RallyUpdate = Database['public']['Tables']['rallies']['Update']

export interface UseAnnotationSaveReturn {
  saveShotPatch: (shotId: string, patch: ShotAnnotationPatch) => Promise<ActionResult<true>>
  saveRallyPatch: (rallyId: string, patch: RallyEndPatch) => Promise<ActionResult<true>>
  /** ショット行の構造操作 (押し損ね/押しすぎの補正、ドッグフーディング 2026-07-29) */
  updateShotNumber: (shotId: string, shotNumber: number) => Promise<ActionResult<true>>
  insertShotRow: (rallyId: string, shotNumber: number, videoTimestampMs: number | null) => Promise<ActionResult<string>>
  deleteShotRow: (shotId: string) => Promise<ActionResult<true>>
  pending: Ref<boolean>
  lastError: Ref<unknown>
}

export function useAnnotationSave(): UseAnnotationSaveReturn {
  const client = useSupabaseClient<Database>()
  const pending = ref(false)
  const lastError = ref<unknown>(null)
  let queue: Promise<unknown> = Promise.resolve()
  let inFlight = 0

  function toShotRow(patch: ShotAnnotationPatch): ShotUpdate {
    const row: ShotUpdate = {}
    if (patch.shotType !== undefined) row.shot_type = patch.shotType
    if (patch.hand !== undefined) row.hand = patch.hand
    if (patch.hitPlayerId !== undefined) row.hit_player_id = patch.hitPlayerId
    if (patch.hitX !== undefined) row.hit_x = patch.hitX
    if (patch.hitY !== undefined) row.hit_y = patch.hitY
    if (patch.annotatedTimestampMs !== undefined) row.annotated_timestamp_ms = patch.annotatedTimestampMs
    // 人手注釈の書込であることを併記 (REQ-301。AI 下書き導入時は 'ai' 側が書く)
    if (Object.keys(row).length > 0) row.annotation_source = 'human'
    return row
  }

  function toRallyRow(patch: RallyEndPatch): RallyUpdate {
    const row: RallyUpdate = {}
    if (patch.endReason !== undefined) row.end_reason = patch.endReason
    if (patch.landX !== undefined) row.land_x = patch.landX
    if (patch.landY !== undefined) row.land_y = patch.landY
    if (patch.outDirection !== undefined) row.out_direction = patch.outDirection
    return row
  }

  function enqueue<T>(run: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
    inFlight += 1
    pending.value = true
    const result = queue.then(run)
    // 失敗してもキューは継続 (EDGE-007)
    queue = result.catch(() => undefined)
    return result.finally(() => {
      inFlight -= 1
      if (inFlight === 0) pending.value = false
    })
  }

  function toResult(error: unknown): ActionResult<true> {
    if (error) {
      lastError.value = error
      return { data: null, error }
    }
    return { data: true, error: null }
  }

  async function updateShot(id: string, row: ShotUpdate): Promise<ActionResult<true>> {
    if (Object.keys(row).length === 0) return { data: true, error: null }
    const { error } = await client.from('shots').update(row).eq('id', id)
    return toResult(error)
  }

  async function updateRally(id: string, row: RallyUpdate): Promise<ActionResult<true>> {
    if (Object.keys(row).length === 0) return { data: true, error: null }
    const { error } = await client.from('rallies').update(row).eq('id', id)
    return toResult(error)
  }

  async function insertShot(
    rallyId: string,
    shotNumber: number,
    videoTimestampMs: number | null
  ): Promise<ActionResult<string>> {
    const { data, error } = await client
      .from('shots')
      .insert({ rally_id: rallyId, shot_number: shotNumber, video_timestamp_ms: videoTimestampMs })
      .select('id')
      .single()
    if (error) {
      lastError.value = error
      return { data: null, error }
    }
    return { data: data.id, error: null }
  }

  /**
   * ショット削除は論理削除 (2026-08-03)。誤削除でライブ記録の押下時刻
   * (video_timestamp_ms) を失わないため。復元は SQL で deleted_at を NULL に戻す。
   * record 画面の直後 undo (useDeleteShot) は従来通り物理削除。
   */
  async function deleteShot(shotId: string): Promise<ActionResult<true>> {
    const { error } = await client
      .from('shots')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', shotId)
    return toResult(error)
  }

  return {
    saveShotPatch: (shotId, patch) => enqueue(() => updateShot(shotId, toShotRow(patch))),
    saveRallyPatch: (rallyId, patch) => enqueue(() => updateRally(rallyId, toRallyRow(patch))),
    updateShotNumber: (shotId, shotNumber) => enqueue(() => updateShot(shotId, { shot_number: shotNumber })),
    insertShotRow: (rallyId, shotNumber, videoTimestampMs) => enqueue(() => insertShot(rallyId, shotNumber, videoTimestampMs)),
    deleteShotRow: shotId => enqueue(() => deleteShot(shotId)),
    pending,
    lastError
  }
}
