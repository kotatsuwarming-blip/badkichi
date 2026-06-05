// @vitest-environment happy-dom
/**
 * matches.vue 一覧ページ 単体テスト
 *
 * テスト方針 (players.vue / PlayerFormModal.test.ts 踏襲):
 *   - happy-dom + @vue/test-utils。Nuxt UI（U*）と MatchFormModal は最小スタブ。
 *   - vue-router(useRoute) / vue-i18n(t) / 各 composable は vi.mock。
 *   - 最小境界 + 分岐網羅のみ。並び順は useMatches クエリ責務のため page では順序保持のみ。
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'g1' } })
}))

const { matchesData, playersData, pendingData, errorData, refresh, deleteMatch, showError } = vi.hoisted(() => ({
  matchesData: { value: [] as unknown[] },
  playersData: { value: [] as unknown[] },
  pendingData: { value: false },
  errorData: { value: null as unknown },
  refresh: vi.fn(() => Promise.resolve()),
  deleteMatch: vi.fn(() => Promise.resolve({ data: null, error: null })),
  showError: vi.fn()
}))

vi.mock('~/composables/useMatches', () => ({
  useMatches: () => ({ data: ref(matchesData.value), pending: ref(pendingData.value), error: ref(errorData.value), refresh })
}))
vi.mock('~/composables/usePlayers', () => ({
  usePlayers: () => ({ data: ref(playersData.value) })
}))
vi.mock('~/composables/useDeleteMatch', () => ({
  useDeleteMatch: () => ({ deleteMatch, pending: ref(false) })
}))
vi.mock('~/composables/useToastErrors', () => ({
  useToastErrors: () => ({ showError })
}))

// eslint-disable-next-line import/first
import MatchesPage from '~/pages/groups/[id]/matches.vue'

const stubs = {
  UContainer: { template: '<div><slot /></div>' },
  UButton: {
    inheritAttrs: false,
    props: ['label', 'disabled', 'loading', 'color', 'variant', 'size', 'icon', 'to', 'ariaLabel'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot />{{ label }}</button>'
  },
  UAlert: {
    props: ['title', 'color', 'variant'],
    template: '<div class="alert">{{ title }}<slot name="actions" /></div>'
  },
  USkeleton: { template: '<div class="skeleton" />' },
  UModal: {
    inheritAttrs: false,
    props: ['open'],
    emits: ['update:open'],
    template: '<div v-if="open" class="modal"><slot name="content" /></div>'
  },
  MatchesMatchFormModal: {
    inheritAttrs: false,
    props: ['open', 'mode', 'match'],
    emits: ['update:open', 'saved'],
    template: '<div class="form-modal" />'
  }
}

function mountPage() {
  return mount(MatchesPage, { global: { stubs } })
}

function btnByText(wrapper: ReturnType<typeof mountPage>, text: string) {
  return wrapper.findAll('button').find(b => b.text() === text)
}

const matchWithName = {
  id: '1',
  name: '横浜大会',
  matchDate: '2026-06-01',
  teamA: [{ id: 'p1', name: '山田' }, { id: 'p2', name: '佐藤' }],
  teamB: [{ id: 'p3', name: '鈴木' }, { id: 'p4', name: '田中' }],
  videoSourceType: 'local',
  videoSourceUrl: 'm.mp4'
}
const fourPlayers = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }]

describe('matches.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    matchesData.value = [matchWithName]
    playersData.value = fourPlayers
    pendingData.value = false
    errorData.value = null
  })

  it('TC1: 試合名ありの行が描画される', () => {
    const wrapper = mountPage()
    expect(wrapper.text()).toContain('横浜大会')
    expect(wrapper.text()).toContain('2026-06-01')
  })

  it('TC2: 試合名 null は対戦カードを表示 (NFR-203)', () => {
    matchesData.value = [{ ...matchWithName, name: null }]
    const wrapper = mountPage()
    expect(wrapper.text()).toContain('山田・佐藤')
    expect(wrapper.text()).toContain('matches.versus')
    expect(wrapper.text()).toContain('鈴木・田中')
  })

  it('TC3: 0 件で空状態説明 + CTA (REQ-201)', () => {
    matchesData.value = []
    const wrapper = mountPage()
    expect(wrapper.text()).toContain('matches.empty')
    expect(btnByText(wrapper, 'matches.add')).toBeTruthy()
  })

  it('TC4: 選手 4 人未満で追加 disabled + 導線 (REQ-203)', () => {
    playersData.value = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]
    const wrapper = mountPage()
    const add = btnByText(wrapper, 'matches.add')
    expect((add!.element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.text()).toContain('matches.notEnoughPlayers')
    expect(wrapper.text()).toContain('matches.goToPlayers')
  })

  it('TC5: 削除ボタン → 確認ダイアログ → 承認で deleteMatch + refresh (REQ-105)', async () => {
    const wrapper = mountPage()
    await btnByText(wrapper, 'matches.delete')!.trigger('click')
    // 確認ダイアログが開く
    expect(wrapper.text()).toContain('matches.deleteConfirmTitle')
    await btnByText(wrapper, 'matches.deleteConfirmApprove')!.trigger('click')
    await flushPromises()
    expect(deleteMatch).toHaveBeenCalledWith('1')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('TC6: 削除確認でキャンセル → deleteMatch を呼ばない (REQ-105)', async () => {
    const wrapper = mountPage()
    await btnByText(wrapper, 'matches.delete')!.trigger('click')
    await btnByText(wrapper, 'matches.cancel')!.trigger('click')
    await flushPromises()
    expect(deleteMatch).not.toHaveBeenCalled()
  })

  it('TC7: 追加 CTA で モーダルが create mode で open になる', async () => {
    const wrapper = mountPage()
    await btnByText(wrapper, 'matches.add')!.trigger('click')
    const modal = wrapper.findComponent('.form-modal')
    expect(modal.props('open')).toBe(true)
    expect(modal.props('mode')).toBe('create')
  })
})
