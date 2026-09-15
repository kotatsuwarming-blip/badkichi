/**
 * stats_shot_value RPC 統合テスト（shot-value TASK-0001）
 *
 * 検算例（docs/spec/shot-value/requirements.md）をそのままフィクスチャ化:
 *   - ミス決着 5 打 / エース決着 5 打 / service_fault / 2 打決着（レシーブミス）
 *   - end_reason unknown の除外（REQ-102）
 *   - camera_near_team null → ゾーン null で採点は継続（REQ-101）
 *   - hit_player_id null → 位置を消費しつつ出力から除外（REQ-104）
 *
 * 実行: pnpm test:integration（CI 専用）
 */
import { describe, it, expect, beforeAll, afterAll, inject } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createGroupForUserB, createPlayer, cleanupUserBData } from '../helpers/rls-fixtures'

const url = process.env.NUXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NUXT_PUBLIC_SUPABASE_KEY
const serviceRoleKey = process.env.NUXT_SUPABASE_SECRET_KEY
const skip = !url || !anonKey || !serviceRoleKey

interface SvShotSeed {
  hitPlayerId?: string | null
  shotType?: string
  hitX?: number
  hitY?: number
}

interface SvRallySeed {
  rallyNumber: number
  servingTeam: 'A' | 'B'
  server: string
  receiver: string
  pointWinner: 'A' | 'B' | null
  endReason?: string | null
  cameraNearTeam?: 'A' | 'B' | null
  shots: SvShotSeed[]
}

async function insertRally(client: SupabaseClient, setId: string, opts: SvRallySeed): Promise<void> {
  const { data, error } = await client.from('rallies').insert({
    set_id: setId,
    rally_number: opts.rallyNumber,
    serving_team: opts.servingTeam,
    server_position: 'right',
    server_player_id: opts.server,
    receiver_player_id: opts.receiver,
    point_winner: opts.pointWinner,
    is_let: false,
    is_point_confirmed: opts.pointWinner !== null,
    camera_near_team: opts.cameraNearTeam === undefined ? 'B' : opts.cameraNearTeam,
    end_reason: opts.endReason ?? null
  }).select('id').single()
  if (error || !data) throw new Error(`insertRally failed: ${error?.message}`)
  const { error: shotErr } = await client.from('shots').insert(opts.shots.map((s, i) => ({
    rally_id: data.id,
    shot_number: i + 1,
    input_source: 'manual',
    hit_player_id: s.hitPlayerId === undefined ? null : s.hitPlayerId,
    shot_type: s.shotType ?? null,
    hit_x: s.hitX ?? null,
    hit_y: s.hitY ?? null
  })))
  if (shotErr) throw new Error(`insertShots failed: ${shotErr.message}`)
}

interface SvRow {
  hit_player_id: string
  shot_type: string
  hand: string | null
  zone_row: number | null
  zone_col: number | null
  n: number
  kime: number
  yuhatsu: number
  fuseki1: number
  fuseki2: number
  miss: number
  yurushi1: number
  yurushi2: number
}

