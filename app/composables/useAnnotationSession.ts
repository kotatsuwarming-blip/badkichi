/**
 * 【機能概要】: アノテーションスタジオの集約オーケストレータ。対象試合の全データ読込・
 *             現在モード/カーソル・楽観パッチ (local 反映 + save 送出)・直前1段 undo を所有する。
 * 【実装方針】: レット除外 (REQ-106) は読込直後に一元適用し、巡回・進捗・一覧のすべてが
 *             同じフィルタ済み配列を参照する (design-interview D5)。ソートはクエリに依存せず
 *             クライアント側でも保証 (set_number, rally_number / shot_number)。
 *             訂正は「任意位置へ戻って上書き」が主手段で、undo は直前1段のみ (REQ-108)。
 * TASK-0004 / REQ-001 / REQ-003 / REQ-106 / REQ-108 / REQ-201
 */
import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import type { Database } from '~/types/supabase'
import type { Team } from '~/utils/rule-engine/types'
import type {
  AnnotationCursor,
  AnnotationMatchInfo,
  AnnotationMode,
  AnnotationRally,
  AnnotationRosterEntry,
  AnnotationShot,
  RallyEndPatch,
  ShotAnnotationPatch,
  UndoEntry
} from '~/types/shot-annotation'
import { useAnnotationSave } from '~/composables/useAnnotationSave'

