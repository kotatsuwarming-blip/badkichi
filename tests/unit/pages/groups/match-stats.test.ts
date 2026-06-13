// @vitest-environment happy-dom
/**
 * 試合単位 stats.vue ページ 単体テスト（配線・分岐）
 * 方針: composable を mock、Stats* / U* 子をスタブ。空状態・テーブル配線・モード切替を検証。
 * TASK-0016 / REQ-103 / REQ-006 / REQ-004
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
const statsData = ref<unknown>({
  playerRates: [{ playerId: 'p0', playerName: '田中', serve: { rate: 0.5, denominator: 2, numerator: 1 }, receive: { rate: null, denominator: 0, numerator: 0 } }],
  pairRates: [{ player1Id: 'p0', player2Id: 'p1', pairLabel: '田中 / 佐藤', serve: { rate: 0.5, denominator: 2, numerator: 1 }, receive: { rate: null, denominator: 0, numerator: 0 } }],
  rallyLength: [],
  isEmpty: false
})
const ralliesData = ref<unknown>([{ rally_id: 'r1', video_start_timestamp_ms: 1000 }])

vi.mock('~/composables/useMatchForRecording', () => ({ useMatchForRecording: () => ({ data: matchData, refresh: vi.fn() }) }))
vi.mock('~/composables/useMatchStats', () => ({ useMatchStats: () => ({ data: statsData, refresh: vi.fn() }) }))
vi.mock('~/composables/useMatchRallies', () => ({ useMatchRallies: () => ({ data: ralliesData, refresh: vi.fn() }) }))
vi.mock('~/composables/useStatsFilter', () => ({
  useStatsFilter: () => ({
    filter: ref({ playerId: null, pair: null, role: null, shotBinKeys: [] }),
    setFilter: vi.fn(),
    clear: vi.fn(),
    apply: (rows: unknown[]) => rows,
    toQueryArgs: vi.fn()
  })
}))

// eslint-disable-next-line import/first
import MatchStats from '~/pages/groups/[id]/matches/[matchId]/stats.vue'

const paneSeekSpy = vi.fn()
const RateChartStub = { props: ['entries', 'mode'], template: '<div data-testid="rate-chart" />' }
const RallyTableStub = { props: ['rows', 'names'], emits: ['select'], template: '<div data-testid="table" />' }
const stubs = {
  UButton: { props: ['to'], template: '<button @click="$emit(\'click\')"><slot /></button>' },
  StatsEmptyState: { template: '<div data-testid="empty" />' },
  StatsRateChart: RateChartStub,
  StatsRallyLengthChart: { props: ['bins', 'selectedKeys'], template: '<div />' },
  StatsRallyTable: RallyTableStub,
  StatsVideoPane: {
    props: ['source', 'rallyMarkersMs'],
    methods: { seekToMs(ms: number) { paneSeekSpy(ms) } },
    template: '<div data-testid="pane" />'
  }
}

function mountPage() {
  return mount(MatchStats, { global: { mocks: { $t: (k: string) => k }, stubs } })
}

describe('試合単位 stats ページ', () => {
  it('isEmpty=false ではグリッド表示・テーブルに行を渡す', () => {
    const w = mountPage()
    expect(w.find('[data-testid="empty"]').exists()).toBe(false)
    expect(w.findComponent(RallyTableStub).props('rows')).toHaveLength(1)
  })

  it('モード切替でチャートの entries がペアに変わる', async () => {
    const w = mountPage()
    expect(w.findComponent(RateChartStub).props('mode')).toBe('player')
    await w.find('[data-testid="mode-pair"]').trigger('click')
    expect(w.findComponent(RateChartStub).props('mode')).toBe('pair')
    expect((w.findComponent(RateChartStub).props('entries') as unknown[]).length).toBe(1)
  })

  it('isEmpty=true では空状態を表示', async () => {
    statsData.value = { playerRates: [], pairRates: [], rallyLength: [], isEmpty: true }
    const w = mountPage()
    expect(w.find('[data-testid="empty"]').exists()).toBe(true)
    statsData.value = { playerRates: [], pairRates: [], rallyLength: [], isEmpty: false }
  })

  it('結合: ラリー行選択で埋め込みプレーヤーが該当 ms へシーク (REQ-007/011)', async () => {
    paneSeekSpy.mockClear()
    const w = mountPage()
    w.findComponent(RallyTableStub).vm.$emit('select', { rally_id: 'r1', video_start_timestamp_ms: 1000 })
    await w.vm.$nextTick()
    expect(paneSeekSpy).toHaveBeenCalledWith(1000)
  })
})