describe.skipIf(skip)('stats_shot_value RPC 統合テスト', () => {
  let serviceClient: SupabaseClient
  let userAClient: SupabaseClient
  let userBClient: SupabaseClient
  let groupId: string
  let p: string[] // [p0, p1] = team A / [p2, p3] = team B
  let matchId: string
  let rows: SvRow[] = []

  /** (player, type) の全ゾーン合算（役割カウント合計） */
  function agg(pid: string, type: string): SvRow | undefined {
    const hit = rows.filter(r => r.hit_player_id === pid && r.shot_type === type)
    if (hit.length === 0) return undefined
    const acc = { ...hit[0]!, n: 0, kime: 0, yuhatsu: 0, fuseki1: 0, fuseki2: 0, miss: 0, yurushi1: 0, yurushi2: 0 }
    for (const r of hit) {
      acc.n += r.n
      acc.kime += r.kime
      acc.yuhatsu += r.yuhatsu
      acc.fuseki1 += r.fuseki1
      acc.fuseki2 += r.fuseki2
      acc.miss += r.miss
      acc.yurushi1 += r.yurushi1
      acc.yurushi2 += r.yurushi2
    }
    return acc
  }

  beforeAll(async () => {
    const { userA, userB } = inject('users')
    serviceClient = createClient(url!, serviceRoleKey!, { auth: { autoRefreshToken: false, persistSession: false } })
    userAClient = createClient(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } })
    const { error: aErr } = await userAClient.auth.signInWithPassword({ email: userA.email, password: userA.password })
    if (aErr) throw new Error(`User A signIn failed: ${aErr.message}`)
    const { data: au } = await userAClient.auth.getUser()
    userBClient = createClient(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } })
    const { error: bErr } = await userBClient.auth.signInWithPassword({ email: userB.email, password: userB.password })
    if (bErr) throw new Error(`User B signIn failed: ${bErr.message}`)

    groupId = await createGroupForUserB(serviceClient, au.user!.id)
    p = await Promise.all([
      createPlayer(serviceClient, groupId), createPlayer(serviceClient, groupId),
      createPlayer(serviceClient, groupId), createPlayer(serviceClient, groupId)
    ])
    const { data: match, error: mErr } = await serviceClient.from('matches').insert({
      group_id: groupId,
      team_a_player1_id: p[0],
      team_a_player2_id: p[1],
      team_b_player1_id: p[2],
      team_b_player2_id: p[3],
      video_source_type: 'youtube',
      video_source_url: 'https://youtu.be/shot-value-test'
    }).select('id').single()
    if (mErr || !match) throw new Error(`insertMatch failed: ${mErr?.message}`)
    matchId = match.id
    const { data: set, error: sErr } = await serviceClient.from('sets')
      .insert({ match_id: matchId, set_number: 1, first_serving_team: 'A' })
      .select('id').single()
    if (sErr || !set) throw new Error(`insertSet failed: ${sErr?.message}`)
    const setId = set.id

    // R1: ミス決着 5 打（net, サーブ A, 勝者 B）= requirements 検算例
    //   期待役割: s1 yurushi2 / s2 fuseki1 / s3 yurushi1 / s4 yuhatsu / s5 miss
    await insertRally(serviceClient, setId, {
      rallyNumber: 1, servingTeam: 'A', server: p[0], receiver: p[2], pointWinner: 'B', endReason: 'net',
      shots: [
        { hitPlayerId: p[0], shotType: 'serve_long' },
        { hitPlayerId: p[2], shotType: 'receive_short' },
        { hitPlayerId: p[1], shotType: 'drive' },
        { hitPlayerId: p[3], shotType: 'smash' },
        { hitPlayerId: p[0], shotType: 'hairpin' }
      ]
    })
    // R2: エース決着 5 打（floor × 最終打者 = 勝者 A, サーブ A）
    //   期待役割: s1 fuseki2 / s2 yurushi2 / s3 fuseki1 / s4 yurushi1 / s5 kime
    //   s5 打点 (0.2, 0.3): 打者 A = カメラ奥(cam='B') → x のみ反転 → (0.8, 0.3) → row1 / col2
    await insertRally(serviceClient, setId, {
      rallyNumber: 2, servingTeam: 'A', server: p[0], receiver: p[2], pointWinner: 'A', endReason: 'floor',
      shots: [
        { hitPlayerId: p[0], shotType: 'serve_short' },
        { hitPlayerId: p[2], shotType: 'lob_low' },
        { hitPlayerId: p[1], shotType: 'hairpin' },
        { hitPlayerId: p[3], shotType: 'drive' },
        { hitPlayerId: p[0], shotType: 'smash', hitX: 0.2, hitY: 0.3 }
      ]
    })
    // R3: service_fault → サーブに miss のみ（p0 serve_short は R2 fuseki2 と合算される）
    await insertRally(serviceClient, setId, {
      rallyNumber: 3, servingTeam: 'A', server: p[0], receiver: p[2], pointWinner: 'B', endReason: 'service_fault',
      shots: [{ hitPlayerId: p[0], shotType: 'serve_short' }]
    })
    // R4: 2 打決着（レシーブミス）: サーブ yuhatsu / レシーブ miss・遡りなし
    await insertRally(serviceClient, setId, {
      rallyNumber: 4, servingTeam: 'A', server: p[0], receiver: p[2], pointWinner: 'A', endReason: 'net',
      shots: [
        { hitPlayerId: p[0], shotType: 'serve_long' },
        { hitPlayerId: p[2], shotType: 'receive_short' }
      ]
    })
    // R5: end_reason unknown → 分母にも入らない（REQ-102）。p2 smash はここにしか無い
    await insertRally(serviceClient, setId, {
      rallyNumber: 5, servingTeam: 'A', server: p[0], receiver: p[2], pointWinner: 'B', endReason: 'unknown',
      shots: [{ hitPlayerId: p[2], shotType: 'smash' }]
    })
    // R6: camera_near_team null → ゾーン null で採点は継続（1 打エース: floor × 最終 = 勝者 A）
    await insertRally(serviceClient, setId, {
      rallyNumber: 6, servingTeam: 'A', server: p[1], receiver: p[3], pointWinner: 'A', endReason: 'floor',
      cameraNearTeam: null,
      shots: [{ hitPlayerId: p[1], shotType: 'serve_long', hitX: 0.5, hitY: 0.8 }]
    })
    // R7: hit_player_id null が位置を消費（サーブ B, 3 打 net, 勝者 A）
    //   期待: s1 p2 yurushi1 / s2 (pid null) yuhatsu = 出力されない / s3 p3 miss
    await insertRally(serviceClient, setId, {
      rallyNumber: 7, servingTeam: 'B', server: p[2], receiver: p[0], pointWinner: 'A', endReason: 'net',
      shots: [
        { hitPlayerId: p[2], shotType: 'serve_long' },
        { hitPlayerId: null, shotType: 'clear_high' },
        { hitPlayerId: p[3], shotType: 'lob_low' }
      ]
    })

    const { data, error } = await userAClient.rpc('stats_shot_value', { p_match_id: matchId })
    if (error) throw new Error(`stats_shot_value failed: ${error.message}`)
    rows = data as SvRow[]
  }, 30000)

  afterAll(async () => {
    if (groupId) await cleanupUserBData(serviceClient, groupId)
  }, 30000)

  it('検算例: ミス決着 5 打の役割割当（REQ-001）', () => {
    expect(agg(p[0]!, 'serve_long')).toMatchObject({ yurushi2: 1, yuhatsu: 1, n: 2 }) // R1 s1 + R4 s1
    expect(agg(p[2]!, 'receive_short')).toMatchObject({ fuseki1: 1, miss: 1, n: 2 }) // R1 s2 + R4 s2
    expect(agg(p[1]!, 'drive')).toMatchObject({ yurushi1: 1, n: 1 }) // R1 s3
    expect(agg(p[3]!, 'smash')).toMatchObject({ yuhatsu: 1, n: 1 }) // R1 s4
    expect(agg(p[0]!, 'hairpin')).toMatchObject({ miss: 1, n: 1 }) // R1 s5
  })

  it('検算例: エース決着 5 打の役割割当（REQ-001）', () => {
    expect(agg(p[0]!, 'serve_short')).toMatchObject({ fuseki2: 1, miss: 1, n: 2 }) // R2 s1 + R3 fault
    expect(agg(p[2]!, 'lob_low')).toMatchObject({ yurushi2: 1, n: 1 }) // R2 s2
    expect(agg(p[1]!, 'hairpin')).toMatchObject({ fuseki1: 1, n: 1 }) // R2 s3
    expect(agg(p[3]!, 'drive')).toMatchObject({ yurushi1: 1, n: 1 }) // R2 s4
    expect(agg(p[0]!, 'smash')).toMatchObject({ kime: 1, n: 1 }) // R2 s5
  })

  it('ゾーン: カメラ奥打者は x のみ反転（placement 同一規則）+ 座標なしは null', () => {
    const kimeRow = rows.find(r => r.hit_player_id === p[0] && r.shot_type === 'smash')!
    expect(kimeRow.zone_row).toBe(1) // y=0.3 → floor(0.3*6)=1
    expect(kimeRow.zone_col).toBe(2) // x=0.2 → 反転 0.8 → floor(0.8*3)=2
    const noCoords = rows.find(r => r.hit_player_id === p[1] && r.shot_type === 'drive')!
    expect(noCoords.zone_row).toBeNull()
  })

  it('REQ-101: camera_near_team null は採点されゾーンのみ null', () => {
    expect(agg(p[1]!, 'serve_long')).toMatchObject({ kime: 1, n: 1 }) // R6（座標ありでもゾーン null）
    const r6 = rows.find(r => r.hit_player_id === p[1] && r.shot_type === 'serve_long')!
    expect(r6.zone_row).toBeNull()
  })

  it('REQ-102: end_reason unknown は分母にも入らない', () => {
    expect(agg(p[2]!, 'smash')).toBeUndefined() // R5 のみに存在
  })

  it('REQ-104: pid null は位置を消費しつつ出力されない', () => {
    expect(agg(p[2]!, 'serve_long')).toMatchObject({ yurushi1: 1, n: 1 }) // R7 s1
    expect(agg(p[3]!, 'lob_low')).toMatchObject({ miss: 1, n: 1 }) // R7 s3
    expect(rows.some(r => r.hit_player_id === null)).toBe(false)
    expect(rows.some(r => r.shot_type === 'clear_high')).toBe(false) // pid null 行は出ない
  })

  it('NFR-101: 他 Group の userB は 0 件 / invalid_scope', async () => {
    const { data: bData } = await userBClient.rpc('stats_shot_value', { p_match_id: matchId })
    expect(bData ?? []).toHaveLength(0)
    const { error } = await userAClient.rpc('stats_shot_value', {})
    expect(error?.message).toContain('invalid_scope')
  })
})
