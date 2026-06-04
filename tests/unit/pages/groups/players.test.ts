// @vitest-environment happy-dom
/**
 * players.vue 単体テスト
 *
 * 関連タスク: TASK-0008
 * 関連設計: docs/design/player-management/architecture.md / dataflow.md
 *
 * テスト方針:
 *   - happy-dom 環境 + @vue/test-utils。Nuxt UI（U*）は最小スタブに差し替え。
 *   - vue-i18n を mock（t はキーをそのまま返す）。
 *   - usePlayers / useDeletePlayer / useToastErrors は vi.mock でスタブ化。
 *   - PlayersPlayerFormModal はテンプレートスタブ（open/mode props を観測できる形）。
 *   - vi.hoisted で fn 系を先に定義し、vi.mock ファクトリ内で ref と組み合わせる方式。
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

// vi.hoisted で fn 系のみ定義（vi.mock ファクトリより先に評価される必要があるもの）
const { refresh, deletePlayer, showError } = vi.hoisted(() => {
  const refresh = vi.fn()
  const deletePlayer = vi.fn(() =>
    Promise.resolve({ data: null, error: null })
  )
  const showError = vi.fn()
  return { refresh, deletePlayer, showError }
})

// playersData は vi.mock ファクトリ内で参照できるよう module スコープで管理
// vi.mock はホイスティングされるため、ref はファクトリ内で生成する
let playersDataValue: Array<{ id: string, name: string, handedness: string }> = [
  { id: '1', name: '山田', handedness: 'right' }
]

vi.mock('~/composables/usePlayers', () => ({
  usePlayers: () => ({
    // ファクトリは呼び出し時に評価されるため playersDataValue を参照できる
    get data() { return ref(playersDataValue) },
    pending: ref(false),
    error: ref(null),
    refresh
  })
}))

vi.mock('~/composables/useDeletePlayer', () => ({
  useDeletePlayer: () => ({
    deletePlayer,
    pending: ref(false)
  })
}))

vi.mock('~/composables/useToastErrors', () => ({
  useToastErrors: () => ({ showError })
}))

// eslint-disable-next-line import/first
import PlayersPage from '~/pages/groups/[id]/players.vue'

// Nuxt UI コンポーネントの最小スタブ（Nuxt インスタンス不在環境でのエラーを回避）
const stubs = {
  // UContainer: div に透過する最小スタブ
  UContainer: {
    inheritAttrs: false,
    template: '<div v-bind="$attrs"><slot /></div>'
  },
  // USkeleton: ローディング表示の最小スタブ
  USkeleton: {
    inheritAttrs: false,
    template: '<div v-bind="$attrs" />'
  },
  // UButton: label を描画しクリックが伝播する最小スタブ（aria-label も渡す）
  UButton: {
    inheritAttrs: false,
    props: ['label', 'loading', 'disabled', 'color', 'variant', 'size', 'icon'],
    template: '<button v-bind="$attrs" :disabled="disabled"><slot />{{ label }}</button>'
  }
}

describe('players.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // デフォルト: 1 件の一覧
    playersDataValue = [{ id: '1', name: '山田', handedness: 'right' }]
    deletePlayer.mockResolvedValue({ data: null, error: null })
  })

  // TC1: 1 件以上で一覧行が描画される（REQ-001 / TC-001-01）
  it('1 件以上で一覧行を描画する (REQ-001)', () => {
    const wrapper = mount(PlayersPage, {
      global: { stubs: { ...stubs, PlayersPlayerFormModal: true } }
    })
    expect(wrapper.text()).toContain('山田')
  })

  // TC2: 0 件で空状態説明文 + CTA を表示（TC-001-03 / REQ-201）
  it('0 件で空状態 + CTA を表示する (TC-001-03 / REQ-201)', () => {
    playersDataValue = []
    const wrapper = mount(PlayersPage, {
      global: { stubs: { ...stubs, PlayersPlayerFormModal: true } }
    })
    expect(wrapper.text()).toContain('players.empty')
    expect(wrapper.text()).toContain('players.add')
  })

  // TC3: 削除ボタンで確認なし deletePlayer + refresh（TC-004-01 / REQ-103 / EDGE-005）
  it('削除ボタンで確認なし deletePlayer + refresh (TC-004-01 / REQ-103)', async () => {
    const wrapper = mount(PlayersPage, {
      global: { stubs: { ...stubs, PlayersPlayerFormModal: true } }
    })
    await wrapper.get('[aria-label="players.delete"]').trigger('click')
    await flushPromises()
    expect(deletePlayer).toHaveBeenCalledWith('1')
    expect(refresh).toHaveBeenCalled()
  })

  // TC4: 「選手を追加」CTA でモーダルが open になる（dataflow.md 機能2 / TASK-0007 統合）
  it('追加 CTA でモーダルが open になる', async () => {
    const wrapper = mount(PlayersPage, {
      global: {
        stubs: {
          ...stubs,
          PlayersPlayerFormModal: {
            props: ['open', 'mode'],
            template: '<div data-modal :data-open="open" :data-mode="mode" />'
          }
        }
      }
    })
    await wrapper.get('button').trigger('click')
    expect(wrapper.get('[data-modal]').attributes('data-open')).toBe('true')
    expect(wrapper.get('[data-modal]').attributes('data-mode')).toBe('create')
  })
})
