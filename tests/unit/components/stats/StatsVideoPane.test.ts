// @vitest-environment happy-dom
/**
 * StatsVideoPane 単体テスト
 * 方針: happy-dom + @vue/test-utils。useVideoPlayer をモック、VideoPlayer をスタブ。
 * REQ-007 / REQ-011 / REQ-104
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

const seekToMsSpy = vi.fn()
const playerState = ref({ durationMs: 10000 as number | null })

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('~/composables/useVideoPlayer', () => ({
  useVideoPlayer: () => ({
    state: playerState,
    controls: { seekToMs: seekToMsSpy },
    attach: vi.fn(),
    detach: vi.fn()
  })
}))

// eslint-disable-next-line import/first
import StatsVideoPane from '~/components/stats/StatsVideoPane.vue'

const VideoPlayer = {
  props: ['player'],
  template: '<div><slot name="timeline" :duration-ms="player.state.value.durationMs" :current-time-ms="0" /></div>'
}

function mountPane(rallyMarkersMs: number[]) {
  return mount(StatsVideoPane, {
    props: { source: { type: 'youtube', url: 'https://youtu.be/x' } as never, rallyMarkersMs },
    global: { stubs: { VideoPlayer } }
  })
}

describe('StatsVideoPane', () => {
  it('ラリー区切りマーカーを duration 比率で配置', () => {
    const w = mountPane([2000, 5000])
    const markers = w.findAll('[data-testid="rally-marker"]')
    expect(markers).toHaveLength(2)
    expect(markers[0].attributes('style')).toContain('left: 20%')
    expect(markers[1].attributes('style')).toContain('left: 50%')
  })

  it('seekToMs を expose し controls.seekToMs に委譲', () => {
    const w = mountPane([])
    ;(w.vm as unknown as { seekToMs: (ms: number) => void }).seekToMs(3000)
    expect(seekToMsSpy).toHaveBeenCalledWith(3000)
  })
})
