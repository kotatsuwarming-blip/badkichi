// @vitest-environment happy-dom
/**
 * StatsEmptyState 単体テスト
 * REQ-103 / REQ-201
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// eslint-disable-next-line import/first
import StatsEmptyState from '~/components/stats/StatsEmptyState.vue'

const UIcon = { props: ['name'], template: '<i />' }
const global = { mocks: { $t: (k: string) => k }, stubs: { UIcon } }

describe('StatsEmptyState', () => {
  it('既定の空状態メッセージを表示', () => {
    const w = mount(StatsEmptyState, { global })
    expect(w.find('[data-testid="stats-empty"]').text()).toContain('stats.empty.title')
    expect(w.text()).toContain('stats.empty.description')
  })

  it('カスタムキーを表示できる', () => {
    const w = mount(StatsEmptyState, { props: { titleKey: 'stats.table.empty' }, global })
    expect(w.text()).toContain('stats.table.empty')
  })
})
