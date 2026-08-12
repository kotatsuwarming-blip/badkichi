// @vitest-environment happy-dom
/**
 * Group 横断 stats.vue ページ 単体テスト（配線・分岐）
 * 方針: useStatsView / usePlayers を mock、Stats 系 / U 系 子をスタブ。
 * TASK-0017 / TASK-0020 / REQ-002 / REQ-103 / 受け入れ2026-06-09
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'g1' } }) }))

const view = {
  globalFilter: ref({
    subjectMode: 'player' as 'player' | 'pair', playerId: null, pair1Id: null, pair2Id: null,
    setNumber: null, dateFrom: null, dateTo: null, excludedMatchIds: [] as string[]
  }),
  entity: ref<{ kind: string }>({ kind: 'all' }),
  drilldown: ref({ role: null, position: null, shotBinKeys: [] as string[] }),
  matchesMeta: ref([{ id: 'm1', name: 'A', matchDate: '2026-06-01' }]),
  includedMatchIds: ref<string[] | null>(['m1']),
  knownSetNumbers: ref<number[]>([1, 2]),
  namesMap: ref<Record<string, string>>({ p0: '田中' }),
  overview: ref<unknown>({ playerRates: [{ playerId: 'p0', playerName: '田中', serve: { rate: 0.5, denominator: 2, numerator: 1 }, receive: { rate: null, denominator: 0, numerator: 0 } }], pairRates: [] }),
  entityRates: ref<unknown>([]),
  subjectIds: ref<string[]>([]),
  rallyLengthBins: ref([]),
  tableRows: ref<unknown>([{ rally_id: 'r1', match_id: 'm1', video_start_timestamp_ms: 3000, video_source_type: 'youtube', video_source_url: 'u' }]),
  entityRows: ref([]),
  isEmpty: ref(false),
  setEntity: vi.fn(), setSubjectMode: vi.fn(), setPlayer: vi.fn(), setPair1: vi.fn(), setPair2: vi.fn(), setSetNumber: vi.fn(),
  setDateRange: vi.fn(), toggleMatchExclusion: vi.fn(),
  setDrillPosition: vi.fn(), setDrillMember: vi.fn(), setDrillBins: vi.fn()
}

vi.mock('~/composables/useStatsView', () => ({ useStatsView: () => view }))
vi.mock('~/composables/usePlayers', () => ({ usePlayers: () => ({ data: ref([{ id: 'p0', name: '田中' }]) }) }))

const coverageExecute = vi.fn()
const coverageMock = {
  rows: ref([]),
  summary: ref({
    match_id: '', shots_total: 0, shots_typed: 0, shots_pointed: 0, shots_handed: 0,
    shots_attributed: 0, rallies_total: 0, rallies_ended: 0, rallies_fully_timed: 0
  }),
  pending: ref(false),
  loaded: ref(false),
  error: ref<string | null>(null),
  execute: coverageExecute
}
vi.mock('~/composables/useAnnotationCoverage', () => ({ useAnnotationCoverage: () => coverageMock }))

const flowExecute = vi.fn()
const flowMock = {
  rows: ref([]),
  pending: ref(false),
  loaded: ref(false),
  error: ref<string | null>(null),
  execute: flowExecute,
  subject: ref({ kind: 'all' as const }),
  phaseEntries: ref([]),
  tempo: ref({ samples: [], excluded: 0 }),
  setNumbers: ref<number[]>([]),
  ralliesOfSet: () => [],
  isEmpty: ref(false)
}
vi.mock('~/composables/useRallyFlowView', () => ({ useRallyFlowView: () => flowMock }))

const shotMock = {
  pending: ref(false),
  loaded: ref(false),
  error: ref<string | null>(null),
  execute: vi.fn(),
  subject: ref({ kind: 'all' as const }),
  setNumber: ref<number | null>(null),
  zoneHand: ref(null),
  playerFilter: ref<string | null>(null),
  typeFilter: ref(null),
  handFilter: ref(null),
  hitterIds: ref<string[]>([]),
  presentTypes: ref<string[]>([]),
  knownSetNumbers: ref<number[]>([]),
  typeRows: ref([]),
  filteredTypeRows: ref([]),
  serveRows: ref([]),
  receiveRows: ref([]),
  filteredServeRows: ref([]),
  filteredReceiveRows: ref([]),
  zoneRows: ref([]),
  endingRows: ref([]),
  endingEntries: ref([]),
  decisiveRanking: ref([]),
  landZonesWon: ref({ cells: [], outFallback: { side: 0, back: 0, both: 0 }, unlocated: 0 }),
  landZonesLost: ref({ cells: [], outFallback: { side: 0, back: 0, both: 0 }, unlocated: 0 }),
  selectedOrigin: ref(null),
  selectOrigin: vi.fn(),
  originCells: ref([]),
  destCells: ref([]),
  missOriginCells: ref([]),
  destExtras: ref({
    net: { count: 0, breakdown: [] }, left: { count: 0, breakdown: [] },
    right: { count: 0, breakdown: [] }, back: { count: 0, breakdown: [] }
  }),
  heatmapTotal: ref(0),
  isEmpty: ref(false)
}
vi.mock('~/composables/useShotStatsView', () => ({ useShotStatsView: () => shotMock }))

// eslint-disable-next-line import/first
import GroupStats from '~/pages/groups/[id]/stats.vue'

const FilterBarStub = { props: ['players', 'matchesMeta', 'globalFilter', 'includedMatchIds', 'setNumbers', 'showPeriod'], template: '<div data-testid="filter-bar" />' }
const RallyTableStub = { props: ['rows', 'names', 'showMatch'], emits: ['select'], template: '<div data-testid="table" />' }
const stubs = {
  UButton: { props: ['to'], template: '<button><slot /></button>' },
  StatsGlobalFilterBar: FilterBarStub,
  StatsEmptyState: { template: '<div data-testid="empty" />' },
  StatsRateChart: { props: ['entries', 'mode'], emits: ['select'], template: '<div data-testid="rate-chart" />' },
  StatsPositionToggle: { props: ['position'], template: '<div data-testid="position-toggle" />' },
  StatsRallyLengthChart: { props: ['bins', 'selectedKeys'], template: '<div />' },
  StatsRallyTable: RallyTableStub,
  StatsVideoPane: { props: ['source', 'rallyMarkersMs', 'autoSeekMs'], template: '<div data-testid="pane" />' },
  StatsAnnotationBadge: { props: ['summary'], template: '<div data-testid="annotation-badge" />' },
  StatsPhaseRateChart: { props: ['entries'], template: '<div data-testid="phase-chart" />' },
  StatsTempoChart: { props: ['samples', 'excluded'], emits: ['select'], template: '<div data-testid="tempo-chart" />' },
  StatsSetFlowChart: { props: ['points'], emits: ['select'], template: '<div data-testid="flow-chart" />' },
  StatsShotFilterBar: { props: ['hitterIds', 'setNumbers', 'playerFilter', 'setNumber', 'nameOf'], template: '<div data-testid="shot-filter" />' },
  StatsWeaknessMaps: { props: ['missCells', 'lost'], template: '<div data-testid="weakness-maps" />' },
  StatsEndingsChart: { props: ['entries', 'ranking'], template: '<div data-testid="endings-chart" />' },
  StatsEndingsCourtMap: { props: ['won', 'lost'], template: '<div data-testid="endings-map" />' },
  StatsServeTypeChart: { props: ['rows', 'nameOf'], template: '<div data-testid="serve-chart" />' },
  StatsReceiveTypeChart: { props: ['rows', 'nameOf'], template: '<div data-testid="receive-chart" />' },
  StatsShotMixChart: { props: ['rows'], template: '<div data-testid="mix-chart" />' },
  StatsShotMixScatter: { props: ['rows'], template: '<div data-testid="mix-scatter" />' },
  StatsHandChart: { props: ['rows'], template: '<div data-testid="hand-chart" />' },
  StatsShotHeatmap: { props: ['originCells', 'destCells', 'destExtras', 'selected', 'total', 'pointedTotal'], template: '<div data-testid="heatmap" />' }
}

function mountPage() {
  return mount(GroupStats, { global: { mocks: { $t: (k: string) => k }, stubs } })
}

describe('Group 横断 stats ページ', () => {
  it('グローバルフィルタバーを表示し period=true を渡す', () => {
    const w = mountPage()
    expect(w.findComponent(FilterBarStub).props('showPeriod')).toBe(true)
    expect(w.findComponent(FilterBarStub).props('matchesMeta')).toHaveLength(1)
  })

  it('全体モードでテーブルに showMatch=true で行を渡す', () => {
    view.entity.value = { kind: 'all' }
    view.isEmpty.value = false
    const w = mountPage()
    expect(w.findComponent(RallyTableStub).props('showMatch')).toBe(true)
    expect(w.findComponent(RallyTableStub).props('rows')).toHaveLength(1)
  })

  it('isEmpty=true では空状態を表示', () => {
    view.isEmpty.value = true
    const w = mountPage()
    expect(w.find('[data-testid="empty"]').exists()).toBe(true)
    view.isEmpty.value = false
  })

  it('タブ: ラリー展開は遅延取得、注釈系は初期ロード (#8)', async () => {
    coverageExecute.mockClear()
    flowExecute.mockClear()
    flowMock.loaded.value = false
    const w = mountPage()
    expect(coverageExecute).toHaveBeenCalledTimes(1) // 既定タブが注釈系のため mount 時
    const hidden = (sel: string) => (w.find(sel).attributes('style') ?? '').includes('display: none')
    expect(hidden('[data-testid="panel-rallyflow"]')).toBe(true)
    await w.find('[data-testid="tab-rallyflow"]').trigger('click')
    expect(hidden('[data-testid="panel-rallyflow"]')).toBe(false)
    expect(flowExecute).toHaveBeenCalledTimes(1)
  })

  it('タブ: ラリー展開 (Group) は J/K + ラリー長のみ・L なし (#8)', async () => {
    flowMock.loaded.value = true
    const w = mountPage()
    await w.find('[data-testid="tab-rallyflow"]').trigger('click')
    expect(w.find('[data-testid="phase-chart"]').exists()).toBe(true)
    expect(w.find('[data-testid="tempo-chart"]').exists()).toBe(true)
    expect(w.find('[data-testid="flow-chart"]').exists()).toBe(false)
    flowMock.loaded.value = false
  })
})
