// @vitest-environment happy-dom
/**
 * TASK-0010 受入: matches.vue 通しフロー結合テスト (happy path 1 本)
 *
 * in-memory 連動ストアで useMatches/useDeleteMatch/usePlayers を連動させ、
 * 空状態 → 追加(saved→refresh) → 編集(saved→refresh) → 削除(確認承認→refresh) で
 * 一覧 DOM が更新されることを 1 シナリオで確認する。異常系は各単体テストが網羅済み。
 */

import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'g1' } }) }))

const { store, showError } = vi.hoisted(() => ({
  store: { value: [] as { id: string, name: string | null, matchDate: string, teamA: { id: string, name: string }[], teamB: { id: string, name: string }[], videoSourceType: string, videoSourceUrl: string }[] },
  showError: vi.fn()
}))

vi.mock('~/composables/useMatches', () => {
  const matchesRef = ref(store.value.slice())
  return {
    useMatches: () => ({
      data: matchesRef,
      pending: ref(false),
      error: ref(null),
      refresh: () => {
        matchesRef.value = store.value.slice()
        return Promise.resolve()
      }
    })
  }
})
vi.mock('~/composables/usePlayers', () => ({
  usePlayers: () => ({ data: ref([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }]) })
}))
vi.mock('~/composables/useDeleteMatch', () => ({
  useDeleteMatch: () => ({
    deleteMatch: (id: string) => {
      store.value = store.value.filter(m => m.id !== id)
      return Promise.resolve({ data: null, error: null })
    },
    pending: ref(false)
  })
}))
vi.mock('~/composables/useToastErrors', () => ({ useToastErrors: () => ({ showError }) }))

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
  UAlert: { props: ['title', 'color', 'variant'], template: '<div>{{ title }}<slot name="actions" /></div>' },
  USkeleton: { template: '<div />' },
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

function btnByText(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').find(b => b.text() === text)
}

const match1 = {
  id: '1',
  name: '横浜大会',
  matchDate: '2026-06-01',
  teamA: [{ id: 'p1', name: '山' }, { id: 'p2', name: '田' }],
  teamB: [{ id: 'p3', name: '佐' }, { id: 'p4', name: '藤' }],
  videoSourceType: 'youtube',
  videoSourceUrl: 'abcdefghijk'
}

describe('matches.vue 通しフロー (TASK-0010)', () => {
  it('空状態 → 追加 → 編集 → 削除 で一覧 DOM が連動する', async () => {
    store.value = []
    const wrapper = mount(MatchesPage, { global: { stubs } })

    // 1. 空状態
    expect(wrapper.text()).toContain('matches.empty')

    // 2. 追加: フォームが保存（store へ反映済み）→ saved emit → onSaved が refresh
    store.value = [{ ...match1 }]
    await wrapper.findComponent('.form-modal').vm.$emit('saved')
    await flushPromises()
    expect(wrapper.text()).toContain('横浜大会')

    // 3. 編集: 試合名を変更して保存 → saved → refresh
    store.value = [{ ...match1, name: '横浜大会(改)' }]
    await wrapper.findComponent('.form-modal').vm.$emit('saved')
    await flushPromises()
    expect(wrapper.text()).toContain('横浜大会(改)')

    // 4. 削除: 削除ボタン → 確認ダイアログ承認 → deleteMatch(store除去) → refresh → 空状態
    await btnByText(wrapper, 'matches.delete')!.trigger('click')
    expect(wrapper.text()).toContain('matches.deleteConfirmTitle')
    await btnByText(wrapper, 'matches.deleteConfirmApprove')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('matches.empty')
    expect(wrapper.text()).not.toContain('横浜大会(改)')
  })
})
