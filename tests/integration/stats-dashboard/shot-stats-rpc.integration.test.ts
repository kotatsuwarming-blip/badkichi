/**
 * shot-stats 集計 RPC 統合テスト (TASK-0002)
 *
 * テスト対象（読み取り専用 RPC, SECURITY INVOKER）:
 *   - stats_annotation_coverage
 *   - stats_shot_types
 *   - stats_shot_zones
 *   - stats_rally_endings
 *   - stats_rally_tempo
 *
 * 実行: pnpm test:integration (CI 専用、vitest.integration.config.ts、fileParallelism: false)
 *
 * 【方針】
 * - 注釈列（shot_type / hit_player_id / hit_x,y / hand / video_timestamp_ms / end_reason / land）
 *   入りのフィクスチャを service_role で投入し、確定ラリーのみ集計されること（REQ-101）を検証。
 * - 決定打・out 細分の SQL 実装を app/utils/annotation の純関数
 *   （decisiveShotIndex / deriveOutDirection）と同一入力で突き合わせる（REQ-406 / TC-406-01）。
 * - ミラー（選手視点固定, REQ-105）とクランプ算入（EDGE-101）を検証。
 * - RLS（他 Group の userB は 0 件, NFR-101）と invalid_scope を検証。
 */
import { describe, it, expect, beforeAll, afterAll, inject } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createGroupForUserB, createPlayer, cleanupUserBData } from '../helpers/rls-fixtures'
import { decisiveShotIndex } from '../../../app/utils/annotation/derive'
import { deriveOutDirection } from '../../../app/utils/annotation/court-coords'

const url = process.env.NUXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NUXT_PUBLIC_SUPABASE_KEY
const serviceRoleKey = process.env.NUXT_SUPABASE_SECRET_KEY
const skip = !url || !anonKey || !serviceRoleKey

interface ShotSeed {
  hitPlayerId?: string
  shotType?: string
  hand?: string
  hitX?: number
  hitY?: number
  videoMs?: number | null
}

interface RallySeed {
  rallyNumber: number
  servingTeam: 'A' | 'B'
  server: string
  receiver: string
  pointWinner: 'A' | 'B' | null
  isLet?: boolean
  isPointConfirmed?: boolean
  endReason?: string
  landX?: number
  landY?: number
  outDirection?: string
  shots?: ShotSeed[]
}

async function insertAnnotatedRally(client: SupabaseClient, setId: string, opts: RallySeed): Promise<string> {
  const { data, error } = await client.from('rallies').insert({
    set_id: setId,
    rally_number: opts.rallyNumber,
    serving_team: opts.servingTeam,
    server_position: 'right',
    server_player_id: opts.server,
    receiver_player_id: opts.receiver,
    point_winner: opts.pointWinner,
    is_let: opts.isLet ?? false,
    is_point_confirmed: opts.isPointConfirmed ?? (opts.pointWinner !== null),
    // 座標はカメラ基準（動画見たまま, 2026-08-08 確定）。cam='B' なら
    // 旧規則（チーム B をミラー）と同じ変換になるようフィクスチャは 'B' 固定
    camera_near_team: 'B',
    end_reason: opts.endReason ?? null,
    land_x: opts.landX ?? null,
    land_y: opts.landY ?? null,
    out_direction: opts.outDirection ?? null
  }).select('id').single()
  if (error || !data) throw new Error(`insertAnnotatedRally failed: ${error?.message}`)
  const shotRows = (opts.shots ?? []).map((s, i) => ({
    rally_id: data.id,
    shot_number: i + 1,
    input_source: 'manual',
    hit_player_id: s.hitPlayerId ?? null,
    shot_type: s.shotType ?? null,
    hand: s.hand ?? null,
    hit_x: s.hitX ?? null,
    hit_y: s.hitY ?? null,
    video_timestamp_ms: s.videoMs ?? null
  }))
  if (shotRows.length > 0) {
    const { error: shotErr } = await client.from('shots').insert(shotRows)
    if (shotErr) throw new Error(`insertShots failed: ${shotErr.message}`)
  }
  return data.id
}

