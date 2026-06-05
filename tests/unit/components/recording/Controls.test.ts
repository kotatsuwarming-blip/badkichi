// @vitest-environment happy-dom
/**
 * ShotButton / UndoButton / RallyControls / PositionControls 単体テスト
 * 方針: happy-dom + @vue/test-utils。UButton はスタブ。click + キーボード (Space/Backspace) の分岐。
 * TASK-0014 / REQ-005 / REQ-006 / REQ-105 / REQ-107 / REQ-110
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// eslint-disable-next-line import/first
import ShotButton from '~/components/recording/ShotButton.vue'
// eslint-disable-next-line import/first
import UndoButton from '~/components/recording/UndoButton.vue'
// eslint-disable-next-line import/first
import RallyControls from '~/components/recording/RallyControls.vue'
// eslint-disable-next-line import/first
import PositionControls from '~/components/recording/PositionControls.vue'

const UButton = {
  props: ['disabled', 'block', 'color', 'variant', 'size', 'icon'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
}
const global = { mocks: { $t: (k: string) => k }, stubs: { UButton } }

function press(key: string, code = '') {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, code }))
}

describe('ShotButton', () => {
  it('クリックで shot を emit', async () => {
    const w = mount(ShotButton, { props: { shotCount: 3 }, global })
    await w.find('[data-testid="shot-button"]').trigger('click')
    expect(w.emitted('shot')).toHaveLength(1)
    expect(w.find('[data-testid="shot-count"]').text()).toContain('3')
  })

  it('Space キーで shot を emit', () => {
    const w = mount(ShotButton, { props: { shotCount: 0 }, global })
    press(' ', 'Space')
    expect(w.emitted('shot')).toHaveLength(1)
  })

  it('disabled の場合は emit しない', async () => {
    const w = mount(ShotButton, { props: { shotCount: 0, disabled: true }, global })
    await w.find('[data-testid="shot-button"]').trigger('click')
    press(' ', 'Space')
    expect(w.emitted('shot')).toBeUndefined()
  })
})

describe('UndoButton', () => {
  it('labelKey=null は disabled で emit しない', () => {
    const w = mount(UndoButton, { props: { labelKey: null }, global })
    press('Backspace')
    expect(w.emitted('undo')).toBeUndefined()
    expect((w.find('[data-testid="undo-button"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('labelKey ありはクリック / Backspace で undo を emit', async () => {
    const w = mount(UndoButton, { props: { labelKey: 'record.undo.shot' }, global })
    await w.find('[data-testid="undo-button"]').trigger('click')
    press('Backspace')
    expect(w.emitted('undo')).toHaveLength(2)
  })
})

describe('RallyControls', () => {
  it('得点A / レット / スキップ を emit', async () => {
    const w = mount(RallyControls, { props: {}, global })
    await w.find('[data-testid="point-a"]').trigger('click')
    await w.find('[data-testid="let"]').trigger('click')
    await w.find('[data-testid="skip"]').trigger('click')
    expect(w.emitted('point')?.[0]).toEqual(['A'])
    expect(w.emitted('let')).toHaveLength(1)
    expect(w.emitted('skip')).toHaveLength(1)
  })
})

describe('PositionControls', () => {
  it('override A を emit / next-set は canAdvance=false で disabled', async () => {
    const w = mount(PositionControls, { props: { canAdvance: false }, global })
    await w.find('[data-testid="override-a"]').trigger('click')
    expect(w.emitted('override')?.[0]).toEqual(['A'])
    expect((w.find('[data-testid="next-set"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('canAdvance=true で next-set が活性 → emit', async () => {
    const w = mount(PositionControls, { props: { canAdvance: true }, global })
    await w.find('[data-testid="next-set"]').trigger('click')
    expect(w.emitted('nextSet')).toHaveLength(1)
  })
})
