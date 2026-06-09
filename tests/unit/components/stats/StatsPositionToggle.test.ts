// @vitest-environment happy-dom
/**
 * StatsPositionToggle 単体テスト
 * 両方(null)/右/左 の選択 emit と選択中ハイライト。受け入れ2026-06-10
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// eslint-disable-next-line import/first
import StatsPositionToggle from '~/components/stats/StatsPositionToggle.vue'

const global = { mocks: { $t: (k: string) => k } }

describe('StatsPositionToggle', () => {
  it('右クリックで change("right") を emit', async () => {
    const w = mount(StatsPositionToggle, { props: { position: null }, global })
    await w.find('[data-testid="pos-right"]').trigger('click')
    expect(w.emitted('change')![0][0]).toBe('right')
  })
  it('両方クリックで change(null) を emit', async () => {
    const w = mount(StatsPositionToggle, { props: { position: 'right' }, global })
    await w.find('[data-testid="pos-all"]').trigger('click')
    expect(w.emitted('change')![0][0]).toBeNull()
  })
  it('選択中はハイライト(is-selected)', () => {
    const w = mount(StatsPositionToggle, { props: { position: 'left' }, global })
    expect(w.find('[data-testid="pos-left"]').classes()).toContain('is-selected')
    expect(w.find('[data-testid="pos-right"]').classes()).not.toContain('is-selected')
  })
})
