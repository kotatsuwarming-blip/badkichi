/**
 * useAnnotationSession 単体テスト (TASK-0004)
 *
 * mock 戦略: supabase client はテーブル別フィクスチャを返す thenable ビルダー。
 *           useAnnotationSave は vi.mock で差し替え (DB なし)。
 * 検証: 読込 (レット除外 D5 / ソート保証 / ロスター) / 楽観パッチ (local + save) /
 *       直前1段 undo (旧値逆適用・カーソル復元・2回目 no-op) / エラー時も local 保持。
 * REQ-001 / REQ-003 / REQ-106 / REQ-108 / EDGE-007
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => {
  const fixtures: Record<string, unknown> = {}
  function builderFor(table: string) {
    const result = () => ({ data: fixtures[table], error: null })
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'in', 'is', 'order']) {
      builder[method] = vi.fn(() => builder)
    }
    builder.single = vi.fn(() => Promise.resolve(result()))
    builder.then = (onFulfilled: (v: unknown) => unknown) => Promise.resolve(onFulfilled(result()))
    return builder
  }
  return {
    fixtures,
    fromMock: vi.fn((table: string) => builderFor(table)),
    saveShotMock: vi.fn(),
    saveRallyMock: vi.fn(),
    updateShotNumberMock: vi.fn(),
    insertShotRowMock: vi.fn(),
    deleteShotRowMock: vi.fn()
  }
})

vi.mock('#imports', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return { ref: vue.ref, computed: vue.computed, useSupabaseClient: () => ({ from: m.fromMock }) }
})
vi.mock('#supabase-client', () => ({ useSupabaseClient: () => ({ from: m.fromMock }) }))
vi.mock('~/composables/useAnnotationSave', () => ({
  useAnnotationSave: () => ({
    saveShotPatch: m.saveShotMock,
    saveRallyPatch: m.saveRallyMock,
    updateShotNumber: m.updateShotNumberMock,
    insertShotRow: m.insertShotRowMock,
    deleteShotRow: m.deleteShotRowMock,
    pending: { value: false },
    lastError: { value: null }
  })
}))

// eslint-disable-next-line import/first
import { useAnnotationSession } from '~/composables/useAnnotationSession'

function seedFixtures() {
  m.fixtures.matches = {
    id: 'm1',
    video_source_type: 'youtube',
    video_source_url: 'https://youtu.be/x',
    team_a_player1_id: 'A1',
    team_a_player2_id: 'A2',
    team_b_player1_id: 'B1',
    team_b_player2_id: 'B2'
  }
  m.fixtures.players = [
    { id: 'A1', name: '田中' },
    { id: 'A2', name: '鈴木' },
    { id: 'B1', name: '佐藤' },
    { id: 'B2', name: '高橋' }
  ]
  m.fixtures.sets = [
    { id: 's1', set_number: 1 },
    { id: 's2', set_number: 2 }
  ]
  const rallyBase = {
    serving_team: 'A',
    server_player_id: 'A1',
    receiver_player_id: 'B1',
    point_winner: 'A',
    is_point_confirmed: true,
    video_start_timestamp_ms: 1000,
    end_reason: null,
    land_x: null,
    land_y: null,
    out_direction: null
  }
  // 意図的に順不同 + レット1件 (除外されるべき)
  m.fixtures.rallies = [
    { id: 'r3', set_id: 's2', rally_number: 1, is_let: false, ...rallyBase },
    { id: 'r2', set_id: 's1', rally_number: 2, is_let: true, ...rallyBase },
    { id: 'r1', set_id: 's1', rally_number: 1, is_let: false, ...rallyBase }
  ]
  const shotBase = {
    video_timestamp_ms: 5000,
    annotated_timestamp_ms: null,
    shot_type: null,
    hand: null,
    hit_player_id: null,
    hit_x: null,
    hit_y: null
  }
  // 意図的に shot_number 順不同
  m.fixtures.shots = [
    { id: 'sh2', rally_id: 'r1', shot_number: 2, ...shotBase },
    { id: 'sh1', rally_id: 'r1', shot_number: 1, ...shotBase },
    { id: 'sh3', rally_id: 'r3', shot_number: 1, ...shotBase }
  ]
}

const CURSOR = { setId: 's1', rallyId: 'r1', shotId: 'sh1' }

describe('useAnnotationSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    seedFixtures()
    m.saveShotMock.mockResolvedValue({ data: true, error: null })
    m.saveRallyMock.mockResolvedValue({ data: true, error: null })
  })

  it('load: レット除外 (D5)・(set, rally) 順ソート・ショット昇順・ロスター構築', async () => {
    const session = useAnnotationSession('m1')
    await session.load()

    expect(session.loadError.value).toBeNull()
    // レット r2 は除外され、s1#1 → s2#1 の順
    expect(session.rallies.value.map(r => r.id)).toEqual(['r1', 'r3'])
    // shot_number 昇順に並び替え
    expect(session.shotsOf('r1').map(s => s.id)).toEqual(['sh1', 'sh2'])
    // ロスター (4選手 + チーム対応)
    expect(session.roster.value).toHaveLength(4)
    expect(session.roster.value.find(p => p.playerId === 'B1')).toEqual({
      playerId: 'B1',
      name: '佐藤',
      team: 'B'
    })
    expect(session.isYoutube.value).toBe(true)
    expect(session.hasRallies.value).toBe(true)
  })

  it('patchShot: local 即反映 + save へ直列送出 (楽観)', async () => {
    const session = useAnnotationSession('m1')
    await session.load()
    session.goTo(CURSOR)

    const ok = await session.patchShot('sh1', { shotType: 'smash', hand: 'backhand' })
    expect(ok).toBe(true)
    expect(session.findShot('sh1')?.shotType).toBe('smash')
    expect(m.saveShotMock).toHaveBeenCalledWith('sh1', { shotType: 'smash', hand: 'backhand' })
  })

  it('undoLast: 直前の入力を旧値で逆適用し、カーソルを入力時点へ戻す (REQ-108)', async () => {
    const session = useAnnotationSession('m1')
    await session.load()
    session.goTo(CURSOR)
    await session.patchShot('sh1', { shotType: 'smash' })
    session.goTo({ setId: 's1', rallyId: 'r1', shotId: 'sh2' }) // 次のショットへ進んだ想定

    const ok = await session.undoLast()
    expect(ok).toBe(true)
    // 旧値 (null) へ戻る + save にも旧値パッチが送られる
    expect(session.findShot('sh1')?.shotType).toBeNull()
    expect(m.saveShotMock).toHaveBeenLastCalledWith('sh1', { shotType: null })
    // カーソルは入力時点へ復元
    expect(session.cursor.value).toEqual(CURSOR)
    // 1段のみ: 2回目は no-op
    expect(await session.undoLast()).toBe(false)
  })

  it('patchRally: 決着注釈の local 反映 + save 送出', async () => {
    const session = useAnnotationSession('m1')
    await session.load()
    session.goTo({ setId: 's1', rallyId: 'r1', shotId: null })

    await session.patchRally('r1', { endReason: 'out', landX: 1.1, landY: 0.5 })
    expect(session.findRally('r1')?.endReason).toBe('out')
    expect(m.saveRallyMock).toHaveBeenCalledWith('r1', { endReason: 'out', landX: 1.1, landY: 0.5 })
  })

  it('save 失敗時: false を返すが local は保持する (EDGE-007)', async () => {
    m.saveShotMock.mockResolvedValue({ data: null, error: new Error('network') })
    const session = useAnnotationSession('m1')
    await session.load()
    session.goTo(CURSOR)

    const ok = await session.patchShot('sh1', { shotType: 'clear' })
    expect(ok).toBe(false)
    expect(session.findShot('sh1')?.shotType).toBe('clear')
  })

  it('insertShotAt(先頭): タイムスタンプはラリー開始押下を使う (サーブ押し損ね補正、2026-08-03)', async () => {
    const session = useAnnotationSession('m1')
    await session.load()
    m.updateShotNumberMock.mockResolvedValue({ data: true, error: null })
    m.insertShotRowMock.mockResolvedValue({ data: 'new1', error: null })

    const ok = await session.insertShotAt('r1', 0)
    expect(ok).toBe(true)
    // 既存 sh1/sh2 は後ろから +1 renumber → 新しい 1 打目はラリー開始押下 (1000ms)
    expect(m.updateShotNumberMock).toHaveBeenCalledWith('sh2', 3)
    expect(m.updateShotNumberMock).toHaveBeenCalledWith('sh1', 2)
    expect(m.insertShotRowMock).toHaveBeenCalledWith('r1', 1, 1000)
  })

  it('存在しない行へのパッチは false (保存も送らない)', async () => {
    const session = useAnnotationSession('m1')
    await session.load()
    expect(await session.patchShot('nope', { shotType: 'clear' })).toBe(false)
    expect(m.saveShotMock).not.toHaveBeenCalled()
  })
})
