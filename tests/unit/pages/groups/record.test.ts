// @vitest-environment happy-dom
/**
 * record.vue ページ統合 単体テスト (配線・分岐)
 * 方針: composable を mock。VideoSource 分岐 (youtube→player即構築 / local→再選択) と
 *       gameState 未設定→セットアップ表示 を検証。Recording* 子 / U* はスタブ。
 * TASK-0017 / REQ-001 / REQ-004 / REQ-108
 */
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'g1', matchId: 'm1' } }) }))

// モジュールスコープ (vi.mock ファクトリは遅延実行されるため参照可能、players.flow パターン)
const matchData = ref<unknown>(null)
const sessionRefs = {
  gameState: ref(null), currentRally: ref(null), history: ref([]), currentSetNumber: ref(null),
  setWinner: ref(null), matchWinner: ref(null), suggestedFirstServingTeam: ref(null), undoLabelKey: ref(null)
}

vi.mock('~/composables/useMatchForRecording', () => ({
  useMatchForRecording: () => ({ data: matchData })
}))
vi.mock('~/composables/useVideoPlayer', () => ({
  useVideoPlayer: () => ({ state: ref({}), controls: { getCurrentTimeMs: vi.fn(() => null), seekToMs: vi.fn() }, attach: vi.fn(), detach: vi.fn() })
}))
vi.mock('~/composables/useRecordingSession', () => ({
  useRecordingSession: () => ({
    ...sessionRefs,
    configureAndStartSet: vi.fn(), advanceToNextSet: vi.fn(), recordShot: vi.fn(), recordPoint: vi.fn(),
    recordLet: vi.fn(), skipRally: vi.fn(), confirmSkipped: vi.fn(), recordOverride: vi.fn(),
    undoLast: vi.fn(), allSynced: ref(true)
  })
}))

// eslint-disable-next-line import/first
import Record from '~/pages/groups/[id]/matches/[matchId]/record.vue'

const stubs = {
  UButton: { props: ['to'], template: '<button><slot /></button>' },
  RecordingSetSetupForm: { template: '<div data-testid="setup-stub" />' },
  RecordingVideoPane: true,
  RecordingScoreHeader: true,
  RecordingCourtDiagram: true,
  RecordingShotButton: true,
  RecordingUndoButton: true,
  RecordingRallyControls: true,
  RecordingPositionControls: true,
  RecordingRallyHistory: true
}

function mountPage() {
  return mount(Record, { global: { mocks: { $t: (k: string) => k }, stubs } })
}

describe('record.vue', () => {
  it('youtube: match 解決で player が即構築され、再選択 picker を出さない', async () => {
    matchData.value = { id: 'm1', name: 'テスト', videoSourceType: 'youtube', videoSourceUrl: 'https://youtu.be/x', roster: [] }
    const w = mountPage()
    await flushPromises()
    expect(w.find('[data-testid="source-picker"]').exists()).toBe(false)
  })

  it('local: player 未構築のため再選択 picker を表示する', async () => {
    matchData.value = { id: 'm1', name: 'テスト', videoSourceType: 'local', videoSourceUrl: 'x.mp4', roster: [] }
    const w = mountPage()
    await flushPromises()
    expect(w.find('[data-testid="source-picker"]').exists()).toBe(true)
  })
})