describe.skipIf(skip)('shot-stats 集計 RPC 統合テスト', () => {
  let serviceClient: SupabaseClient
  let userAClient: SupabaseClient
  let userBClient: SupabaseClient
  let groupId: string
  let p: string[] // [p0, p1] = team A / [p2, p3] = team B
  let matchId: string

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
      video_source_url: 'https://youtu.be/shot-stats-test'
    }).select('id').single()
    if (mErr || !match) throw new Error(`insertMatch failed: ${mErr?.message}`)
    matchId = match.id
    const { data: set, error: sErr } = await serviceClient.from('sets')
      .insert({ match_id: matchId, set_number: 1, first_serving_team: 'A' })
      .select('id').single()
    if (sErr || !set) throw new Error(`insertSet failed: ${sErr?.message}`)
    const setId = set.id

    // R1: floor × 最終打者 = 勝者 (in 相当のエース)。全ショット時刻あり
    //   s1 p0 serve_long → s2 p2 (種別未注釈・打点あり: ミラー検証) → s3 p0 smash (forehand・打点あり)
    await insertAnnotatedRally(serviceClient, setId, {
      rallyNumber: 1, servingTeam: 'A', server: p[0], receiver: p[2], pointWinner: 'A',
      endReason: 'floor', landX: 0.5, landY: 0.9,
      shots: [
        { hitPlayerId: p[0], shotType: 'serve_long', videoMs: 1000 },
        { hitPlayerId: p[2], hitX: 0.2, hitY: 0.3, videoMs: 2000 },
        { hitPlayerId: p[0], shotType: 'smash', hand: 'forehand', hitX: 0.4, hitY: 0.75, videoMs: 2400 }
      ]
    })
    // R2: net (相手ミスで A 獲得)。4 打構成: 決定打 = 3 打目 drive。s2 以降時刻なし → 全時刻ありでない
    await insertAnnotatedRally(serviceClient, setId, {
      rallyNumber: 2, servingTeam: 'A', server: p[0], receiver: p[2], pointWinner: 'A',
      endReason: 'net',
      shots: [
        { hitPlayerId: p[0], shotType: 'serve_short', videoMs: 1000 },
        { hitPlayerId: p[2], shotType: 'receive_short', videoMs: null },
        { hitPlayerId: p[0], shotType: 'drive', videoMs: null },
        // 4 打目 (rn>=3) + 打点あり + ネット決着 → placement で dest_kind='net' (#4/#5)
        { hitPlayerId: p[2], shotType: 'hairpin', hitX: 0.6, hitY: 0.7, videoMs: null }
      ]
    })
    // R3: floor × 最終打者 = 敗者 (out 相当の自ミス)。land は x 範囲外 (side out)。クランプ検証の打点つき
    await insertAnnotatedRally(serviceClient, setId, {
      rallyNumber: 3, servingTeam: 'A', server: p[0], receiver: p[2], pointWinner: 'B',
      endReason: 'floor', landX: 1.2, landY: 0.5,
      shots: [
        { hitPlayerId: p[0], shotType: 'serve_long', videoMs: 1000 },
        { hitPlayerId: p[2], shotType: 'lob_low', videoMs: 1500 },
        { hitPlayerId: p[1], shotType: 'smash', hitX: 0.5, hitY: 1.05, videoMs: 2000 }
      ]
    })
    // R4: レット (行は存在するが全統計から除外, REQ-101)
    await insertAnnotatedRally(serviceClient, setId, {
      rallyNumber: 4, servingTeam: 'A', server: p[0], receiver: p[2], pointWinner: null, isLet: true,
      shots: [{ hitPlayerId: p[0], shotType: 'serve_short', videoMs: 1000 }]
    })
    // R5: 未確定 (除外)
    await insertAnnotatedRally(serviceClient, setId, {
      rallyNumber: 5, servingTeam: 'A', server: p[0], receiver: p[2], pointWinner: null, isPointConfirmed: false
    })
    // R6: service_fault (決定打なし・サーブミス)
    await insertAnnotatedRally(serviceClient, setId, {
      rallyNumber: 6, servingTeam: 'A', server: p[0], receiver: p[2], pointWinner: 'B',
      endReason: 'service_fault',
      shots: [{ hitPlayerId: p[0], shotType: 'serve_short', videoMs: 1000 }]
    })
  }, 30000)

  afterAll(async () => {
    if (groupId) await cleanupUserBData(serviceClient, groupId)
  }, 30000)

  // ---- stats_annotation_coverage ----

  it('REQ-002/003: 注釈率の分母分子 (確定ラリーのみ・レット/未確定除外)', async () => {
    const { data, error } = await userAClient.rpc('stats_annotation_coverage', { p_match_id: matchId })
    expect(error).toBeNull()
    const row = (data as Array<Record<string, number | string>>)[0]!
    // 確定ラリー = R1,R2,R3,R6 (R4 レット / R5 未確定は除外)
    expect(Number(row.rallies_total)).toBe(4)
    expect(Number(row.rallies_ended)).toBe(4)
    expect(Number(row.shots_total)).toBe(11) // 3+4+3+1
    expect(Number(row.shots_typed)).toBe(10) // R1 s2 のみ未注釈
    expect(Number(row.shots_pointed)).toBe(4) // R1 s2/s3, R2 s2, R3 s3
    expect(Number(row.shots_handed)).toBe(1) // R1 s3 forehand
    expect(Number(row.shots_attributed)).toBe(11)
    expect(Number(row.rallies_fully_timed)).toBe(3) // R1,R3,R6 (R2 は s2 時刻なし)
  })

  // ---- stats_rally_endings + 純関数突き合わせ (REQ-406) ----

  it('REQ-005/104: 決定打が decisiveShotIndex と同一規則で導出される (TC-406-01)', async () => {
    const { data, error } = await userAClient.rpc('stats_rally_endings', { p_match_id: matchId })
    expect(error).toBeNull()
    const rows = (data as Array<Record<string, unknown>>)
      .slice()
      .sort((a, b) => Number(a.rally_number) - Number(b.rally_number))
    expect(rows.length).toBe(4) // 確定ラリーのみ

    // R1: floor × 勝者最終打 → 決定打 = 最終 smash。純関数: decisiveShotIndex(3,'floor',true) = 2 (0-based)
    expect(decisiveShotIndex(3, 'floor', true)).toBe(2)
    expect(rows[0]!.last_hitter_team).toBe('A')
    expect(rows[0]!.decisive_shot_type).toBe('smash')

    // R2: net → 決定打 = 1 つ前 drive。純関数: decisiveShotIndex(4,'net') = 2
    expect(decisiveShotIndex(4, 'net')).toBe(2)
    expect(rows[1]!.decisive_shot_type).toBe('drive')

    // R3: floor × 敗者最終打 → 決定打 = 1 つ前 lob_low。純関数: decisiveShotIndex(3,'floor',false) = 1
    expect(decisiveShotIndex(3, 'floor', false)).toBe(1)
    expect(rows[2]!.last_hitter_team).toBe('A')
    expect(rows[2]!.decisive_shot_type).toBe('lob_low')

    // R6: service_fault → 決定打なし。純関数: null
    expect(decisiveShotIndex(1, 'service_fault')).toBeNull()
    expect(rows[3]!.decisive_shot_type).toBeNull()
  })

  it('REQ-103: land 座標から out 細分をクライアント導出できる (deriveOutDirection 一致)', async () => {
    const { data } = await userAClient.rpc('stats_rally_endings', { p_match_id: matchId })
    const r3 = (data as Array<Record<string, unknown>>).find(r => Number(r.rally_number) === 3)!
    // R3 の land (1.2, 0.5) は x 範囲外 → side。RPC は生座標を返し導出はクライアント責務
    expect(Number(r3.land_x)).toBeCloseTo(1.2, 5)
    expect(deriveOutDirection({ x: Number(r3.land_x), y: Number(r3.land_y) })).toBe('side')
  })

  // ---- stats_shot_types ----

  it('REQ-009/010: 球種 grain の総打数・決定打・ミス・ラリー得点率素材', async () => {
    const { data, error } = await userAClient.rpc('stats_shot_types', { p_match_id: matchId })
    expect(error).toBeNull()
    const rows = data as Array<Record<string, number | string | null>>
    const find = (pid: string, stype: string | null) =>
      rows.find(r => r.hit_player_id === pid && r.shot_type === stype)

    // p0 serve_short (R2 / R6 サーブミス): shots2, serve_first2, serve_won1, miss1。
    // R2 の決定打は 4 打構成化で drive になったため serve_short の decisive は 0
    const p0short = find(p[0], 'serve_short')!
    expect(Number(p0short.shots)).toBe(2)
    expect(Number(p0short.serve_first_shots)).toBe(2)
    expect(Number(p0short.serve_won)).toBe(1)
    expect(Number(p0short.decisive_won)).toBe(0)
    expect(Number(p0short.miss_lost)).toBe(1)
    // R2 の決定打 = p0 drive
    expect(Number(find(p[0], 'drive')!.decisive_won)).toBe(1)
    expect(Number(p0short.rallies)).toBe(2)
    expect(Number(p0short.rallies_won)).toBe(1)

    // p0 smash (R1 エース): 決定打1・ミス0
    const p0smash = find(p[0], 'smash')!
    expect(Number(p0smash.decisive_won)).toBe(1)
    expect(Number(p0smash.miss_lost)).toBe(0)
    expect(p0smash.hand).toBe('forehand')

    // p1 smash (R3 アウト): ミス1・decisive 0
    const p1smash = find(p[1], 'smash')!
    expect(Number(p1smash.miss_lost)).toBe(1)
    expect(Number(p1smash.decisive_won)).toBe(0)

    // p2 hairpin (R2 ネットミス): ミス1
    expect(Number(find(p[2], 'hairpin')!.miss_lost)).toBe(1)

    // p2 lob_low (R3 決定打・B 勝ち): decisive1, rallies_won1
    const p2lob = find(p[2], 'lob_low')!
    expect(Number(p2lob.decisive_won)).toBe(1)
    expect(Number(p2lob.rallies_won)).toBe(1)

    // R1 s2 (種別未注釈) は shot_type null の grain に入る (母数併記用, REQ-108)
    expect(find(p[2], null)).toBeDefined()
  })

  it('REQ-004: p_set_number でセット絞り込みできる', async () => {
    const all = await userAClient.rpc('stats_shot_types', { p_match_id: matchId, p_set_number: 1 })
    expect((all.data as unknown[]).length).toBeGreaterThan(0)
    const none = await userAClient.rpc('stats_shot_types', { p_match_id: matchId, p_set_number: 2 })
    expect((none.data as unknown[]).length).toBe(0)
  })

  // ---- stats_shot_zones ----

  // 注: stats_shot_zones は placement へ置換済み (アプリ未使用・旧向き規則) のためテスト撤去 (2026-08-08)

  it('REQ-004: p_hand で配球ペアを絞り込める', async () => {
    const { data } = await userAClient.rpc('stats_shot_placement', { p_match_id: matchId, p_hand: 'forehand' })
    const rows = data as Array<Record<string, number | string | null>>
    // forehand + 打点ありは R1 s3 (p0 smash) のみ
    expect(rows.length).toBe(1)
    expect(rows[0]!.hit_player_id).toBe(p[0])
    expect(rows[0]!.shot_type).toBe('smash')
  })

  // ---- stats_rally_tempo ----

  it('REQ-106/016: 全ショット時刻あり判定の素材と last3 間隔を返す', async () => {
    const { data, error } = await userAClient.rpc('stats_rally_tempo', { p_match_id: matchId })
    expect(error).toBeNull()
    const rows = (data as Array<Record<string, number | null>>)
      .slice()
      .sort((a, b) => Number(a.rally_number) - Number(b.rally_number))
    expect(rows.length).toBe(4) // 確定のみ

    // R1: 3本全て時刻あり。duration 1400ms、last3 = (2400-1000)/2 = 700ms
    expect(Number(rows[0]!.shot_count)).toBe(3)
    expect(Number(rows[0]!.timed_count)).toBe(3)
    expect(Number(rows[0]!.duration_ms)).toBe(1400)
    expect(Number(rows[0]!.last3_avg_interval_ms)).toBeCloseTo(700, 3)

    // R2: 4本中3本時刻なし → timed_count 1 (クライアントで対象外判定, REQ-106)
    expect(Number(rows[1]!.shot_count)).toBe(4)
    expect(Number(rows[1]!.timed_count)).toBe(1)

    // R3: 全時刻あり。duration 1000ms、last3 500ms
    expect(Number(rows[2]!.duration_ms)).toBe(1000)
    expect(Number(rows[2]!.last3_avg_interval_ms)).toBeCloseTo(500, 3)

    // R6: 1本 → duration 0・last3 null (EDGE-102/104 素材)
    expect(Number(rows[3]!.shot_count)).toBe(1)
    expect(rows[3]!.last3_avg_interval_ms).toBeNull()
  })

  // ---- stats_shot_placement ----

  it('配球ペア: コート内は origin/dest セル、ネット・アウトは dest_kind で区別して返す (#4)', async () => {
    const { data, error } = await userAClient.rpc('stats_shot_placement', { p_match_id: matchId })
    expect(error).toBeNull()
    const rows = data as Array<Record<string, number | string | null>>
    // R1 s3 (p0 smash, 打点 0.4/0.75, cam=B・チームA → x のみ反転): origin = 自陣ネット側 (2,1)。
    // 最終打 → land (0.5,0.9) コート内 = 相手バック中央 (2,1)
    const smash = rows.find(r => r.hit_player_id === p[0] && r.shot_type === 'smash')!
    expect(smash.dest_kind).toBe('in')
    expect(Number(smash.origin_row)).toBe(2)
    expect(Number(smash.origin_col)).toBe(1)
    expect(Number(smash.dest_row)).toBe(2)
    expect(Number(smash.dest_col)).toBe(1)
    expect(Number(smash.shots)).toBe(1)
    // R1 s2 (p2, rn=2) はレシーブのため対象外 (#5: 3打目以降のみ)
    expect(rows.find(r => r.hit_player_id === p[2] && r.shot_type === null)).toBeUndefined()
    // R3 s3 (p1 smash): floor × land (1.2, 0.5) 範囲外 → x 反転で (-0.2, 0.5) = 左アウト。寄せない (#4)
    const outRow = rows.find(r => r.hit_player_id === p[1] && r.shot_type === 'smash')!
    expect(outRow.dest_kind).toBe('out')
    expect(outRow.dest_out).toBe('left')
    expect(outRow.dest_row).toBeNull()
    // R2 s2 (p2 hairpin): ネット決着の最終打 → dest_kind='net' (従来は集計から消えていた)
    const netRow = rows.find(r => r.hit_player_id === p[2] && r.shot_type === 'hairpin')!
    expect(netRow.dest_kind).toBe('net')
    expect(netRow.dest_row).toBeNull()
  })

  // ---- stats_serve_types ----

  it('REQ-008: サーブ種別 × ポジション grain で母数・勝数を返す', async () => {
    const { data, error } = await userAClient.rpc('stats_serve_types', { p_match_id: matchId })
    expect(error).toBeNull()
    const rows = data as Array<Record<string, number | string | null>>
    // p0 serve_long: R1 (A勝) + R3 (B勝) → total 2 / won 1。全ラリー right ポジション
    const long = rows.find(r => r.server_player_id === p[0] && r.shot_type === 'serve_long')!
    expect(long.server_position).toBe('right')
    expect(Number(long.total)).toBe(2)
    expect(Number(long.won)).toBe(1)
    // p0 serve_short: R2 (A勝) + R6 (service_fault, B勝) → total 2 / won 1
    const short = rows.find(r => r.server_player_id === p[0] && r.shot_type === 'serve_short')!
    expect(Number(short.total)).toBe(2)
    expect(Number(short.won)).toBe(1)
  })

  // ---- stats_receive_types ----

  it('#5: レシーブ種別 × サーブ位置 grain。レシーブ不発生 (service_fault 等) は除外', async () => {
    const { data, error } = await userAClient.rpc('stats_receive_types', { p_match_id: matchId })
    expect(error).toBeNull()
    const rows = data as Array<Record<string, number | string | null>>
    // レシーバーは全ラリー p2。R1 = 未注釈 / R2 = receive_short / R3 = lob_low。R6 (1打のみ) は除外
    expect(rows.reduce((s, r) => s + Number(r.total), 0)).toBe(3)
    const rShort = rows.find(r => r.shot_type === 'receive_short')!
    expect(rShort.receiver_player_id).toBe(p[2])
    expect(Number(rShort.total)).toBe(1)
    expect(Number(rShort.won)).toBe(0) // R2 は A (サーブ側) の得点
    const rLob = rows.find(r => r.shot_type === 'lob_low')!
    expect(Number(rLob.won)).toBe(1) // R3 は B (レシーブ側) の得点
  })

  // ---- RLS / invalid_scope ----

  it('NFR-101: 他 Group の userB は 5 RPC いずれも 0 件', async () => {
    for (const fn of [
      'stats_annotation_coverage', 'stats_shot_types', 'stats_shot_zones',
      'stats_rally_endings', 'stats_rally_tempo', 'stats_serve_types', 'stats_shot_placement',
      'stats_receive_types'
    ]) {
      const { data, error } = await userBClient.rpc(fn, { p_match_id: matchId })
      expect(error, fn).toBeNull()
      expect((data as unknown[]).length, fn).toBe(0)
    }
  })

  it('invalid_scope: スコープ未指定はエラー (TC-401 系)', async () => {
    const { error } = await userAClient.rpc('stats_shot_types', {})
    expect(error).not.toBeNull()
    expect(error!.message).toContain('invalid_scope')
  })
})