export function useAnnotationSession(matchId: string) {
  const client = useSupabaseClient<Database>()
  const save = useAnnotationSave()

  const pending = ref(false)
  const loadError = ref<unknown>(null)
  const match = ref<AnnotationMatchInfo | null>(null)
  const roster = ref<AnnotationRosterEntry[]>([])
  /** レット除外済み・(set_number, rally_number) 順 (D5) */
  const rallies: Ref<AnnotationRally[]> = ref([])
  const shotsByRally: Ref<Map<string, AnnotationShot[]>> = ref(new Map())

  const mode = ref<AnnotationMode>('quick')
  const cursor = ref<AnnotationCursor | null>(null)
  const lastUndo = ref<UndoEntry | null>(null)

  const isYoutube = computed(() => match.value?.videoSourceType === 'youtube')
  const hasRallies = computed(() => rallies.value.length > 0)

  async function load(): Promise<void> {
    pending.value = true
    loadError.value = null
    try {
      const { data: matchRow, error: matchError } = await client
        .from('matches')
        .select('id, video_source_type, video_source_url, team_a_player1_id, team_a_player2_id, team_b_player1_id, team_b_player2_id')
        .eq('id', matchId)
        .is('deleted_at', null)
        .single()
      if (matchError) throw matchError

      match.value = {
        id: matchRow.id,
        videoSourceType: matchRow.video_source_type as AnnotationMatchInfo['videoSourceType'],
        videoSourceUrl: matchRow.video_source_url
      }

      const teamOf = new Map<string, Team>([
        [matchRow.team_a_player1_id, 'A'],
        [matchRow.team_a_player2_id, 'A'],
        [matchRow.team_b_player1_id, 'B'],
        [matchRow.team_b_player2_id, 'B']
      ])
      const { data: playerRows, error: playerError } = await client
        .from('players')
        .select('id, name')
        .in('id', [...teamOf.keys()])
      if (playerError) throw playerError
      roster.value = (playerRows ?? []).map(p => ({
        playerId: p.id,
        name: p.name,
        team: teamOf.get(p.id) as Team
      }))

      const { data: setRows, error: setError } = await client
        .from('sets')
        .select('id, set_number')
        .eq('match_id', matchId)
        .is('deleted_at', null)
        .order('set_number', { ascending: true })
      if (setError) throw setError
      const setNumberOf = new Map((setRows ?? []).map(s => [s.id, s.set_number]))
      const setIds = [...setNumberOf.keys()]

      const { data: rallyRows, error: rallyError } = setIds.length === 0
        ? { data: [], error: null }
        : await client
            .from('rallies')
            .select('id, set_id, rally_number, serving_team, server_player_id, receiver_player_id, point_winner, is_let, is_point_confirmed, video_start_timestamp_ms, end_reason, land_x, land_y, out_direction')
            .in('set_id', setIds)
            .is('deleted_at', null)
      if (rallyError) throw rallyError

      // D5: レット除外を読込直後に一元適用。以降の巡回・進捗はすべてこの配列基準 (REQ-106)
      rallies.value = (rallyRows ?? [])
        .filter(r => !r.is_let)
        .map((r): AnnotationRally => ({
          id: r.id,
          setId: r.set_id,
          setNumber: setNumberOf.get(r.set_id) ?? 0,
          rallyNumber: r.rally_number,
          servingTeam: r.serving_team as Team,
          serverPlayerId: r.server_player_id,
          receiverPlayerId: r.receiver_player_id,
          pointWinner: r.point_winner as Team | null,
          isPointConfirmed: r.is_point_confirmed,
          videoStartTimestampMs: r.video_start_timestamp_ms,
          endReason: r.end_reason as AnnotationRally['endReason'],
          landX: r.land_x,
          landY: r.land_y,
          outDirection: r.out_direction as AnnotationRally['outDirection']
        }))
        .sort((a, b) => a.setNumber - b.setNumber || a.rallyNumber - b.rallyNumber)

      const rallyIds = rallies.value.map(r => r.id)
      const { data: shotRows, error: shotError } = rallyIds.length === 0
        ? { data: [], error: null }
        : await client
            .from('shots')
            .select('id, rally_id, shot_number, video_timestamp_ms, annotated_timestamp_ms, shot_type, hand, hit_player_id, hit_x, hit_y')
            .in('rally_id', rallyIds)
            .is('deleted_at', null)
      if (shotError) throw shotError

      const map = new Map<string, AnnotationShot[]>()
      for (const s of shotRows ?? []) {
        const shot: AnnotationShot = {
          id: s.id,
          rallyId: s.rally_id,
          shotNumber: s.shot_number,
          videoTimestampMs: s.video_timestamp_ms,
          annotatedTimestampMs: s.annotated_timestamp_ms,
          shotType: s.shot_type as AnnotationShot['shotType'],
          hand: s.hand as AnnotationShot['hand'],
          hitPlayerId: s.hit_player_id,
          hitX: s.hit_x,
          hitY: s.hit_y
        }
        const list = map.get(shot.rallyId)
        if (list) {
          list.push(shot)
        } else {
          map.set(shot.rallyId, [shot])
        }
      }
      for (const list of map.values()) {
        list.sort((a, b) => a.shotNumber - b.shotNumber)
      }
      shotsByRally.value = map
    } catch (e) {
      loadError.value = e
    } finally {
      pending.value = false
    }
  }

  function shotsOf(rallyId: string): AnnotationShot[] {
    return shotsByRally.value.get(rallyId) ?? []
  }

  function findShot(shotId: string): AnnotationShot | null {
    for (const list of shotsByRally.value.values()) {
      const hit = list.find(s => s.id === shotId)
      if (hit) return hit
    }
    return null
  }

  function findRally(rallyId: string): AnnotationRally | null {
    return rallies.value.find(r => r.id === rallyId) ?? null
  }

  function goTo(next: AnnotationCursor): void {
    cursor.value = next
  }

  function setMode(next: AnnotationMode): void {
    mode.value = next
  }

  /** patch のキーに対応する旧値を拾う (undo 用。未設定は null で戻す) */
  function pickOldShot(shot: AnnotationShot, patch: ShotAnnotationPatch): ShotAnnotationPatch {
    const old: ShotAnnotationPatch = {}
    if (patch.shotType !== undefined) old.shotType = shot.shotType
    if (patch.hand !== undefined) old.hand = shot.hand
    if (patch.hitPlayerId !== undefined) old.hitPlayerId = shot.hitPlayerId
    if (patch.hitX !== undefined) old.hitX = shot.hitX
    if (patch.hitY !== undefined) old.hitY = shot.hitY
    if (patch.annotatedTimestampMs !== undefined) old.annotatedTimestampMs = shot.annotatedTimestampMs
    return old
  }

  function pickOldRally(rally: AnnotationRally, patch: RallyEndPatch): RallyEndPatch {
    const old: RallyEndPatch = {}
    if (patch.endReason !== undefined) old.endReason = rally.endReason
    if (patch.landX !== undefined) old.landX = rally.landX
    if (patch.landY !== undefined) old.landY = rally.landY
    if (patch.outDirection !== undefined) old.outDirection = rally.outDirection
    return old
  }

  function applyShotLocal(shot: AnnotationShot, patch: ShotAnnotationPatch): void {
    if (patch.shotType !== undefined) shot.shotType = patch.shotType
    if (patch.hand !== undefined) shot.hand = patch.hand
    if (patch.hitPlayerId !== undefined) shot.hitPlayerId = patch.hitPlayerId
    if (patch.hitX !== undefined) shot.hitX = patch.hitX
    if (patch.hitY !== undefined) shot.hitY = patch.hitY
    if (patch.annotatedTimestampMs !== undefined) shot.annotatedTimestampMs = patch.annotatedTimestampMs
  }

  function applyRallyLocal(rally: AnnotationRally, patch: RallyEndPatch): void {
    if (patch.endReason !== undefined) rally.endReason = patch.endReason
    if (patch.landX !== undefined) rally.landX = patch.landX
    if (patch.landY !== undefined) rally.landY = patch.landY
    if (patch.outDirection !== undefined) rally.outDirection = patch.outDirection
  }

  /**
   * ショット注釈の書込 (楽観: local 即反映 → save 直列送出)。
   * 成功可否に関わらず local は保持 (EDGE-007。エラー通知は save.lastError を UI が監視)。
   */
  async function patchShot(
    shotId: string,
    patch: ShotAnnotationPatch,
    opts: { recordUndo?: boolean } = {}
  ): Promise<boolean> {
    const shot = findShot(shotId)
    if (!shot) return false
    if (opts.recordUndo !== false && cursor.value) {
      lastUndo.value = {
        table: 'shots',
        rowId: shotId,
        patch: pickOldShot(shot, patch),
        cursor: cursor.value
      }
    }
    applyShotLocal(shot, patch)
    const res = await save.saveShotPatch(shotId, patch)
    return res.error === null
  }

  async function patchRally(
    rallyId: string,
    patch: RallyEndPatch,
    opts: { recordUndo?: boolean } = {}
  ): Promise<boolean> {
    const rally = findRally(rallyId)
    if (!rally) return false
    if (opts.recordUndo !== false && cursor.value) {
      lastUndo.value = {
        table: 'rallies',
        rowId: rallyId,
        patch: pickOldRally(rally, patch),
        cursor: cursor.value
      }
    }
    applyRallyLocal(rally, patch)
    const res = await save.saveRallyPatch(rallyId, patch)
    return res.error === null
  }

  /**
   * ショット挿入 (ライブ記録の押し損ね補正、ドッグフーディング 2026-07-29)。
   * position (0-based) の位置に挿入し、以降を後ろから +1 renumber (UNIQUE 回避、直列キュー)。
   * タイムスタンプは前後ショットの中点 (どちらか欠けたら null)。完了後に再読込で整合させる。
   * 構造操作は直前1段 undo の対象外 (削除で戻せる)。
   */
  async function insertShotAt(rallyId: string, position: number): Promise<boolean> {
    const shots = shotsOf(rallyId)
    if (position < 0 || position > shots.length) return false
    for (let i = shots.length - 1; i >= position; i--) {
      const target = shots[i]
      if (target) await save.updateShotNumber(target.id, target.shotNumber + 1)
    }
    const prev = shots[position - 1]
    const next = shots[position]
    const timestamp = prev?.videoTimestampMs != null && next?.videoTimestampMs != null
      ? Math.round((prev.videoTimestampMs + next.videoTimestampMs) / 2)
      : null
    const res = await save.insertShotRow(rallyId, position + 1, timestamp)
    if (res.error) return false
    lastUndo.value = null
    await load()
    return true
  }

  /**
   * ショット削除 (押しすぎ補正)。論理削除 (deleted_at) し、以降を前から -1 renumber
   * (歯抜けを作らない — shot_number=1 のサーブ自動確定などの前提を保つ)。完了後に再読込。
   * 論理削除行が旧番号を保持したまま残るため、UNIQUE は live 行だけの部分インデックス
   * (migration 20260803120000)。
   */
  async function deleteShotAt(shotId: string): Promise<boolean> {
    const shot = findShot(shotId)
    if (!shot) return false
    const rest = shotsOf(shot.rallyId).filter(s => s.shotNumber > shot.shotNumber)
    const res = await save.deleteShotRow(shotId)
    if (res.error) return false
    for (const s of rest) {
      await save.updateShotNumber(s.id, s.shotNumber - 1)
    }
    lastUndo.value = null
    await load()
    return true
  }

  /** 直前1段の取り消し (REQ-108): 旧値を逆適用し、カーソルを入力時点へ戻す */
  async function undoLast(): Promise<boolean> {
    const entry = lastUndo.value
    if (!entry) return false
    lastUndo.value = null
    const ok = entry.table === 'shots'
      ? await patchShot(entry.rowId, entry.patch as ShotAnnotationPatch, { recordUndo: false })
      : await patchRally(entry.rowId, entry.patch as RallyEndPatch, { recordUndo: false })
    if (ok) cursor.value = entry.cursor
    return ok
  }

  return {
    // state
    pending,
    loadError,
    match,
    roster,
    rallies,
    shotsByRally,
    mode,
    cursor,
    isYoutube,
    hasRallies,
    savePending: save.pending,
    saveError: save.lastError,
    // actions
    load,
    shotsOf,
    findShot,
    findRally,
    goTo,
    setMode,
    patchShot,
    patchRally,
    insertShotAt,
    deleteShotAt,
    undoLast
  }
}
