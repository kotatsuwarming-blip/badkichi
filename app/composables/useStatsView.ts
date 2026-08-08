/**
 * useStatsView — 統計ダッシュボードの統合 composable
 *
 * グローバルフィルタ（対象=全体/選手/ペア、試合期間=日付範囲+個別除外）と
 * ドリルダウン（役割 serve/receive × サービスポジション right(偶)/left(奇) × ラリー長ビン）を保持し、
 * - 全体: 集計 RPC（選手別/ペア別 + ラリー長）
 * - 選手/ペア: stats_rallies で関与ラリーを取得し、ブレイクダウン/ラリー長/テーブルをクライアントで導出
 * を提供する。ドリルダウンはクライアント側で即時連動（テーブル・ラリー長グラフ・強調表示）。
 *
 * 関連設計/要件: 受け入れ2026-06-09（グローバルフィルタ・ポジション/役割ドリルダウン・本数グラフ連動）
 * スタイル: セミコロンなし / no comma dangle
 */

import { computed, ref, watch } from 'vue'
import { buildAggregate } from '~/utils/stats-dashboard/build-aggregate'
import { callStatsRpc } from '~/utils/stats-dashboard/stats-rpc'
import { computeSubjectRates } from '~/utils/stats-dashboard/compute-subject-rates'
import { applyDrilldown } from '~/utils/stats-dashboard/apply-drilldown'
import { ralliesToLengthBins } from '~/utils/stats-dashboard/rally-length-bins'
import { resolveIncludedMatchIds } from '~/utils/stats-dashboard/resolve-match-ids'
import { usePlayers } from '~/composables/usePlayers'
import { useMatches } from '~/composables/useMatches'
import type { Database } from '~/types/supabase'
import type {
  MatchMeta,
  PairRateRow,
  PlayerRate,
  PlayerRateRow,
  RallyLengthBin,
  RallyLengthRow,
  RallyRow,
  ServePosition,
  StatsDrilldown,
  StatsEntity,
  StatsGlobalFilter,
  StatsOverview,
  StatsRole,
  SubjectMode
} from '~/types/stats-dashboard'

export type StatsViewScope
  = { kind: 'match', matchId: string, groupId: string }
    | { kind: 'group', groupId: string }

