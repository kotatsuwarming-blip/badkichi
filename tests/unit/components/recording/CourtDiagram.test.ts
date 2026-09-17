// @vitest-environment happy-dom
/**
 * CourtDiagram.vue 単体テスト
 * 方針: happy-dom + @vue/test-utils。vue-i18n はキー素通しフェイク。分岐の最小集合のみ。
 * TASK-0012 / 立ち位置表示
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { TeamPositions } from '~/utils/rule-engine/types'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// eslint-disable-next-line import/first
import CourtDiagram from '~/components/recording/CourtDiagram.vue'

const positions: TeamPositions = {
  teamA: { left: 'A1', right: 'A2' },
  teamB: { left: 'B1', right: 'B2' }
}
const names = { A1: '佐藤', A2: '鈴木', B1: '高橋', B2: '田中' }

function mountCourt(cameraNearTeam: 'A' | 'B' | null) {
  return mount(CourtDiagram, {
    props: { positions, servingTeam: 'A', server: 'A2', receiver: 'B1', cameraNearTeam, names },
    global: { stubs: {}, mocks: { $t: (k: string) => k } }
  })
}

describe('CourtDiagram', () => {
  it('4 選手を名前付きで描画し、サーバーを強調する', () => {
    const w = mountCourt('A')
    expect(w.text()).toContain('佐藤')
    expect(w.text()).toContain('田中')
    const server = w.find('[data-testid="cell-A2"]')
    expect(server.classes()).toContain('is-server')
    const receiver = w.find('[data-testid="cell-B1"]')
    expect(receiver.classes()).toContain('is-receiver')
  })

  it('camera_near_team=A は A を手前、B を奥にする', () => {
    const w = mountCourt('A')
    const rows = w.findAll('.court-row')
    // 奥 (先頭 row) は B、手前 (末尾 row) は A
    expect(rows[0].text()).toContain('高橋') // B1
    expect(rows[1].text()).toContain('佐藤') // A1
  })

  it('camera_near_team=B は B を手前・A を奥にする', () => {
    const w = mountCourt('B')
    const rows = w.findAll('.court-row')
    expect(rows[0].text()).toContain('佐藤') // 奥=A
    expect(rows[1].text()).toContain('高橋') // 手前=B
  })

  it('camera_near_team=null は A を手前の既定にする', () => {
    const w = mountCourt(null)
    const rows = w.findAll('.court-row')
    expect(rows[1].text()).toContain('佐藤') // A 手前
  })

  it('奥チームは左右ミラー: ファースト(right=B2/田中)が画面の左セルに来る', () => {
    const w = mountCourt('A') // 奥=B
    const farCells = w.findAll('.court-row')[0].findAll('.court-cell')
    expect(farCells[0].text()).toContain('田中') // B2 (right/偶数側) が向かって左
    expect(farCells[1].text()).toContain('高橋') // B1 (left) が向かって右
  })

  it('手前チームはミラーしない: left(A1/佐藤)が画面の左セル', () => {
    const w = mountCourt('A') // 手前=A
    const nearCells = w.findAll('.court-row')[1].findAll('.court-cell')
    expect(nearCells[0].text()).toContain('佐藤') // A1 (left) が向かって左
    expect(nearCells[1].text()).toContain('鈴木') // A2 (right) が向かって右
  })

  it('サーバー/レシーバーのセルに役割ラベルを出す', () => {
    const w = mountCourt('A')
    expect(w.find('[data-testid="cell-A2"]').text()).toContain('record.court.serve') // server
    expect(w.find('[data-testid="cell-B1"]').text()).toContain('record.court.receive') // receiver
  })

  it('サーバー→レシーバーの斜め矢印を描画する', () => {
    const w = mountCourt('A')
    expect(w.find('[data-testid="serve-arrow"]').exists()).toBe(true)
  })
})

describe('CourtDiagram singles (REQ-107)', () => {
  const singlesPositions: TeamPositions = {
    teamA: { left: 'A1', right: 'A1' },
    teamB: { left: 'B1', right: 'B1' }
  }
  const singlesNames = { A1: '佐藤', B1: '高橋' }

  function mountSingles(serverPosition: 'left' | 'right') {
    return mount(CourtDiagram, {
      props: {
        positions: singlesPositions,
        servingTeam: 'A',
        server: 'A1',
        receiver: 'B1',
        cameraNearTeam: 'A',
        names: singlesNames,
        singles: true,
        serverPosition
      },
      global: { stubs: {}, mocks: { $t: (k: string) => k } }
    })
  }

  it('偶数 (right): サービスコート側のセルにだけ選手、反対側は空セル (TC-107-01)', () => {
    const w = mountSingles('right')
    // 同じ選手が 2 セルに出ない (cell-A1 は 1 個)
    expect(w.findAll('[data-testid="cell-A1"]')).toHaveLength(1)
    expect(w.findAll('[data-testid="cell-B1"]')).toHaveLength(1)
    expect(w.find('[data-testid="cell-empty-A-left"]').exists()).toBe(true)
    expect(w.find('[data-testid="cell-empty-B-left"]').exists()).toBe(true)
    expect(w.find('[data-testid="cell-A1"]').classes()).toContain('is-server')
    expect(w.find('[data-testid="cell-B1"]').classes()).toContain('is-receiver')
  })

  it('奇数 (left): 左サービスコートに移動する (TC-107-02)', () => {
    const w = mountSingles('left')
    expect(w.find('[data-testid="cell-empty-A-right"]').exists()).toBe(true)
    expect(w.find('[data-testid="cell-A1"]').classes()).toContain('is-server')
  })

  it('TC-301-04: ダブルスロングサービスラインは形式問わず常に描く', () => {
    const s = mountSingles('right')
    expect(s.findAll('[data-testid="doubles-long-service-line"]')).toHaveLength(2)
    const d = mount(CourtDiagram, {
      props: { positions, servingTeam: 'A', server: 'A2', receiver: 'B1', cameraNearTeam: 'A', names },
      global: { stubs: {}, mocks: { $t: (k: string) => k } }
    })
    expect(d.findAll('[data-testid="doubles-long-service-line"]')).toHaveLength(2)
  })

  it('TC-301-03: singles はシングルスサイドラインを描く (doubles では描かない)', () => {
    const w = mountSingles('right')
    expect(w.findAll('[data-testid="singles-sideline"]')).toHaveLength(2)
    const d = mount(CourtDiagram, {
      props: { positions, servingTeam: 'A', server: 'A2', receiver: 'B1', cameraNearTeam: 'A', names },
      global: { stubs: {}, mocks: { $t: (k: string) => k } }
    })
    expect(d.findAll('[data-testid="singles-sideline"]')).toHaveLength(0)
  })
})
