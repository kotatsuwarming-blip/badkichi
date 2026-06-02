import { describe, expect, it } from 'vitest'
import { clampMs } from '~/utils/video-playback/clamp'

describe('clampMs', () => {
  describe('durationMs が number のとき: [0, durationMs] にクランプ', () => {
    it('0ms ちょうど（下限境界）はそのまま 0 を返す', () => {
      expect(clampMs(0, 60000)).toBe(0)
    })

    it('duration ちょうど（上限境界）はそのまま duration を返す', () => {
      expect(clampMs(60000, 60000)).toBe(60000)
    })

    it('duration 超過は duration に丸める', () => {
      expect(clampMs(70000, 60000)).toBe(60000)
    })

    it('負値は 0 に丸める', () => {
      expect(clampMs(-500, 60000)).toBe(0)
    })

    it('中間値はそのまま返す', () => {
      expect(clampMs(5000, 10000)).toBe(5000)
    })
  })

  describe('durationMs が null のとき: 下限 0 のみ適用（上限なし）', () => {
    it('負値は 0 に丸める', () => {
      expect(clampMs(-500, null)).toBe(0)
    })

    it('正値は上限なしでそのまま返す', () => {
      expect(clampMs(70000, null)).toBe(70000)
    })
  })
})
