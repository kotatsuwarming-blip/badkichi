import { describe, expect, it } from 'vitest'
import { extractYouTubeId } from '~/utils/video-playback/extract-youtube-id'

describe('extractYouTubeId', () => {
  describe('正常系: 代表的な YouTube URL 形式から ID 抽出', () => {
    it('watch?v= 形式から 11 文字 ID を返す', () => {
      expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    })

    it('youtu.be/ 短縮形から ID を返す', () => {
      expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    })

    it('embed/ 形式から ID を返す', () => {
      expect(extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    })

    it('shorts/ 形式から ID を返す', () => {
      expect(extractYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    })

    it('クエリパラメータ付き（?t=10）でも ID のみ返す', () => {
      expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ?t=10')).toBe('dQw4w9WgXcQ')
    })

    it('裸の 11 桁 ID（match-management 保存値）をそのまま返す', () => {
      expect(extractYouTubeId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    })
  })

  describe('異常系: null を返す（例外を投げない）', () => {
    it('非 YouTube URL では null を返す', () => {
      expect(extractYouTubeId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    })

    it('空文字では null を返す', () => {
      expect(extractYouTubeId('')).toBeNull()
    })

    it('ID 抽出不可な YouTube URL では null を返す', () => {
      expect(extractYouTubeId('https://www.youtube.com/channel/UC123')).toBeNull()
    })
  })
})
