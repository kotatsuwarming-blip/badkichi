// @vitest-environment happy-dom
/**
 * 試合単位 stats.vue ページ 単体テスト（配線・分岐）
 * 方針: useStatsView / useMatchForRecording を mock、Stats 系 / U 系 子をスタブ。
 * TASK-0016 / TASK-0020 / REQ-103 / REQ-006 / 受け入れ2026-06-09
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'g1', matchId: 'm1' } }) }))

const matchData = ref<unknown>({
  id: 'm1', name: 'テスト試合', videoSourceType: 'youtube', videoSourceUrl: 'https://youtu.be/x', completedAt: null,
  roster: [
    { playerId: 'p0', name: '田中', team: 'A' }, { playerId: 'p1', name: '佐藤', team: 'A' },
    { playerId: 'p2', name: '鈴木', team: 'B' }, { playerId: 'p3', name: '高橋', team: 'B' }
  ]
})

const view = {
  globalFilter: ref({
    subjectMode: 'player' as 'player' | 'pair', playerId: null, pair1Id: null, pair2Id: null,
    setNumber: null, dateFrom: null, dateTo: null, excludedMatchIds: [] as string[]
  }),
  entity: ref<{ kind: string, playerId?: string }>({ kind: 'all' }),
  drilldown: ref({ role: null, position: null, shotBinKeys: [] as string[] }),
  matchesMeta: ref([]),
  includedMatchIds: ref<string[] | null>(null),
  knownSetNumbers: ref<number[]>([1, 2]),
  namesMap: ref<Record<string, string>>({ p0: '田中' }),
  overview: ref<unknown>({
    playerRates: [{ playerId: 'p0', playerName: '田中', serve: { rate: 0.5, denominator: 2, numerator: 1 }, receive: { rate: null, denominator: 0, numerator: 0 } }],
    pairRates: [{ player1Id: 'p0', player2Id: 'p1', pairLabel: '田中 / 佐藤', serve: { rate: 0.5, denominator: 2, numerator: 1 }, receive: { rate: null, denominator: 0, numerator: 0 } }]
  }),
  entityRates: ref<unknown>([]),
  subjectIds: ref<string[]>([]),
  rallyLengthBins: ref([]),
  tableRows: ref<unknown>([{ rally_id: 'r1', video_start_timestamp_ms: 3000 }]),
  entityRows: ref([]),
  isEmpty: ref(false),
  setEntity: vi.fn(), setSubjectMode: vi.fn(), setPlayer: vi.fn(), setPair1: vi.fn(), setPair2: vi.fn(), setSetNumber: vi.fn(),
  setDrillPosition: vi.fn(), setDrillMember: vi.fn(), setDrillBins: vi.fn()
}

vi.mock('~/composables/useMatchForRecording', () => ({ useMatchForRecording: () => ({ data: matchData, refresh: vi.fn() }) }))
vi.mock('~/composables/useStatsView', () => ({ useStatsView: () => view }))

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

const shotExecute = vi.fn()
const shotMock = {
  pending: ref(false),
  loaded: ref(false),
  error: ref<string | null>(null),
  execute: shotExecute,
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
import MatchStats from '~/pages/groups/[id]/matches/[matchId]/stats.vue'

const paneSeekSpy = vi.fn()
const RateChartStub = { props: ['entries', 'mode'], emits: ['select'], template: '<div data-testid="rate-chart" />' }
const RallyTableStub = { props: ['rows', 'names'], emits: ['select'], template: '<div data-testid="table" />' }
const FlowChartStub = { props: ['points'], emits: ['select'], template: '<div data-testid="flow-chart" />' }
const stubs = {
  UButton: { props: ['to'], template: '<button @click="$emit(\'click\')"><slot /></button>' },
  StatsGlobalFilterBar: { props: ['players', 'matchesMeta', 'globalFilter', 'includedMatchIds', 'setNumbers', 'showPeriod'], template: '<div data-testid="filter-bar" />' },
  StatsEmptyState: { template: '<div data-testid="empty" />' },
  StatsRateChart: RateChartStub,
  StatsPositionToggle: { props: ['position'], template: '<div data-testid="position-toggle" />' },
  StatsRallyLengthChart: { props: ['bins', 'selectedKeys'], template: '<div />' },
  StatsRallyTable: RallyTableStub,
  StatsVideoPane: { props: ['source', 'rallyMarkersMs'], methods: { seekToMs(ms: number) { paneSeekSpy(ms) } }, template: '<div data-testid="pane" />' },
  StatsAnnotationBadge: { props: ['summary'], template: '<div data-testid="annotation-badge" />' },
  StatsPhaseRateChart: { props: ['entries'], template: '<div data-testid="phase-chart" />' },
  StatsTempoChart: { props: ['samples', 'excluded'], emits: ['select'], template: '<div data-testid="tempo-chart" />' },
  StatsSetFlowChart: FlowChartStub,
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
  return mount(MatchStats, { global: { mocks: { $t: (k: string) => k }, stubs } })
}

describe('試合単位 stats ページ', () => {
  it('全体モードでは得点率チャート + テーブルに行を渡す', () => {
    view.entity.value = { kind: 'all' }
    view.isEmpty.value = false
    const w = mountPage()
    expect(w.find('[data-testid="empty"]').exists()).toBe(false)
    expect(w.find('[data-testid="rate-chart"]').exists()).toBe(true)
    expect(w.findComponent(RallyTableStub).props('rows')).toHaveLength(1)
  })

  it('グローバルの対象モードに応じて overview の mode が変わる', () => {
    view.entity.value = { kind: 'all' }
    view.globalFilter.value.subjectMode = 'pair'
    const w = mountPage()
    expect(w.findComponent(RateChartStub).props('mode')).toBe('pair')
    view.globalFilter.value.subjectMode = 'player'
  })

  it('選手選択時はポジション選択 + 得点率グラフ(棒)を表示', () => {
    view.entity.value = { kind: 'player', playerId: 'p0' }
    view.entityRates.value = [{ playerId: 'p0', playerName: '田中', serve: { rate: 0.5, denominator: 2, numerator: 1 }, receive: { rate: null, denominator: 0, numerator: 0 } }]
    const w = mountPage()
    expect(w.find('[data-testid="position-toggle"]').exists()).toBe(true)
    expect(w.find('[data-testid="rate-chart"]').exists()).toBe(true)
    view.entity.value = { kind: 'all' }
    view.entityRates.value = []
  })

  it('isEmpty=true では空状態を表示', () => {
    view.isEmpty.value = true
    const w = mountPage()
    expect(w.find('[data-testid="empty"]').exists()).toBe(true)
    view.isEmpty.value = false
  })

  it('結合: ラリー行選択で 2 秒前から再生 (受け入れ2026-06-09)', async () => {
    paneSeekSpy.mockClear()
    view.entity.value = { kind: 'all' }
    const w = mountPage()
    w.findComponent(RallyTableStub).vm.$emit('select', { rally_id: 'r1', video_start_timestamp_ms: 3000 })
    await w.vm.$nextTick()
    expect(paneSeekSpy).toHaveBeenCalledWith(1000) // 3000 - 2000
  })

  it('タブ: 既定はサーブ周り。注釈系は初期ロードされ、タブ切替でパネルが入れ替わる (#8)', async () => {
    coverageExecute.mockClear()
    shotExecute.mockClear()
    const w = mountPage()
    // 既定タブ（サーブ周り）が注釈データを使うため、注釈系は mount 時に取得
    expect(coverageExecute).toHaveBeenCalledTimes(1)
    expect(shotExecute).toHaveBeenCalledTimes(1)
    const hidden = (sel: string) => (w.find(sel).attributes('style') ?? '').includes('display: none')
    expect(hidden('[data-testid="panel-serve"]')).toBe(false)
    expect(hidden('[data-testid="panel-strengths"]')).toBe(true)
    await w.find('[data-testid="tab-strengths"]').trigger('click')
    expect(hidden('[data-testid="panel-strengths"]')).toBe(false)
    expect(hidden('[data-testid="panel-serve"]')).toBe(true)
    // 動画・テーブルはタブ横断で保持（アンマウントされない）
    expect(w.find('[data-testid="pane"]').exists()).toBe(true)
    expect(w.find('[data-testid="table"]').exists()).toBe(true)
  })

  it('タブ: ラリー展開で J/K/L を表示し、L タップで動画ジャンプ (TASK-0005〜0008 / REQ-019)', async () => {
    paneSeekSpy.mockClear()
    flowExecute.mockClear()
    flowMock.loaded.value = true
    flowMock.setNumbers.value = [1, 2]
    const w = mountPage()
    await w.find('[data-testid="tab-rallyflow"]').trigger('click')
    expect(w.find('[data-testid="phase-chart"]').exists()).toBe(true)
    expect(w.find('[data-testid="tempo-chart"]').exists()).toBe(true)
    expect(w.find('[data-testid="flow-chart"]').exists()).toBe(true)
    expect(w.find('[data-testid="set-2"]').exists()).toBe(true)
    // L の点タップ → 2 秒前から再生
    w.findComponent(FlowChartStub).vm.$emit('select', {
      rallyId: 'r1', rallyNumber: 1, diff: 1, scoreA: 0, scoreB: 0, videoStartMs: 5000
    })
    await w.vm.$nextTick()
    expect(paneSeekSpy).toHaveBeenCalledWith(3000)
    flowMock.loaded.value = false
    flowMock.setNumbers.value = []
  })

  it('タブ再編 (#8/フィルタ再編): サーブ周り = 得点率 + サーブ/レシーブ、弱点 = 弱点マップ、ヒートマップはラリー展開へ', async () => {
    shotMock.loaded.value = true
    const w = mountPage()
    // サーブ周り（既定）: 得点率チャート + サーブ/レシーブ分析
    for (const tid of ['rate-chart', 'serve-chart', 'receive-chart']) {
      expect(w.find(`[data-testid="${tid}"]`).exists(), tid).toBe(true)
    }
    // 削除済みチャート・旧ショットフィルタバーは出ない
    for (const tid of ['endings-chart', 'endings-map', 'mix-chart', 'mix-scatter', 'hand-chart', 'shot-filter']) {
      expect(w.find(`[data-testid="${tid}"]`).exists(), tid).toBe(false)
    }
    expect(w.find('[data-testid="weakness-maps"]').exists()).toBe(true) // 弱点タブ (v-show)
    // ヒートマップはラリー展開タブ内 (v-show, 2026-08-08 フィルタ再編)
    const rallyflow = w.find('[data-testid="panel-rallyflow"]')
    expect(rallyflow.find('[data-testid="heatmap"]').exists()).toBe(true)
    shotMock.loaded.value = false
  })
})
