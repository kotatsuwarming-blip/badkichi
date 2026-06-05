// @vitest-environment happy-dom
/**
 * MatchFormModal.vue 単体テスト
 *
 * テスト方針 (PlayerFormModal.test.ts 踏襲):
 *   - happy-dom + @vue/test-utils。Nuxt UI（U*）は最小スタブ。
 *   - vue-i18n を mock（t はキーをそのまま返す）。
 *   - usePlayers / useCreateMatch / useUpdateMatch / useToastErrors は vi.mock でスパイ化。
 *   - matchFormSchema は実物（検証分岐の真値を確認）。最小境界 + 分岐網羅のみ。
 *
 * 注: 検証エラーキーは match-form.ts の実 message と一致（invalid_match_date / invalid_youtube_url 等）。
 * 注: 4 選手重複は UI の他枠除外（NFR-202）で構造的に発生しないため component では検証せず、
 *     schema の distinct refine は match-form.test.ts TC7 でカバー。
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

const P1 = '11111111-1111-1111-1111-111111111111'
const P2 = '22222222-2222-2222-2222-222222222222'
const P3 = '33333333-3333-3333-3333-333333333333'
const P4 = '44444444-4444-4444-4444-444444444444'
const P5 = '55555555-5555-5555-5555-555555555555'

const { createMatch, updateMatch, showError, playersRef } = vi.hoisted(() => {
  const createMatch = vi.fn(() => Promise.resolve({ data: { id: 'm1' }, error: null }))
  const updateMatch = vi.fn(() => Promise.resolve({ data: { id: 'm1' }, error: null }))
  const showError = vi.fn()
  const playersRef = { value: [] as { id: string, name: string }[] }
  return { createMatch, updateMatch, showError, playersRef }
})

vi.mock('~/composables/usePlayers', () => ({
  usePlayers: () => ({ data: playersRef })
}))
vi.mock('~/composables/useCreateMatch', () => ({
  useCreateMatch: () => ({ createMatch, pending: ref(false) })
}))
vi.mock('~/composables/useUpdateMatch', () => ({
  useUpdateMatch: () => ({ updateMatch, pending: ref(false) })
}))
vi.mock('~/composables/useToastErrors', () => ({
  useToastErrors: () => ({ showError })
}))

// eslint-disable-next-line import/first
import MatchFormModal from '~/components/matches/MatchFormModal.vue'

const stubs = {
  UModal: {
    inheritAttrs: false,
    props: ['open', 'title'],
    emits: ['update:open'],
    template: '<div v-if="open">{{ title }}<slot name="body" /><slot name="footer" /></div>'
  },
  UFormField: {
    inheritAttrs: false,
    props: ['label', 'name', 'error'],
    template: '<div><slot />{{ error }}</div>'
  },
  UInput: {
    inheritAttrs: false,
    props: ['modelValue', 'placeholder', 'type'],
    emits: ['update:modelValue'],
    template: '<input :type="type || \'text\'" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  USelectMenu: {
    inheritAttrs: false,
    props: ['modelValue', 'items', 'placeholder', 'valueKey'],
    emits: ['update:modelValue'],
    template: '<select :value="modelValue ?? \'\'" @change="$emit(\'update:modelValue\', $event.target.value)"><option value="">--</option><option v-for="it in items" :key="it.value" :value="it.value">{{ it.label }}</option></select>'
  },
  URadioGroup: {
    inheritAttrs: false,
    props: ['modelValue', 'items'],
    emits: ['update:modelValue'],
    template: '<div class="radio"><label v-for="it in items" :key="it.value"><input type="radio" :value="it.value" :checked="modelValue === it.value" @change="$emit(\'update:modelValue\', it.value)" />{{ it.label }}</label></div>'
  },
  UButton: {
    inheritAttrs: false,
    props: ['label', 'loading', 'disabled', 'color', 'variant', 'type'],
    template: '<button v-bind="$attrs"><slot />{{ label }}</button>'
  }
}

function mountModal(props: Record<string, unknown> = {}) {
  return mount(MatchFormModal, {
    props: { mode: 'create' as const, open: true, ...props },
    global: { stubs }
  })
}

// text input (name / youtube url) のみ取得
function textInputs(wrapper: ReturnType<typeof mountModal>) {
  return wrapper.findAll('input[type=text]')
}

// 保存ボタン（footer）をクリックして submit
async function clickSave(wrapper: ReturnType<typeof mountModal>) {
  const save = wrapper.findAll('button').find(b => b.text() === 'matches.save')
  await save!.trigger('click')
}

async function selectFourPlayers(wrapper: ReturnType<typeof mountModal>, ids: [string, string, string, string]) {
  const selects = wrapper.findAll('select')
  for (let i = 0; i < 4; i++) {
    await selects[i]!.setValue(ids[i])
  }
}

describe('MatchFormModal.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    playersRef.value = [
      { id: P1, name: 'A' },
      { id: P2, name: 'B' },
      { id: P3, name: 'C' },
      { id: P4, name: 'D' },
      { id: P5, name: 'E' }
    ]
    createMatch.mockResolvedValue({ data: { id: 'm1' }, error: null })
    updateMatch.mockResolvedValue({ data: { id: 'm1' }, error: null })
  })

  it('TC1: 試合名 51 字は inline error・createMatch 未呼出 (EDGE-011)', async () => {
    const wrapper = mountModal()
    await textInputs(wrapper)[0]!.setValue('あ'.repeat(51))
    await clickSave(wrapper)
    await flushPromises()
    expect(wrapper.text()).toContain('errors.invalid_match_name')
    expect(createMatch).not.toHaveBeenCalled()
  })

  it('TC2: 試合日付未入力は inline error・createMatch 未呼出 (EDGE-012)', async () => {
    const wrapper = mountModal()
    await wrapper.find('input[type=date]').setValue('')
    await clickSave(wrapper)
    await flushPromises()
    expect(wrapper.text()).toContain('errors.invalid_match_date')
    expect(createMatch).not.toHaveBeenCalled()
  })

  it('TC3: youtube 形式不正は inline error・createMatch 未呼出 (EDGE-004)', async () => {
    const wrapper = mountModal()
    await selectFourPlayers(wrapper, [P1, P2, P3, P4])
    await textInputs(wrapper)[1]!.setValue('これはURLでない')
    await clickSave(wrapper)
    await flushPromises()
    expect(wrapper.text()).toContain('errors.invalid_youtube_url')
    expect(createMatch).not.toHaveBeenCalled()
  })

  it('TC5: 選手ちょうど4人でも入れ替え可能 (スワップ, NFR-202)', async () => {
    // 選手ちょうど 4 人。全枠を埋めた後、A1 を A2 の選手に変更すると A2 に元の A1 が入る
    playersRef.value = [
      { id: P1, name: 'A' },
      { id: P2, name: 'B' },
      { id: P3, name: 'C' },
      { id: P4, name: 'D' }
    ]
    const wrapper = mountModal()
    await selectFourPlayers(wrapper, [P1, P2, P3, P4])
    await flushPromises()
    // A1(select[0]) を P2 に変更 → A2(select[1]) へ元の P1 がスワップされる
    await wrapper.findAll('select')[0]!.setValue(P2)
    await flushPromises()
    expect((wrapper.findAll('select')[0]!.element as HTMLSelectElement).value).toBe(P2)
    expect((wrapper.findAll('select')[1]!.element as HTMLSelectElement).value).toBe(P1)
  })

  it('TC6: 動画ソース切替で条件付きフィールドが切り替わる', async () => {
    const wrapper = mountModal()
    // 既定 youtube: text input は name + youtubeUrl の 2 個、file input なし
    expect(textInputs(wrapper).length).toBe(2)
    expect(wrapper.find('input[type=file]').exists()).toBe(false)
    // local に切替
    const radios = wrapper.findAll('input[type=radio]')
    await radios[1]!.trigger('change') // local
    await flushPromises()
    // text input は name のみ、file input が出現
    expect(textInputs(wrapper).length).toBe(1)
    expect(wrapper.find('input[type=file]').exists()).toBe(true)
  })

  it('TC7: 有効入力(youtube)で createMatch 呼出・saved emit (ID 正規化)', async () => {
    const wrapper = mountModal()
    await selectFourPlayers(wrapper, [P1, P2, P3, P4])
    await textInputs(wrapper)[1]!.setValue('https://youtu.be/abcdefghijk')
    await clickSave(wrapper)
    await flushPromises()
    expect(createMatch).toHaveBeenCalledTimes(1)
    expect(createMatch).toHaveBeenCalledWith(expect.objectContaining({
      teamAPlayer1Id: P1,
      teamBPlayer2Id: P4,
      videoSourceType: 'youtube',
      videoSourceUrl: 'abcdefghijk' // extractYoutubeId 正規化
    }))
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  it('TC8: 保存失敗で showError 呼出・saved 未 emit (EDGE-010)', async () => {
    createMatch.mockResolvedValueOnce({ data: null, error: { message: 'rls' } })
    const wrapper = mountModal()
    await selectFourPlayers(wrapper, [P1, P2, P3, P4])
    await textInputs(wrapper)[1]!.setValue('abcdefghijk')
    await clickSave(wrapper)
    await flushPromises()
    expect(showError).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('TC9: edit モードでプリフィルされ updateMatch を呼ぶ (REQ-003)', async () => {
    const match = {
      id: 'm1',
      name: '旧名',
      matchDate: '2026-06-01',
      teamA: [{ id: P1, name: 'A' }, { id: P2, name: 'B' }],
      teamB: [{ id: P3, name: 'C' }, { id: P4, name: 'D' }],
      videoSourceType: 'youtube' as const,
      videoSourceUrl: 'abcdefghijk'
    }
    const wrapper = mountModal({ mode: 'edit', match })
    await flushPromises()
    // teamAPlayer2 を P5 に差し替え
    await wrapper.findAll('select')[1]!.setValue(P5)
    await clickSave(wrapper)
    await flushPromises()
    expect(updateMatch).toHaveBeenCalledTimes(1)
    expect(updateMatch.mock.calls[0]![0]).toBe('m1')
    expect(updateMatch.mock.calls[0]![1]).toMatchObject({ teamAPlayer2Id: P5 })
  })
})