export function useStatsView(scope: StatsViewScope) {
  const client = useSupabaseClient<Database>()

  // 選手名解決（自 Group の選手）
  const { data: players } = usePlayers()
  const namesMap = computed<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const p of players.value ?? []) m[p.id] = p.name
    return m
  })
  const nameOf = (id: string) => namesMap.value[id] ?? id

  // 試合メタ（Group 横断の期間フィルタ UI 用）
  const matchesComposable = scope.kind === 'group' ? useMatches() : null
  const matchesMeta = computed<MatchMeta[]>(() => {
    if (scope.kind !== 'group') return []
    return (matchesComposable!.data.value ?? []).map(m => ({ id: m.id, name: m.name ?? '', matchDate: m.matchDate }))
  })

  const globalFilter = ref<StatsGlobalFilter>({
    subjectMode: 'player', playerId: null, pair1Id: null, pair2Id: null,
    setNumber: null, dateFrom: null, dateTo: null, excludedMatchIds: []
  })
  const drilldown = ref<StatsDrilldown>({ role: null, position: null, memberId: null, shotBinKeys: [] })

  // 対象（選手/ペア）はモード+選択から導出。未完（未選択・同一選手ペア）は全員比較
  const entity = computed<StatsEntity>(() => {
    const f = globalFilter.value
    if (f.subjectMode === 'player' && f.playerId !== null) return { kind: 'player', playerId: f.playerId }
    if (f.subjectMode === 'pair' && f.pair1Id !== null && f.pair2Id !== null && f.pair1Id !== f.pair2Id) {
      return { kind: 'pair', player1Id: f.pair1Id, player2Id: f.pair2Id }
    }
    return { kind: 'all' }
  })

  // 対象試合 ID（Group のみ。match scope は p_match_id を使うため null）
  const includedMatchIds = computed<string[] | null>(() => {
    if (scope.kind !== 'group') return null
    return resolveIncludedMatchIds(
      matchesMeta.value, globalFilter.value.dateFrom, globalFilter.value.dateTo, globalFilter.value.excludedMatchIds
    )
  })

  const memberIds = computed<string[]>(() => {
    const e = entity.value
    if (e.kind === 'player') return [e.playerId]
    if (e.kind === 'pair') return [e.player1Id, e.player2Id]
    return []
  })

  function scopeArgs(): Record<string, unknown> {
    const base: Record<string, unknown> = scope.kind === 'match'
      ? { p_match_id: scope.matchId }
      : { p_group_id: scope.groupId, p_match_ids: includedMatchIds.value }
    base.p_set_number = globalFilter.value.setNumber
    return base
  }

  // データ取得（entity と対象試合の変化で再取得。ドリルダウンはクライアント側のため再取得しない）
  const fetchKey = `stats-view-${scope.kind}-${scope.kind === 'match' ? scope.matchId : scope.groupId}`
  const { data: raw, pending, error, refresh } = useAsyncData(
    fetchKey,
    async () => {
      const e = entity.value
      if (e.kind === 'all') {
        // 全体でもラリーを取得し、テーブル（再生候補）を出す（U-05: フィルタ前提の発見性を解消）
        const [pr, pair, len, rows] = await Promise.all([
          callStatsRpc<PlayerRateRow>(client, 'stats_player_rates', scopeArgs()),
          callStatsRpc<PairRateRow>(client, 'stats_pair_rates', scopeArgs()),
          callStatsRpc<RallyLengthRow>(client, 'stats_rally_length', scopeArgs()),
          callStatsRpc<RallyRow>(client, 'stats_rallies', scopeArgs())
        ])
        return { mode: 'all' as const, agg: buildAggregate(pr, pair, len, nameOf), rows }
      }
      const args = scopeArgs()
      if (e.kind === 'player') args.p_player_id = e.playerId
      else {
        args.p_pair_player1_id = e.player1Id
        args.p_pair_player2_id = e.player2Id
      }
      const rows = await callStatsRpc<RallyRow>(client, 'stats_rallies', args)
      return { mode: 'entity' as const, rows }
    },
    { watch: [includedMatchIds, entity, () => globalFilter.value.setNumber] }
  )

  // セットフィルタ候補（取得済み行から累積。絞り込み中も全候補を保持）
  const knownSetNumbers = ref<number[]>([])
  watch(raw, (v) => {
    if (!v) return
    const nums = [...new Set(v.rows.map(r => r.set_number))]
    for (const n of nums) if (!knownSetNumbers.value.includes(n)) knownSetNumbers.value.push(n)
    knownSetNumbers.value.sort((a, b) => a - b)
  }, { immediate: true })

  // ---- 導出（ドリルダウンはクライアント側で即時反映） ----
  const overview = computed<StatsOverview | null>(() =>
    raw.value?.mode === 'all' ? { playerRates: raw.value.agg.playerRates, pairRates: raw.value.agg.pairRates } : null
  )
  const entityRows = computed<RallyRow[]>(() => (raw.value?.mode === 'entity' ? raw.value.rows : []))

  // 選手/ペアのグラフ対象（ペアは両名、個人ドリルダウン時はその1名）
  const subjectIds = computed<string[]>(() => {
    const e = entity.value
    if (e.kind === 'player') return [e.playerId]
    if (e.kind === 'pair') return drilldown.value.memberId ? [drilldown.value.memberId] : [e.player1Id, e.player2Id]
    return []
  })

  // 選択選手/ペアの serve/receive 得点率（棒グラフ用。position 連動）
  const entityRates = computed<PlayerRate[]>(() =>
    raw.value?.mode === 'entity'
      ? computeSubjectRates(entityRows.value, subjectIds.value, nameOf, drilldown.value.position)
      : []
  )

  // ラリー長グラフ: 役割・ポジション・個人ドリルダウンは連動、ビン選択自身では絞らない
  const rallyLengthBins = computed<RallyLengthBin[]>(() => {
    if (raw.value?.mode === 'all') return raw.value.agg.rallyLength
    const forLength = applyDrilldown(
      entityRows.value,
      { role: drilldown.value.role, position: drilldown.value.position, memberId: drilldown.value.memberId, shotBinKeys: [] },
      subjectIds.value
    )
    return ralliesToLengthBins(forLength)
  })

  // テーブル: 全体は全ラリー、選手/ペアはドリルダウン適用
  const tableRows = computed<RallyRow[]>(() => {
    if (raw.value?.mode === 'all') return raw.value.rows
    if (raw.value?.mode === 'entity') return applyDrilldown(entityRows.value, drilldown.value, subjectIds.value)
    return []
  })

  const isEmpty = computed(() =>
    raw.value?.mode === 'all'
      ? (raw.value.agg.playerRates.length === 0 && raw.value.rows.length === 0)
      : entityRows.value.length === 0
  )

  // ---- 操作 ----
  function resetDrilldown(): void {
    drilldown.value = { role: null, position: null, memberId: null, shotBinKeys: [] }
  }
  /** チャートクリック等からの対象設定（モード+選択へ分解して反映） */
  function setEntity(e: StatsEntity): void {
    const f = globalFilter.value
    if (e.kind === 'player') {
      f.subjectMode = 'player'
      f.playerId = e.playerId
    } else if (e.kind === 'pair') {
      f.subjectMode = 'pair'
      f.pair1Id = e.player1Id
      f.pair2Id = e.player2Id
    } else if (f.subjectMode === 'player') {
      f.playerId = null
    } else {
      f.pair1Id = null
      f.pair2Id = null
    }
    resetDrilldown()
  }
  function setSubjectMode(mode: SubjectMode): void {
    globalFilter.value.subjectMode = mode
    resetDrilldown()
  }
  function setPlayer(id: string | null): void {
    globalFilter.value.playerId = id
    resetDrilldown()
  }
  function setPair1(id: string | null): void {
    globalFilter.value.pair1Id = id
    resetDrilldown()
  }
  function setPair2(id: string | null): void {
    globalFilter.value.pair2Id = id
    resetDrilldown()
  }
  function setSetNumber(n: number | null): void {
    globalFilter.value.setNumber = n
  }
  function setDateRange(from: string | null, to: string | null): void {
    globalFilter.value.dateFrom = from
    globalFilter.value.dateTo = to
  }
  function toggleMatchExclusion(matchId: string): void {
    const ex = globalFilter.value.excludedMatchIds
    globalFilter.value.excludedMatchIds = ex.includes(matchId) ? ex.filter(id => id !== matchId) : [...ex, matchId]
  }
  function setDrillRole(role: StatsRole): void {
    drilldown.value.role = drilldown.value.role === role ? null : role
  }
  function setDrillPosition(position: ServePosition | null): void {
    drilldown.value.position = position
  }
  /** ペアから個人へドリルダウン（同一再選択でペア両名に戻る） */
  function setDrillMember(memberId: string): void {
    drilldown.value.memberId = drilldown.value.memberId === memberId ? null : memberId
  }
  function setDrillBins(keys: string[]): void {
    drilldown.value.shotBinKeys = keys
  }

  return {
    globalFilter, entity, drilldown, matchesMeta, includedMatchIds, knownSetNumbers, namesMap, nameOf, memberIds, subjectIds,
    overview, entityRates, rallyLengthBins, tableRows, entityRows, isEmpty, pending, error, refresh,
    setEntity, setSubjectMode, setPlayer, setPair1, setPair2, setSetNumber,
    setDateRange, toggleMatchExclusion, setDrillRole, setDrillPosition, setDrillMember, setDrillBins, resetDrilldown
  }
}
