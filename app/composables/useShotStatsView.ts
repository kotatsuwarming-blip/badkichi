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
  PlacementDestCell, RallyEndingRow, ReceiveDetailRow, ServeTypeStatRow, ShotPlacementRow,
  ShotTypeStatRow, StatsSubject
} from '~/types/shot-stats'
import type { StatsViewScope } from '~/composables/useStatsView'
import { callStatsRpc } from '~/utils/stats-dashboard/stats-rpc'
import { buildDecisiveRanking, buildEndingEntries, buildLandZones } from '~/utils/shot-stats/endings'
import { buildDestCells, buildDestExtras, buildOriginCells } from '~/utils/shot-stats/placement'

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
  const receiveRows = ref<ReceiveDetailRow[]>([])
  const placementRows = ref<ShotPlacementRow[]>([])
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
      const [types, serves, receives, placement, endings] = await Promise.all([
        callStatsRpc<ShotTypeStatRow>(client, 'stats_shot_types', scopeArgs()),
        callStatsRpc<ServeTypeStatRow>(client, 'stats_serve_types', scopeArgs()),
        callStatsRpc<ReceiveDetailRow>(client, 'stats_receive_detail', scopeArgs()),
        callStatsRpc<ShotPlacementRow>(client, 'stats_shot_placement', { ...scopeArgs(), p_hand: zoneHand.value }),
        callStatsRpc<RallyEndingRow>(client, 'stats_rally_endings', scopeArgs())
      ])
      typeRows.value = types
      serveRows.value = serves
      receiveRows.value = receives
      placementRows.value = placement
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

  /** C/レシーブ: 打者フィルタで人を絞る（未選択は全員合算, #6） */
  const filteredServeRows = computed(() =>
    playerFilter.value === null
      ? serveRows.value
      : serveRows.value.filter(r => r.server_player_id === playerFilter.value)
  )
  const filteredReceiveRows = computed(() =>
    playerFilter.value === null
      ? receiveRows.value
      : receiveRows.value.filter(r => r.receiver_player_id === playerFilter.value)
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

  // ---- F: 配球ヒートマップ（手前セル選択 → 配球先, ヒアリング2026-08-08） ----
  /** 選択中の手前（自陣）セル。null = 未選択（全セル合計を表示） */
  const selectedOrigin = ref<{ row: number, col: number } | null>(null)

  const filteredPlacement = computed(() =>
    placementRows.value.filter(r =>
      (playerFilter.value === null || r.hit_player_id === playerFilter.value)
      && (typeFilter.value === null || r.shot_type === typeFilter.value)
    )
  )

  /** 手前（自陣）3×3: 各セルから打った本数 + 球種内訳（選択 UI + ホバー内訳, #4） */
  const originCells = computed<PlacementDestCell[]>(() => buildOriginCells(filteredPlacement.value))

  /** 奥（相手）3×3: 配球先の本数 + 球種内訳（選択セル起点。未選択は全体合計） */
  const destCells = computed<PlacementDestCell[]>(() =>
    buildDestCells(filteredPlacement.value, selectedOrigin.value)
  )
  /** 弱点分析: ミス（ネット/アウト決着）の打点セル（自陣半面, 2026-08-08 #8 川島アドバイス） */
  const missOriginCells = computed<PlacementDestCell[]>(() =>
    buildOriginCells(filteredPlacement.value.filter(r => r.dest_kind === 'net' || r.dest_kind === 'out'))
  )

  /** コート外の行き先（ネット / 左右アウト / バックアウト。寄せずに別枠表示, #4） */
  const destExtras = computed(() => buildDestExtras(filteredPlacement.value, selectedOrigin.value))
  const heatmapTotal = computed(() =>
    destCells.value.reduce((s, c) => s + c.count, 0)
    + destExtras.value.net.count + destExtras.value.left.count
    + destExtras.value.right.count + destExtras.value.back.count
  )

  function selectOrigin(cell: { row: number, col: number } | null): void {
    // 同一セル再選択で解除
    selectedOrigin.value
      = cell !== null && selectedOrigin.value?.row === cell.row && selectedOrigin.value?.col === cell.col
        ? null
        : cell
  }

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
    typeRows, filteredTypeRows, serveRows, receiveRows, filteredServeRows, filteredReceiveRows, placementRows, endingRows,
    // A
    endingEntries, decisiveRanking, landZonesWon, landZonesLost,
    // F
    selectedOrigin, selectOrigin, originCells, destCells, destExtras, heatmapTotal, missOriginCells,
    isEmpty
  }
}
