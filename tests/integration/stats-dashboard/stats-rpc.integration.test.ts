/**
 * TASK-0003 / TASK-0004: stats-dashboard 集計 RPC 統合テスト
 *
 * テスト対象（読み取り専用 RPC, SECURITY INVOKER）:
 *   - stats_player_rates  (TASK-0003)
 *   - stats_pair_rates    (TASK-0003)
 *   - stats_rally_length  (TASK-0004)
 *   - stats_rallies       (TASK-0004)
 *
 * 実行: pnpm test:integration (CI 専用、vitest.integration.config.ts、fileParallelism: false)
 *
 * 【方針】
 * - globalSetup の User A を inject('users') で取得し、その user_id を所有者とする Group を service_role で作成。
 * - 確定/レット/未確定ラリーを混在させ、確定ラリーのみ集計されること（REQ-101）を検証。
 * - ペアは A/B ラベル非依存（同じ 2 人が別試合で別サイドでも同一ペアとして累計, REQ-012）を検証。
 * - RLS（他 Group の userB は 0 件, NFR-101）と invalid_scope を検証。
 * - afterAll で cleanupUserBData によりデータをリークさせない。
 */
import { describe, it, expect, beforeAll, afterAll, inject } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createGroupForUserB, createPlayer, cleanupUserBData } from '../helpers/rls-fixtures'

const url = process.env.NUXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NUXT_PUBLIC_SUPABASE_KEY
const serviceRoleKey = process.env.NUXT_SUPABASE_SECRET_KEY
const skip = !url || !anonKey || !serviceRoleKey

// ラリー1件を service_role で投入するローカルヘルパー（テスト専用の最小投入）
async function insertRally(
  client: SupabaseClient,
  setId: string,
  opts: {
    rallyNumber: number
    servingTeam: 'A' | 'B'
    server: string
    receiver: string
    pointWinner: 'A' | 'B' | null
    isLet?: boolean
    isPointConfirmed?: boolean
    videoMs?: number | null
    shots?: number
  }
): Promise<string> {
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
    video_start_timestamp_ms: opts.videoMs ?? null
  }).select('id').single()
  if (error || !data) throw new Error(`insertRally failed: ${error?.message}`)
  // ショットは 1 回の insert にまとめて round-trip を削減（beforeAll タイムアウト対策）
  const shotRows = Array.from({ length: opts.shots ?? 0 }, (_, i) => ({
    rally_id: data.id, shot_number: i + 1, input_source: 'manual'
  }))
  if (shotRows.length > 0) {
    const { error: shotErr } = await client.from('shots').insert(shotRows)
    if (shotErr) throw new Error(`insertShots failed: ${shotErr.message}`)
  }
  return data.id
}

async function insertMatchWithSet(
  client: SupabaseClient,
  groupId: string,
  teamA: [string, string],
  teamB: [string, string]
): Promise<{ matchId: string, setId: string }> {
  const { data: match, error: mErr } = await client.from('matches').insert({
    group_id: groupId,
    team_a_player1_id: teamA[0],
    team_a_player2_id: teamA[1],
    team_b_player1_id: teamB[0],
    team_b_player2_id: teamB[1],
    video_source_type: 'youtube',
    video_source_url: 'https://youtu.be/stats-test'
  }).select('id').single()
  if (mErr || !match) throw new Error(`insertMatch failed: ${mErr?.message}`)
  const { data: set, error: sErr } = await client.from('sets')
    .insert({ match_id: match.id, set_number: 1, first_serving_team: 'A' })
    .select('id').single()
  if (sErr || !set) throw new Error(`insertSet failed: ${sErr?.message}`)
  return { matchId: match.id, setId: set.id }
}

