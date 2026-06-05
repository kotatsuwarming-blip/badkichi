// @vitest-environment happy-dom
/**
 * SetSetupForm.vue 単体テスト (smoke)
 * 方針: happy-dom + @vue/test-utils。U* はスタブ。既定値で submit → buildSetInput 経由で正しい payload を emit。
 * TASK-0016 / REQ-002 / REQ-003
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// eslint-disable-next-line import/first
import SetSetupForm from '~/components/recording/SetSetupForm.vue'

const passthrough = { template: '<div><slot /></div>' }
const inputStub = { props: ['modelValue', 'items', 'type'], template: '<input />' }
const stubs = {
  UFormField: passthrough,
  UInput: inputStub,
  USwitch: inputStub,
  URadioGroup: inputStub,
  USelect: inputStub,
  UButton: { props: ['type', 'color'], emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' }
}

const roster = [
  { playerId: 'A1', name: '佐藤', team: 'A' as const },
  { playerId: 'A2', name: '鈴木', team: 'A' as const },
  { playerId: 'B1', name: '高橋', team: 'B' as const },
  { playerId: 'B2', name: '田中', team: 'B' as const }
]

describe('SetSetupForm', () => {
  it('既定値で submit すると setup + positions を emit する', async () => {
    const w = mount(SetSetupForm, {
      props: { roster, setNumber: 1, suggestedFirstServingTeam: 'B' },
      global: { mocks: { $t: (k: string) => k }, stubs }
    })
    await w.find('[data-testid="set-setup-form"]').trigger('submit')
    const payload = w.emitted('submit')?.[0]?.[0] as { setup: { firstServingTeam: string }, positions: unknown[] }
    expect(payload.setup.firstServingTeam).toBe('B') // suggested を既定
    expect(payload.positions).toHaveLength(4)
  })
})
