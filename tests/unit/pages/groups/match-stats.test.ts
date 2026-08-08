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
  globalFilter: ref({ entity: { kind: 'all' as const }, dateFrom: null, dateTo: null, excludedMatchIds: [] }),
  drilldown: ref({ role: null, position: null, shotBinKeys: [] as string[] }),
  matchesMeta: ref([]),
  includedMatchIds: ref<string[] | null>(null),
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
  setEntity: vi.fn(), setDrillPosition: vi.fn(), setDrillMember: vi.fn(), setDrillBins: vi.fn()
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
  measure: ref('avg'),
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
  StatsGlobalFilterBar: { props: ['players', 'matchesMeta', 'globalFilter', 'includedMatchIds', 'showPeriod'], template: '<div data-testid="filter-bar" />' },
  StatsEmptyState: { template: '<div data-testid="empty" />' },
  StatsRateChart: RateChartStub,
  StatsPositionToggle: { props: ['position'], template: '<div data-testid="position-toggle" />' },
  StatsRallyLengthChart: { props: ['bins', 'selectedKeys'], template: '<div />' },
  StatsRallyTable: RallyTableStub,
  StatsVideoPane: { props: ['source', 'rallyMarkersMs'], methods: { seekToMs(ms: number) { paneSeekSpy(ms) } }, template: '<div data-testid="pane" />' },
  StatsAnnotationBadge: { props: ['summary'], template: '<div data-testid="annotation-badge" />' },
  StatsPhaseRateChart: { props: ['entries'], template: '<div data-testid="phase-chart" />' },
  StatsTempoChart: { props: ['samples', 'excluded', 'measure'], template: '<div data-testid="tempo-chart" />' },
  StatsSetFlowChart: FlowChartStub,
  StatsShotFilterBar: { props: ['hitterIds', 'presentTypes', 'setNumbers', 'playerFilter', 'typeFilter', 'handFilter', 'setNumber', 'nameOf'], template: '<div data-testid="shot-filter" />' },
  StatsEndingsChart: { props: ['entries', 'ranking'], template: '<div data-testid="endings-chart" />' },
  StatsEndingsCourtMap: { props: ['won', 'lost'], template: '<div data-testid="endings-map" />' },
  StatsServeTypeChart: { props: ['rows', 'nameOf'], template: '<div data-testid="serve-chart" />' },
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
    view.globalFilter.value.entity = { kind: 'all' }
    view.isEmpty.value = false
    const w = mountPage()
    expect(w.find('[data-testid="empty"]').exists()).toBe(false)
    expect(w.find('[data-testid="rate-chart"]').exists()).toBe(true)
    expect(w.findComponent(RallyTableStub).props('rows')).toHaveLength(1)
  })

  it('モード切替で entries がペアに変わる', async () => {
    view.globalFilter.value.entity = { kind: 'all' }
    const w = mountPage()
    expect(w.findComponent(RateChartStub).props('mode')).toBe('player')
    await w.find('[data-testid="mode-pair"]').trigger('click')
    expect(w.findComponent(RateChartStub).props('mode')).toBe('pair')
  })

  it('選手選択時はポジション選択 + 得点率グラフ(棒)を表示', () => {
    view.globalFilter.value.entity = { kind: 'player', playerId: 'p0' }
    view.entityRates.value = [{ playerId: 'p0', playerName: '田中', serve: { rate: 0.5, denominator: 2, numerator: 1 }, receive: { rate: null, denominator: 0, numerator: 0 } }]
    const w = mountPage()
    expect(w.find('[data-testid="position-toggle"]').exists()).toBe(true)
    expect(w.find('[data-testid="rate-chart"]').exists()).toBe(true)
    expect(w.find('[data-testid="mode-player"]').exists()).toBe(false) // 全体用トグルは出ない
    view.globalFilter.value.entity = { kind: 'all' }
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
    view.globalFilter.value.entity = { kind: 'all' }
    const w = mountPage()
    w.findComponent(RallyTableStub).vm.$emit('select', { rally_id: 'r1', video_start_timestamp_ms: 3000 })
    await w.vm.$nextTick()
    expect(paneSeekSpy).toHaveBeenCalledWith(1000) // 3000 - 2000
  })

  it('タブ: ショット分析へ切替で概要パネルが隠れ、注釈率を遅延取得 (TASK-0004)', async () => {
    coverageExecute.mockClear()
    coverageMock.loaded.value = false
    const w = mountPage()
    // v-show の inline style で表示状態を判定（happy-dom では isVisible が拾えないため）
    const hidden = (sel: string) => (w.find(sel).attributes('style') ?? '').includes('display: none')
    // 初期は概要タブ。他タブのパネルは v-show で非表示
    expect(hidden('[data-testid="panel-overview"]')).toBe(false)
    expect(hidden('[data-testid="panel-shots"]')).toBe(true)
    await w.find('[data-testid="tab-shots"]').trigger('click')
    expect(hidden('[data-testid="panel-shots"]')).toBe(false)
    expect(hidden('[data-testid="panel-overview"]')).toBe(true)
    // 動画・テーブルはタブ横断で保持（アンマウントされない）
    expect(w.find('[data-testid="pane"]').exists()).toBe(true)
    expect(w.find('[data-testid="table"]').exists()).toBe(true)
    // 注釈率はタブ初回アクティブ時に遅延取得
    expect(coverageExecute).toHaveBeenCalledTimes(1)
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

  it('タブ: ショット分析で探針5枚 + フィルタバーを表示 (TASK-0009〜0012)', async () => {
    shotExecute.mockClear()
    shotMock.loaded.value = true
    const w = mountPage()
    await w.find('[data-testid="tab-shots"]').trigger('click')
    for (const tid of ['shot-filter', 'endings-chart', 'endings-map', 'serve-chart', 'mix-chart', 'mix-scatter', 'hand-chart', 'heatmap']) {
      expect(w.find(`[data-testid="${tid}"]`).exists(), tid).toBe(true)
    }
    // loaded=true のため execute は呼ばれない
    expect(shotExecute).not.toHaveBeenCalled()
    shotMock.loaded.value = false
  })
})