describe.skipIf(skip)('stats-dashboard 集計 RPC 統合テスト', () => {
  let serviceClient: SupabaseClient
  let userAClient: SupabaseClient
  let userBClient: SupabaseClient
  let groupId: string
  let p: string[] // [p0, p1, p2, p3]
  let match1Id: string
  let pairKey: (a: string, b: string) => [string, string]

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
    pairKey = (a, b) => (a < b ? [a, b] : [b, a])

    // match1: teamA={p0,p1}, teamB={p2,p3}
    const m1 = await insertMatchWithSet(serviceClient, groupId, [p[0], p[1]], [p[2], p[3]])
    match1Id = m1.matchId
    // R1: A serve(p0)/recv(p2) → A 得点（サーブ側勝, shots=3）
    await insertRally(serviceClient, m1.setId, { rallyNumber: 1, servingTeam: 'A', server: p[0], receiver: p[2], pointWinner: 'A', videoMs: 1000, shots: 3 })
    // R2: A serve(p0)/recv(p2) → B 得点（レシーブ側勝, shots=6）
    await insertRally(serviceClient, m1.setId, { rallyNumber: 2, servingTeam: 'A', server: p[0], receiver: p[2], pointWinner: 'B', videoMs: 2000, shots: 6 })
    // R3: A serve(p0)/recv(p2) → A 得点（shots=10）
    await insertRally(serviceClient, m1.setId, { rallyNumber: 3, servingTeam: 'A', server: p[0], receiver: p[2], pointWinner: 'A', videoMs: 3000, shots: 10 })
    // R4: レット → 除外
    await insertRally(serviceClient, m1.setId, { rallyNumber: 4, servingTeam: 'A', server: p[0], receiver: p[2], pointWinner: null, isLet: true, videoMs: 4000, shots: 2 })
    // R5: 未確定 → 除外
    await insertRally(serviceClient, m1.setId, { rallyNumber: 5, servingTeam: 'A', server: p[0], receiver: p[2], pointWinner: null, isPointConfirmed: false, videoMs: 5000, shots: 0 })

    // match2: teamA={p2,p3}, teamB={p0,p1}（同じ 2 人がサイド入替）→ ペア A/B 非依存累計の検証用
    const m2 = await insertMatchWithSet(serviceClient, groupId, [p[2], p[3]], [p[0], p[1]])
    // R1: B serve(p0)/recv(p2) → B 得点（{p0,p1} が serving 側で勝, shots=4）
    await insertRally(serviceClient, m2.setId, { rallyNumber: 1, servingTeam: 'B', server: p[0], receiver: p[2], pointWinner: 'B', videoMs: 1000, shots: 4 })
  }, 30000)

  afterAll(async () => {
    if (groupId) await cleanupUserBData(serviceClient, groupId)
  }, 30000)

  // ---- TASK-0003: stats_player_rates ----

  it('TC-003-01: 選手別 サービス得点率の母数・分子（確定のみ）', async () => {
    const { data, error } = await userAClient.rpc('stats_player_rates', { p_match_id: match1Id })
    expect(error).toBeNull()
    const row = (data as Array<Record<string, number | string>>).find(r => r.player_id === p[0])
    // p0 はサーバー: 確定3件(R1,R2,R3)、うちサーブ側勝=R1,R3 → 2/3。レット/未確定は除外
    expect(Number(row!.serve_total)).toBe(3)
    expect(Number(row!.serve_won)).toBe(2)
  })

  it('TC-101-01: レシーブ得点率もレット・未確定を除外して算出', async () => {
    const { data } = await userAClient.rpc('stats_player_rates', { p_match_id: match1Id })
    const row = (data as Array<Record<string, number | string>>).find(r => r.player_id === p[2])
    // p2 はレシーバー: 確定3件、うちレシーブ側勝=R2 のみ → 1/3
    expect(Number(row!.receive_total)).toBe(3)
    expect(Number(row!.receive_won)).toBe(1)
  })

  // ---- TASK-0003: stats_pair_rates ----

  it('REQ-012: ペア別得点率は A/B ラベル非依存で複数試合を累計', async () => {
    const { data, error } = await userAClient.rpc('stats_pair_rates', { p_group_id: groupId })
    expect(error).toBeNull()
    const [a, b] = pairKey(p[0], p[1])
    const row = (data as Array<Record<string, number | string>>)
      .find(r => r.player1_id === a && r.player2_id === b)
    // ペア{p0,p1}: match1 で serving 側(team A) 確定3件・勝2(R1,R3) + match2 で serving 側(team B) 1件・勝1
    expect(Number(row!.serve_total)).toBe(4)
    expect(Number(row!.serve_won)).toBe(3)
  })

  // ---- RLS / invalid_scope ----

  it('NFR-101: 他 Group の userB は集計結果を取得できない（0 件）', async () => {
    const { data, error } = await userBClient.rpc('stats_player_rates', { p_match_id: match1Id })
    expect(error).toBeNull()
    expect((data as unknown[]).length).toBe(0)
  })

  it('invalid_scope: スコープ未指定（両方 NULL）はエラー', async () => {
    const { error } = await userAClient.rpc('stats_player_rates', {})
    expect(error).not.toBeNull()
    expect(error!.message).toContain('invalid_scope')
  })

  // ---- TASK-0004: stats_rally_length ----

  it('TC-005 / EDGE-102: ラリー長別 本数分布 + サーブ側勝数（shot0・レット・未確定は除外）', async () => {
    const { data, error } = await userAClient.rpc('stats_rally_length', { p_match_id: match1Id })
    expect(error).toBeNull()
    const rows = data as Array<Record<string, number>>
    // 確定ラリーは R1(shots3,A勝) / R2(shots6,B勝) / R3(shots10,A勝)。shot0/レット/未確定は対象外
    const byCount = Object.fromEntries(rows.map(r => [Number(r.shot_count), r]))
    expect(Object.keys(byCount).sort()).toEqual(['10', '3', '6'])
    expect(Number(byCount[3].rallies)).toBe(1)
    expect(Number(byCount[3].serve_won)).toBe(1) // R1 サーブ側勝
    expect(Number(byCount[6].serve_won)).toBe(0) // R2 レシーブ側勝
    expect(Number(byCount[10].serve_won)).toBe(1) // R3 サーブ側勝
    expect(rows.some(r => Number(r.shot_count) === 0)).toBe(false)
  })

  // ---- TASK-0004: stats_rallies ----

  it('REQ-006: ラリー行は全ライブラリー（レット・未確定含む）+ 動画ソースを返す', async () => {
    const { data, error } = await userAClient.rpc('stats_rallies', { p_match_id: match1Id })
    expect(error).toBeNull()
    const rows = data as Array<Record<string, unknown>>
    expect(rows.length).toBe(5)
    expect(rows.every(r => typeof r.video_source_url === 'string')).toBe(true)
  })

  it('U-06: ラリー開始時スコアを積算（レット/未確定は加点せず）。ショット時刻なしは時間 null', async () => {
    const { data } = await userAClient.rpc('stats_rallies', { p_match_id: match1Id })
    const rows = (data as Array<Record<string, number | null>>)
      .slice()
      .sort((a, b) => Number(a.rally_number) - Number(b.rally_number))
    // R1=0-0, R2=1-0(R1 A), R3=1-1(R1 A,R2 B), R4(let)=2-1, R5(未確定)=2-1
    expect(rows.map(r => `${r.score_a}-${r.score_b}`)).toEqual(['0-0', '1-0', '1-1', '2-1', '2-1'])
    // シードのショットは video_timestamp_ms 未設定 → ラリー時間は null
    expect(rows.every(r => r.rally_duration_ms === null)).toBe(true)
  })

  it('REQ-010: ラリー長ビンの和集合（OR）で絞り込む', async () => {
    const { data } = await userAClient.rpc('stats_rallies', {
      p_match_id: match1Id,
      p_shot_ranges: [{ min: 1, max: 3 }]
    })
    const rows = data as Array<Record<string, number>>
    // shot_count in [1,3] → R1(3), R4(2)
    expect(rows.length).toBe(2)
    expect(rows.every(r => Number(r.shot_count) >= 1 && Number(r.shot_count) <= 3)).toBe(true)
  })

  it('REQ-012: ペア×役割連動 — receive 役割では serving 側ペアのラリーは除外', async () => {
    // match1 は全ラリー serving=A。ペア{p0,p1}=team A。
    const serveRes = await userAClient.rpc('stats_rallies', {
      p_match_id: match1Id, p_pair_player1_id: p[0], p_pair_player2_id: p[1], p_role: 'serve'
    })
    expect((serveRes.data as unknown[]).length).toBe(5) // 全ラリーで {p0,p1} が serving 側
    const receiveRes = await userAClient.rpc('stats_rallies', {
      p_match_id: match1Id, p_pair_player1_id: p[0], p_pair_player2_id: p[1], p_role: 'receive'
    })
    expect((receiveRes.data as unknown[]).length).toBe(0) // {p0,p1} が受け側のラリーは match1 に無い
  })
})
