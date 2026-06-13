// @vitest-environment happy-dom
/**
 * Group 横断 stats.vue ページ 単体テスト（配線・分岐）
 * 方針: composable を mock、Stats 系 / U 系 子をスタブ。空状態・絞り込み前後のテーブル表示・遅延取得を検証。
 * TASK-0017 / REQ-002 / REQ-010 / REQ-103
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'g1' } }) }))

const statsData = ref<unknown>({
  playerRates: [{ playerId: 'p0', playerName: '田中', serve: { rate: 0.5, denominator: 2, numerator: 1 }, receive: { rate: null, denominator: 0, numerator: 0 } }],
  pairRates: [],
  rallyLength: [],
  isEmpty: false
})
const ralliesData = ref<unknown>([{ rally_id: 'r1', match_id: 'm1', video_start_timestamp_ms: 1000, video_source_type: 'youtube', video_source_url: 'u' }])
const refreshRalliesSpy = vi.fn()
const filterRef = ref({ playerId: null as string | null, pair: null as unknown, role: null as string | null, shotBinKeys: [] as string[] })

vi.mock('~/composables/useGroupStats', () => ({ useGroupStats: () => ({ data: statsData, refresh: vi.fn() }) }))
vi.mock('~/composables/useGroupRallies', () => ({ useGroupRallies: () => ({ data: ralliesData, refresh: refreshRalliesSpy }) }))
vi.mock('~/composables/usePlayers', () => ({ usePlayers: () => ({ data: ref([{ id: 'p0', name: '田中' }]) }) }))
vi.mock('~/composables/useStatsFilter', () => ({
  useStatsFilter: () => ({
    filter: filterRef,
    setFilter: (patch: Record<string, unknown>) => { Object.assign(filterRef.value, patch) },
    clear: () => { filterRef.value = { playerId: null, pair: null, role: null, shotBinKeys: [] } },
    apply: (rows: unknown[]) => rows,
    toQueryArgs: () => ({})
  })
}))

// eslint-disable-next-line import/first
import GroupStats from '~/pages/groups/[id]/stats.vue'

const RateChartStub = { props: ['entries', 'mode'], emits: ['select'], template: '<div data-testid="rate-chart" />' }
const RallyTableStub = { props: ['rows', 'names', 'showMatch'], emits: ['select'], template: '<div data-testid="table" />' }
const stubs = {
  UButton: { props: ['to'], template: '<button @click="$emit(\'click\')"><slot /></button>' },
  StatsEmptyState: { template: '<div data-testid="empty" />' },
  StatsRateChart: RateChartStub,
  StatsRallyLengthChart: { props: ['bins', 'selectedKeys'], emits: ['selectBins'], template: '<div />' },
  StatsRallyTable: RallyTableStub,
  StatsVideoPane: { props: ['source', 'rallyMarkersMs', 'autoSeekMs'], template: '<div data-testid="pane" />' }
}

function mountPage() {
  return mount(GroupStats, { global: { mocks: { $t: (k: string) => k }, stubs } })
}

describe('Group 横断 stats ページ', () => {
  beforeEach(() => {
    filterRef.value = { playerId: null, pair: null, role: null, shotBinKeys: [] }
    refreshRalliesSpy.mockClear()
    statsData.value = {
      playerRates: [{ playerId: 'p0', playerName: '田中', serve: { rate: 0.5, denominator: 2, numerator: 1 }, receive: { rate: null, denominator: 0, numerator: 0 } }],
      pairRates: [], rallyLength: [], isEmpty: false
    }
  })

  it('絞り込み前はテーブル非表示・案内文を表示', () => {
    const w = mountPage()
    expect(w.find('[data-testid="filter-hint"]').exists()).toBe(true)
    expect(w.findComponent(RallyTableStub).exists()).toBe(false)
  })

  it('チャート選択で setFilter + refreshRallies、テーブル表示（遅延取得）', async () => {
    const w = mountPage()
    w.findComponent(RateChartStub).vm.$emit('select', { playerId: 'p0', role: 'serve' })
    await flushPromises()
    expect(refreshRalliesSpy).toHaveBeenCalled()
    expect(w.findComponent(RallyTableStub).exists()).toBe(true)
    expect(w.findComponent(RallyTableStub).props('showMatch')).toBe(true)
  })

  it('isEmpty=true では空状態を表示', () => {
    statsData.value = { playerRates: [], pairRates: [], rallyLength: [], isEmpty: true }
    const w = mountPage()
    expect(w.find('[data-testid="empty"]').exists()).toBe(true)
  })
})
