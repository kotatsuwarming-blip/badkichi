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

// eslint-disable-next-line import/first
import MatchStats from '~/pages/groups/[id]/matches/[matchId]/stats.vue'

const paneSeekSpy = vi.fn()
const RateChartStub = { props: ['entries', 'mode'], emits: ['select'], template: '<div data-testid="rate-chart" />' }
const RallyTableStub = { props: ['rows', 'names'], emits: ['select'], template: '<div data-testid="table" />' }
const stubs = {
  UButton: { props: ['to'], template: '<button @click="$emit(\'click\')"><slot /></button>' },
  StatsGlobalFilterBar: { props: ['players', 'matchesMeta', 'globalFilter', 'includedMatchIds', 'showPeriod'], template: '<div data-testid="filter-bar" />' },
  StatsEmptyState: { template: '<div data-testid="empty" />' },
  StatsRateChart: RateChartStub,
  StatsPositionToggle: { props: ['position'], template: '<div data-testid="position-toggle" />' },
  StatsRallyLengthChart: { props: ['bins', 'selectedKeys'], template: '<div />' },
  StatsRallyTable: RallyTableStub,
  StatsVideoPane: { props: ['source', 'rallyMarkersMs'], methods: { seekToMs(ms: number) { paneSeekSpy(ms) } }, template: '<div data-testid="pane" />' }
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
})
