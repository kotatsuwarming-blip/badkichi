// @vitest-environment happy-dom
/**
 * PlayerFormModal.vue 単体テスト
 *
 * 関連タスク: TASK-0007
 * 関連設計: docs/design/player-management/architecture.md / dataflow.md
 *
 * テスト方針:
 *   - happy-dom 環境 + @vue/test-utils。Nuxt UI（U*）は最小スタブに差し替え。
 *   - vue-i18n を auto-import mock（t はキーをそのまま返す）。
 *   - useCreatePlayer / useUpdatePlayer / useToastErrors は vi.mock でスパイ化。
 *   - 最小境界値 + 分岐網羅のみ（feedback_test_coverage）。冗長ケースは作らない。
 *
 * スタイル: セミコロンなし / no comma dangle（CLAUDE.md ESLint 規約）
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'

// useI18n は vue-i18n から直接 import するため、キーをそのまま返すフェイクに差し替える
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

// composable モックを vi.hoisted で TDZ 回避しながら先に定義
const {
  createPlayer,
  updatePlayer,
  showError
} = vi.hoisted(() => {
  const createPlayer = vi.fn(() =>
    Promise.resolve({ data: { id: '1', name: 'a', handedness: 'unknown' }, error: null })
  )
  const updatePlayer = vi.fn(() =>
    Promise.resolve({ data: { id: 'p1', name: '新名', handedness: 'left' }, error: null })
  )
  const showError = vi.fn()
  return { createPlayer, updatePlayer, showError }
})

vi.mock('~/composables/useCreatePlayer', () => ({
  useCreatePlayer: () => ({ createPlayer, pending: ref(false) })
}))

vi.mock('~/composables/useUpdatePlayer', () => ({
  useUpdatePlayer: () => ({ updatePlayer, pending: ref(false) })
}))

vi.mock('~/composables/useToastErrors', () => ({
  useToastErrors: () => ({ showError })
}))

// eslint-disable-next-line import/first
import PlayerFormModal from '~/components/players/PlayerFormModal.vue'

// Nuxt UI コンポーネントの最小スタブ（イベント/属性が素の DOM に届くようにする）
// UInput: v-model（modelValue + update:modelValue）と input 要素を持つスタブ
// UForm: submit.prevent をトリガーできる form 要素スタブ
const stubs = {
  UModal: {
    inheritAttrs: false,
    props: ['open'],
    emits: ['update:open'],
    template: '<div v-if="open"><slot name="content" /></div>'
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
    template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>'
  },
  UButton: {
    inheritAttrs: false,
    props: ['label', 'loading', 'disabled', 'color', 'variant', 'type'],
    template: '<button v-bind="$attrs"><slot />{{ label }}</button>'
  }
}

function mountModal(props: Record<string, unknown> = {}) {
  return mount(PlayerFormModal, {
    props: {
      mode: 'create' as const,
      open: true,
      ...props
    },
    global: { stubs }
  })
}

describe('PlayerFormModal.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createPlayer.mockResolvedValue({ data: { id: '1', name: 'a', handedness: 'unknown' }, error: null })
    updatePlayer.mockResolvedValue({ data: { id: 'p1', name: '新名', handedness: 'left' }, error: null })
  })

  // TC1: 空白のみ → inline error・createPlayer 未呼出 (TC-002-B01 / EDGE-001 / EDGE-007)
  it('空白のみは inline error を出し createPlayer を呼ばない (TC-002-B01 / EDGE-007)', async () => {
    const wrapper = mountModal()
    await wrapper.find('input').setValue('   ')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('errors.invalid_player_name')
    expect(createPlayer).not.toHaveBeenCalled()
  })

  // TC2: 51 字 → inline error・createPlayer 未呼出 (TC-002-B02 / EDGE-002 / EDGE-007)
  it('51 字の name は inline error を出し createPlayer を呼ばない (TC-002-B02 / EDGE-007)', async () => {
    const wrapper = mountModal()
    await wrapper.find('input').setValue('a'.repeat(51))
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('errors.invalid_player_name')
    expect(createPlayer).not.toHaveBeenCalled()
  })

  // TC3: name のみ入力 → handedness=unknown で createPlayer 呼出 (TC-002-01 / EDGE-003 / NFR-202)
  it('name のみ入力で handedness=unknown 送信 (TC-002-01 / EDGE-003)', async () => {
    const wrapper = mountModal()
    await wrapper.find('input').setValue('山田')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createPlayer).toHaveBeenCalledWith({ name: '山田', handedness: 'unknown' })
  })

  // TC4: 保存成功 → saved emit (dataflow.md 機能2 成功分岐)
  it('保存成功で saved を emit する', async () => {
    const wrapper = mountModal()
    await wrapper.find('input').setValue('山田')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  // TC5: 保存失敗 → showError 呼出・saved 未 emit (EDGE-008 / error-handling §6④)
  it('保存失敗で showError を呼び saved を emit しない (EDGE-008)', async () => {
    createPlayer.mockResolvedValueOnce({ data: null, error: { message: 'rls' } })
    const wrapper = mountModal()
    await wrapper.find('input').setValue('山田')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(showError).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  // TC6: edit モードでプリフィルされ updatePlayer を呼ぶ (TC-003-01 / dataflow.md 機能3)
  it('edit モードでプリフィルされ updatePlayer を呼ぶ (TC-003-01)', async () => {
    const player = { id: 'p1', name: '旧名', handedness: 'left' as const }
    const wrapper = mountModal({ mode: 'edit', player })
    // name を '新名' に変更
    await wrapper.find('input').setValue('新名')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(updatePlayer).toHaveBeenCalledWith('p1', { name: '新名', handedness: 'left' })
  })
})
