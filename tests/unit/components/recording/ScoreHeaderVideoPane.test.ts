// @vitest-environment happy-dom
/**
 * ScoreHeader.vue / VideoPane.vue 単体テスト
 * 方針: happy-dom + @vue/test-utils。VideoPlayer はスタブ。分岐の最小集合。
 * TASK-0013 / REQ-008 / NFR-202
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// eslint-disable-next-line import/first
import ScoreHeader from '~/components/recording/ScoreHeader.vue'
// eslint-disable-next-line import/first
import VideoPane from '~/components/recording/VideoPane.vue'

describe('ScoreHeader', () => {
  it('スコア・セット番号・サーバー・レシーバーを表示する', () => {
    const w = mount(ScoreHeader, {
      props: { score: { teamA: 12, teamB: 8 }, setNumber: 2, serverName: '佐藤', receiverName: '高橋' },
      global: { mocks: { $t: (k: string) => k } }
    })
    expect(w.find('[data-testid="score"]').text()).toBe('12 - 8')
    expect(w.find('[data-testid="set-number"]').text()).toContain('2')
    expect(w.find('[data-testid="server"]').text()).toContain('佐藤')
    expect(w.find('[data-testid="receiver"]').text()).toContain('高橋')
  })
})

describe('VideoPane', () => {
  function mountPane(durationMs: number | null, shotMarkers: number[]) {
    const player = { state: ref({ durationMs }), controls: {}, attach: vi.fn(), detach: vi.fn() }
    return mount(VideoPane, {
      props: { player: player as never, shotMarkers },
      global: {
        mocks: { $t: (k: string) => k },
        // VideoPlayer スタブ: timeline スロットへ durationMs を渡す
        stubs: {
          VideoPlayer: {
            props: ['player'],
            template: '<div><slot name="timeline" :duration-ms="durationMs" :current-time-ms="0" /></div>',
            computed: { durationMs() { return (this.player.state.value.durationMs) } }
          }
        }
      }
    })
  }

  it('痕跡マーカーを duration に対する比率で配置する', () => {
    const w = mountPane(10000, [2000, 5000])
    const markers = w.findAll('[data-testid="shot-marker"]')
    expect(markers).toHaveLength(2)
    expect(markers[0].attributes('style')).toContain('left: 20%')
    expect(markers[1].attributes('style')).toContain('left: 50%')
  })

  it('durationMs 未取得時はマーカーを描画しない (display:none)', () => {
    const w = mountPane(null, [2000])
    const marker = w.find('[data-testid="shot-marker"]')
    expect(marker.attributes('style')).toContain('display: none')
  })
})
