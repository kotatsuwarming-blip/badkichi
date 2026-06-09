import { describe, expect, it } from 'vitest'
import { resolveIncludedMatchIds } from '~/utils/stats-dashboard/resolve-match-ids'
import type { MatchMeta } from '~/types/stats-dashboard'

const matches: MatchMeta[] = [
  { id: 'm1', name: 'A', matchDate: '2026-05-01' },
  { id: 'm2', name: 'B', matchDate: '2026-06-01' },
  { id: 'm3', name: 'C', matchDate: '2026-06-15' },
  { id: 'm4', name: 'D', matchDate: null }
]

describe('resolveIncludedMatchIds', () => {
  it('日付範囲で絞る（含む）', () => {
    expect(resolveIncludedMatchIds(matches, '2026-06-01', '2026-06-30', [])).toEqual(['m2', 'm3'])
  })
  it('日付未設定の試合は日付フィルタ指定時に除外', () => {
    expect(resolveIncludedMatchIds(matches, '2026-01-01', null, [])).toEqual(['m1', 'm2', 'm3'])
  })
  it('個別除外を反映', () => {
    expect(resolveIncludedMatchIds(matches, null, null, ['m2'])).toEqual(['m1', 'm3', 'm4'])
  })
  it('日付未指定・除外なしは全件', () => {
    expect(resolveIncludedMatchIds(matches, null, null, [])).toEqual(['m1', 'm2', 'm3', 'm4'])
  })
})
