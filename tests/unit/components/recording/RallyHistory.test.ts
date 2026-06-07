// @vitest-environment happy-dom
/**
 * RallyHistory.vue 単体テスト
 * 方針: happy-dom + @vue/test-utils。UButton スタブ。新しい順 / 未確定バッジ / ジャンプ emit。
 * TASK-0015 / REQ-009 / EDGE-003
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { RallyHistoryItem } from '~/types/match-recording'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// eslint-disable-next-line import/first
import RallyHistory from '~/components/recording/RallyHistory.vue'

const UButton = {
  props: ['size', 'variant', 'icon', 'ariaLabel'],
  emits: ['click'],
  template: '<button @click="$emit(\'click\', $event)"><slot /></button>'
}
const names = { p1: '佐藤', p2: '鈴木', p3: '高橋', p4: '田中' }

const items: RallyHistoryItem[] = [
  { rallyNumber: 1, servingTeam: 'A', serverPlayerId: 'p1', receiverPlayerId: 'p3', pointWinner: 'A', isLet: false, isPointConfirmed: true, shotCount: 3, videoStartTimestampMs: 1000 },
  { rallyNumber: 2, servingTeam: 'A', serverPlayerId: 'p2', receiverPlayerId: 'p4', pointWinner: null, isLet: false, isPointConfirmed: false, shotCount: 0, videoStartTimestampMs: null }
]

function mountHistory(list: RallyHistoryItem[]) {
  return mount(RallyHistory, { props: { items: list, names }, global: { mocks: { $t: (k: string) => k }, stubs: { UButton } } })
}

describe('RallyHistory', () => {
  it('新しい順 (降順) に並べ、未確定行にバッジ class を付ける', () => {
    const w = mountHistory(items)
    const rows = w.findAll('.row')
    expect(rows[0].attributes('data-testid')).toBe('history-row-2') // 新しい順
    expect(rows[0].classes()).toContain('is-unconfirmed')
    expect(rows[1].classes()).not.toContain('is-unconfirmed')
  })

  it('各行にサーバーとレシーバーの両方の名前を表示する', () => {
    const w = mountHistory(items)
    const row1 = w.find('[data-testid="history-row-1"]')
    expect(row1.text()).toContain('佐藤') // server p1
    expect(row1.text()).toContain('高橋') // receiver p3
    expect(w.find('[data-testid="history-legend"]').exists()).toBe(true)
  })

  it('ジャンプ可能行 (ms あり) で jump を ms 付きで emit', async () => {
    const w = mountHistory(items)
    await w.find('[data-testid="jump-1"]').trigger('click')
    expect(w.emitted('jump')?.[0]).toEqual([1000])
  })

  it('ms=null の行はジャンプボタンを描画しない', () => {
    const w = mountHistory(items)
    expect(w.find('[data-testid="jump-2"]').exists()).toBe(false)
  })

  it('0 件は empty 表示', () => {
    const w = mountHistory([])
    expect(w.find('[data-testid="history-empty"]').exists()).toBe(true)
  })
})
