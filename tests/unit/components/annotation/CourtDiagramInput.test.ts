// @vitest-environment happy-dom
/**
 * CourtDiagramInput.vue 単体テスト (singles-support TASK-0012 / REQ-301a)
 * 方針: happy-dom + @vue/test-utils。SVG ラインの存在確認のみ (タップ座標系は court-coords 側でテスト済み)。
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CourtDiagramInput from '~/components/annotation/CourtDiagramInput.vue'

describe('CourtDiagramInput', () => {
  it('TC-301-01: シングルスサイドライン (左右 0.46m 内側) を常に描く', () => {
    const w = mount(CourtDiagramInput)
    const lines = w.findAll('[data-testid="singles-sideline"]')
    expect(lines).toHaveLength(2)
    // 0.1m 単位: COURT.left=30, width=61 → x = 34.6 / 86.4
    expect(lines.map(l => Number(l.attributes('x1')))).toEqual([34.6, 86.4])
  })

  it('TC-301-04: ダブルスロングサービスライン (バックから 0.76m) を常に描く', () => {
    const w = mount(CourtDiagramInput)
    const lines = w.findAll('[data-testid="doubles-long-service-line"]')
    expect(lines).toHaveLength(2)
    // 0.1m 単位: COURT.top=30, height=134 → y = 37.6 / 156.4
    expect(lines.map(l => Number(l.attributes('y1')))).toEqual([37.6, 156.4])
  })
})
