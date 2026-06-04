// @vitest-environment happy-dom
/**
 * players.vue + PlayerFormModal.vue 結合テスト（フロー）
 *
 * 関連タスク: TASK-0009
 * 関連設計: docs/design/player-management/architecture.md / dataflow.md
 *
 * テスト方針:
 *   - happy-dom 環境 + @vue/test-utils。実 players.vue + 実 PlayerFormModal.vue をマウント。
 *   - vue-i18n を mock（t はキーをそのまま返す）。
 *   - composable は共有 in-memory ストアにスタブ化し、refresh() で DOM 更新が連動することを検証。
 *   - Nuxt UI（U*）は最小スタブ（UModal は open 関わらず常時 content slot 描画）。
 *   - PlayersPlayerFormModal を実 PlayerFormModal コンポーネントで解決（global.components）。
 *   - 1 テスト関数内で 一覧→追加→編集→削除 の happy path を順に assert。
 *
 * スタイル: セミコロンなし / no comma dangle（CLAUDE.md ESLint 規約）
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import type { Player } from '~/types/player'

// useI18n は vue-i18n から直接 import するため、キーをそのまま返すフェイクに差し替える
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

// ========== 共有 in-memory ストア ==========
// vi.mock ファクトリより先に評価される必要があるため vi.hoisted で定義する
const { showError } = vi.hoisted(() => {
  const showError = vi.fn()
  return { showError }
})

// ストアはモジュールスコープで管理。テスト内で参照するため let で宣言
let store: Player[] = []
let nextId = 1

// refresh を vi.fn にしつつ、呼ばれたとき data ref を更新する実装を後で注入する
// ここでは後から参照可能な ref を用意する
const playersData = ref<Player[]>([])

vi.mock('~/composables/usePlayers', () => ({
  usePlayers: () => ({
    data: playersData,
    pending: ref(false),
    error: ref(null),
    refresh: vi.fn().mockImplementation(() => {
      playersData.value = [...store]
    })
  })
}))

vi.mock('~/composables/useCreatePlayer', () => ({
  useCreatePlayer: () => ({
    createPlayer: vi.fn().mockImplementation((input: { name: string, handedness: string }) => {
      const player: Player = {
        id: String(nextId++),
        name: input.name,
        handedness: (input.handedness ?? 'unknown') as Player['handedness']
      }
      store.push(player)
      return Promise.resolve({ data: player, error: null })
    }),
    pending: ref(false)
  })
}))

vi.mock('~/composables/useUpdatePlayer', () => ({
  useUpdatePlayer: () => ({
    updatePlayer: vi.fn().mockImplementation((id: string, input: { name: string, handedness: string }) => {
      const idx = store.findIndex(p => p.id === id)
      if (idx !== -1) {
        store[idx] = { ...store[idx], name: input.name, handedness: input.handedness as Player['handedness'] }
      }
      return Promise.resolve({ data: store[idx] ?? null, error: null })
    }),
    pending: ref(false)
  })
}))

vi.mock('~/composables/useDeletePlayer', () => ({
  useDeletePlayer: () => ({
    deletePlayer: vi.fn().mockImplementation((id: string) => {
      store = store.filter(p => p.id !== id)
      return Promise.resolve({ data: null, error: null })
    }),
    pending: ref(false)
  })
}))

vi.mock('~/composables/useToastErrors', () => ({
  useToastErrors: () => ({ showError })
}))

// eslint-disable-next-line import/first
import PlayersPage from '~/pages/groups/[id]/players.vue'
// eslint-disable-next-line import/first
import PlayerFormModal from '~/components/players/PlayerFormModal.vue'

// ========== Nuxt UI 最小スタブ ==========
// UModal: open 関わらず #content slot を常時描画（フォーム入力を DOM で操作できるようにする）
// UForm: submit.prevent をトリガーできる form 要素スタブ
// UInput: v-model（modelValue + update:modelValue）と input 要素を持つスタブ
const stubs = {
  UContainer: {
    inheritAttrs: false,
    template: '<div v-bind="$attrs"><slot /></div>'
  },
  USkeleton: {
    inheritAttrs: false,
    template: '<div v-bind="$attrs" />'
  },
  UButton: {
    inheritAttrs: false,
    props: ['label', 'loading', 'disabled', 'color', 'variant', 'size', 'icon', 'type'],
    template: '<button v-bind="$attrs" :disabled="disabled" :type="type"><slot />{{ label }}</button>'
  },
  UModal: {
    // open prop に関わらず常時 #content slot を描画（DOM でフォームを操作するため）
    inheritAttrs: false,
    props: ['open'],
    emits: ['update:open'],
    template: '<div data-modal :data-open="open"><slot name="content" /></div>'
  },
  UForm: {
    inheritAttrs: false,
    props: ['state'],
    template: '<form v-bind="$attrs"><slot /></form>'
  },
  UFormField: {
    inheritAttrs: false,
    props: ['label', 'name', 'error'],
    template: '<div><slot />{{ error }}</div>'
  },
  UInput: {
    inheritAttrs: false,
    props: ['modelValue', 'placeholder', 'autofocus'],
    emits: ['update:modelValue'],
    template: '<input :value="modelValue" v-bind="$attrs" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  USelect: {
    inheritAttrs: false,
    props: ['modelValue', 'items'],
    emits: ['update:modelValue'],
    template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="i in (items||[])" :key="i.value" :value="i.value">{{ i.label }}</option></select>'
  }
}

describe('players.vue + PlayerFormModal.vue フロー結合テスト', () => {
  beforeEach(() => {
    // ストアリセット
    store = []
    nextId = 1
    playersData.value = []
    vi.clearAllMocks()
  })

  // happy path: 一覧→追加→編集→削除
  it('一覧→追加→編集→削除 の happy path が連動する (TC-flow-01)', async () => {
    // PlayersPlayerFormModal を実 PlayerFormModal コンポーネントで解決する
    const wrapper = mount(PlayersPage, {
      global: {
        stubs,
        components: {
          PlayersPlayerFormModal: PlayerFormModal
        }
      }
    })

    // ─── Step 1: 初期マウント → 空状態 ───
    await flushPromises()
    expect(wrapper.text()).toContain('players.empty')

    // ─── Step 2: 追加 CTA クリック → モーダル open → name 入力 → 保存 ───
    // 空状態の CTA ボタンをクリック（最初のボタン = 追加 CTA）
    const buttons = wrapper.findAll('button')
    const addBtn = buttons.find(b => b.text().includes('players.add'))
    expect(addBtn).toBeDefined()
    await addBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    // UModal スタブが常時 content slot を描画するため、input が DOM にある
    const input = wrapper.find('input')
    expect(input.exists()).toBe(true)

    await input.setValue('山田')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    // 保存後: usePlayers.refresh() が呼ばれ store → playersData が更新 → '山田' が一覧に出る
    expect(wrapper.text()).toContain('山田')
    expect(wrapper.text()).not.toContain('players.empty')

    // ─── Step 3: 編集ボタンクリック → name を '佐藤' に変更 → 保存 ───
    const editBtn = wrapper.find('[aria-label="players.edit"]')
    expect(editBtn.exists()).toBe(true)
    await editBtn.trigger('click')
    await wrapper.vm.$nextTick()

    // プリフィルされた input の value が '山田' になっていることを確認
    const editInput = wrapper.find('input')
    expect(editInput.element.value).toBe('山田')

    await editInput.setValue('佐藤')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    // 保存後: '佐藤' に更新、'山田' は消える
    expect(wrapper.text()).toContain('佐藤')
    expect(wrapper.text()).not.toContain('山田')

    // ─── Step 4: 削除ボタンクリック → 行が消え再び空状態 ───
    const deleteBtn = wrapper.find('[aria-label="players.delete"]')
    expect(deleteBtn.exists()).toBe(true)
    await deleteBtn.trigger('click')
    await flushPromises()

    // 削除後: store が空 → playersData が空 → 空状態が表示
    expect(wrapper.text()).toContain('players.empty')
    expect(wrapper.text()).not.toContain('佐藤')
  })
})
