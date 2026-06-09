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
  globalFilter: ref({ entity: { kind: 'all' as const }, dateFrom: null, dateTo: null, excludedMatchIds: [] }),
  drilldown: ref({ role: null, position: null, shotBinKeys: [] as string[] }),
  matchesMeta: ref([{ id: 'm1', name: 'A', matchDate: '2026-06-01' }]),
  includedMatchIds: ref<string[] | null>(['m1']),
  namesMap: ref<Record<string, string>>({ p0: '田中' }),
  overview: ref<unknown>({ playerRates: [{ playerId: 'p0', playerName: '田中', serve: { rate: 0.5, denominator: 2, numerator: 1 }, receive: { rate: null, denominator: 0, numerator: 0 } }], pairRates: [] }),
  breakdown: ref<unknown>(null),
  rallyLengthBins: ref([]),
  tableRows: ref<unknown>([{ rally_id: 'r1', match_id: 'm1', video_start_timestamp_ms: 3000, video_source_type: 'youtube', video_source_url: 'u' }]),
  entityRows: ref([]),
  isEmpty: ref(false),
  setEntity: vi.fn(), setDateRange: vi.fn(), toggleMatchExclusion: vi.fn(),
  setDrillRole: vi.fn(), setDrillPosition: vi.fn(), setDrillBins: vi.fn()
}

vi.mock('~/composables/useStatsView', () => ({ useStatsView: () => view }))
vi.mock('~/composables/usePlayers', () => ({ usePlayers: () => ({ data: ref([{ id: 'p0', name: '田中' }]) }) }))

// eslint-disable-next-line import/first
import GroupStats from '~/pages/groups/[id]/stats.vue'

const FilterBarStub = { props: ['players', 'matchesMeta', 'globalFilter', 'includedMatchIds', 'showPeriod'], template: '<div data-testid="filter-bar" />' }
const RallyTableStub = { props: ['rows', 'names', 'showMatch'], emits: ['select'], template: '<div data-testid="table" />' }
const stubs = {
  UButton: { props: ['to'], template: '<button><slot /></button>' },
  StatsGlobalFilterBar: FilterBarStub,
  StatsEmptyState: { template: '<div data-testid="empty" />' },
  StatsRateChart: { props: ['entries', 'mode'], emits: ['select'], template: '<div data-testid="rate-chart" />' },
  StatsBreakdownChart: { props: ['breakdown', 'drilldown'], template: '<div data-testid="breakdown" />' },
  StatsRallyLengthChart: { props: ['bins', 'selectedKeys'], template: '<div />' },
  StatsRallyTable: RallyTableStub,
  StatsVideoPane: { props: ['source', 'rallyMarkersMs', 'autoSeekMs'], template: '<div data-testid="pane" />' }
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
    view.globalFilter.value.entity = { kind: 'all' }
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
})
