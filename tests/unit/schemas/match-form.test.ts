import { describe, it, expect } from 'vitest'
import { matchFormSchema, extractYoutubeId } from '~/schemas/match-form'

const P1 = '11111111-1111-1111-1111-111111111111'
const P2 = '22222222-2222-2222-2222-222222222222'
const P3 = '33333333-3333-3333-3333-333333333333'
const P4 = '44444444-4444-4444-4444-444444444444'

const base = {
  name: 'XX練習会',
  matchDate: '2026-06-05',
  teamAPlayer1Id: P1,
  teamAPlayer2Id: P2,
  teamBPlayer1Id: P3,
  teamBPlayer2Id: P4,
  videoSourceType: 'local' as const,
  videoSourceUrl: 'match1.mp4'
}

describe('matchFormSchema', () => {
  it('TC1: 試合名 空 → null (任意)', () => {
    const r = matchFormSchema.safeParse({ ...base, name: '' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.name).toBeNull()
  })

  it('TC2: 試合名 50字OK / 51字NG (境界)', () => {
    expect(matchFormSchema.safeParse({ ...base, name: 'a'.repeat(50) }).success).toBe(true)
    const ng = matchFormSchema.safeParse({ ...base, name: 'a'.repeat(51) })
    expect(ng.success).toBe(false)
    if (!ng.success) expect(ng.error.issues[0]?.message).toBe('invalid_match_name')
  })

  it('TC3: 試合日付 未入力/形式不正は拒否 (必須)', () => {
    expect(matchFormSchema.safeParse({ ...base, matchDate: '' }).success).toBe(false)
    expect(matchFormSchema.safeParse({ ...base, matchDate: '2026/06/05' }).success).toBe(false)
  })

  it('TC4: youtube URL OK + ID 抽出', () => {
    const v = { ...base, videoSourceType: 'youtube' as const, videoSourceUrl: 'https://youtu.be/abcdefghijk' }
    expect(matchFormSchema.safeParse(v).success).toBe(true)
    expect(extractYoutubeId(v.videoSourceUrl)).toBe('abcdefghijk')
  })

  it('TC5: youtube 形式不正は拒否', () => {
    const r = matchFormSchema.safeParse({ ...base, videoSourceType: 'youtube', videoSourceUrl: 'not-a-url' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.some(i => i.message === 'invalid_youtube_url')).toBe(true)
  })

  it('TC6: local 非空でOK (type 別分岐)', () => {
    expect(matchFormSchema.safeParse({ ...base, videoSourceType: 'local', videoSourceUrl: 'match1.mp4' }).success).toBe(true)
  })

  it('TC7: 4選手に重複ありは拒否', () => {
    const r = matchFormSchema.safeParse({ ...base, teamBPlayer2Id: P1 })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.some(i => i.message === 'players_must_be_distinct')).toBe(true)
  })
})
