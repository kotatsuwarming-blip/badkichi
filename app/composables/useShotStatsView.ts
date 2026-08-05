/**
 * useShotStatsView — ショット分析タブ（探針 A/C/D/F/G）の統合 composable（TASK-0009）
 *
 * 4 RPC（shot_types / serve_types / shot_zones / rally_endings）を並列取得。
 * フィルタ設計（設計2026-08-04 了承）:
 * - 選手（打者）・球種・hand(C/D/G) = クライアント側 computed（再フェッチなし）
 * - セット = RPC パラメータ / hand(F ヒートマップ) = RPC パラメータ（grain 爆発防止）
 * タブ初回アクティブ時に execute() を呼ぶ遅延ロード（NFR-001）。
 */
import { computed, ref, watch, type Ref } from 'vue'
import type { Hand, ShotType } from '~/types/shot-annotation'
import type { StatsEntity } from '~/types/stats-dashboard'
import type {
  RallyEndingRow, ServeTypeStatRow, ShotTypeStatRow, ShotZoneRow, StatsSubject, ZoneCell
} from '~/types/shot-stats'
import type { StatsViewScope } from '~/composables/useStatsView'
import { callStatsRpc } from '~/utils/stats-dashboard/stats-rpc'
import { buildDecisiveRanking, buildEndingEntries, buildLandZones } from '~/utils/shot-stats/endings'

export function useShotStatsView(
  scope: StatsViewScope,
  opts: {
    includedMatchIds: Ref<string[] | null>
    entity: () => StatsEntity
    nameOf: (id: string) => string
  }
) {
  const client = useSupabaseClient()

  // RPC パラメータ側フィルタ（変更時に再取得）
  const setNumber = ref<number | null>(null)
  const zoneHand = ref<Hand | null>(null)
  // クライアント側フィルタ（即時反映）
  const playerFilter = ref<string | null>(null) // 打者
  const typeFilter = ref<ShotType | null>(null) // 球種（F/D 対象）
  const handFilter = ref<Hand | null>(null) // C/D/G 用（grain 内絞り込み）

  const typeRows = ref<ShotTypeStatRow[]>([])
  const serveRows = ref<ServeTypeStatRow[]>([])
  const zoneRows = ref<ShotZoneRow[]>([])
  const endingRows = ref<RallyEndingRow[]>([])
  const pending = ref(false)
  const loaded = ref(false)
  const error = ref<string | null>(null)

  function scopeArgs(): Record<string, unknown> {
    const base: Record<string, unknown> = scope.kind === 'match'
      ? { p_match_id: scope.matchId }
      : { p_group_id: scope.groupId, p_match_ids: opts.includedMatchIds.value }
    base.p_set_number = setNumber.value
    return base
  }

  async function execute(): Promise<void> {
    if (pending.value) return
    pending.value = true
    error.value = null
    try {
      const [types, serves, zones, endings] = await Promise.all([
        callStatsRpc<ShotTypeStatRow>(client, 'stats_shot_types', scopeArgs()),
        callStatsRpc<ServeTypeStatRow>(client, 'stats_serve_types', scopeArgs()),
        callStatsRpc<ShotZoneRow>(client, 'stats_shot_zones', { ...scopeArgs(), p_hand: zoneHand.value }),
        callStatsRpc<RallyEndingRow>(client, 'stats_rally_endings', scopeArgs())
      ])
      typeRows.value = types
      serveRows.value = serves
      zoneRows.value = zones
      endingRows.value = endings
      loaded.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      pending.value = false
    }
  }

  // パラメータ側フィルタ・対象試合の変更は取得済みなら追従再取得
  watch([opts.includedMatchIds, setNumber, zoneHand], () => {
    if (loaded.value) execute()
  })

  const subject = computed<StatsSubject>(() => opts.entity() as StatsSubject)

  /** C/D/G の対象行（打者・hand のクライアント絞り込み） */
  const filteredTypeRows = computed(() =>
    typeRows.value.filter(r =>
      (playerFilter.value === null || r.hit_player_id === playerFilter.value)
      && (handFilter.value === null || r.hand === handFilter.value)
    )
  )

  /** 打者候補（フィルタ UI 用。注釈に登場した選手） */
  const hitterIds = computed(() =>
    [...new Set(typeRows.value.map(r => r.hit_player_id).filter((v): v is string => v !== null))]
      .sort((a, b) => opts.nameOf(a).localeCompare(opts.nameOf(b), 'ja'))
  )

  /** 出現球種（フィルタ UI 用） */
  const presentTypes = computed(() =>
    [...new Set(typeRows.value.map(r => r.shot_type).filter((v): v is ShotType => v !== null))]
  )

  // ---- A: 決着分析 ----
  const endingEntries = computed(() => buildEndingEntries(endingRows.value, subject.value, opts.nameOf))
  const decisiveRanking = computed(() => buildDecisiveRanking(endingRows.value))
  const landZonesWon = computed(() => buildLandZones(endingRows.value, subject.value, 'won'))
  const landZonesLost = computed(() => buildLandZones(endingRows.value, subject.value, 'lost'))

  // ---- F: 配球ヒートマップ（打者・球種のクライアント絞り込み → セル集計） ----
  const heatmapCells = computed<ZoneCell[]>(() => {
    const counts = new Map<string, number>()
    for (const r of zoneRows.value) {
      if (playerFilter.value !== null && r.hit_player_id !== playerFilter.value) continue
      if (typeFilter.value !== null && r.shot_type !== typeFilter.value) continue
      const key = `${r.zone_row}:${r.zone_col}`
      counts.set(key, (counts.get(key) ?? 0) + r.shots)
    }
    const max = Math.max(1, ...counts.values())
    return [...counts.entries()].map(([key, count]) => {
      const [row, col] = key.split(':').map(Number)
      return { row: row!, col: col!, count, ratio: count / max }
    })
  })
  const heatmapTotal = computed(() => heatmapCells.value.reduce((s, c) => s + c.count, 0))

  /** セットフィルタ候補（決着行から導出。set 絞り込み中も全候補を保てるよう保持） */
  const knownSetNumbers = ref<number[]>([])
  watch(endingRows, (rows) => {
    const nums = [...new Set(rows.map(r => r.set_number))]
    for (const n of nums) if (!knownSetNumbers.value.includes(n)) knownSetNumbers.value.push(n)
    knownSetNumbers.value.sort((a, b) => a - b)
  })

  const isEmpty = computed(() =>
    loaded.value && typeRows.value.length === 0 && endingRows.value.length === 0
  )

  return {
    // 状態
    pending, loaded, error, execute, subject,
    // フィルタ
    setNumber, zoneHand, playerFilter, typeFilter, handFilter, hitterIds, presentTypes, knownSetNumbers,
    // 生 grain（チャートコンポーネント側で導出）
    typeRows, filteredTypeRows, serveRows, zoneRows, endingRows,
    // A
    endingEntries, decisiveRanking, landZonesWon, landZonesLost,
    // F
    heatmapCells, heatmapTotal,
    isEmpty
  }
}
