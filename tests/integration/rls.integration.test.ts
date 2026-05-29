/**
 * TASK-0014: RLS 統合テスト
 *
 * テスト対象: Supabase RLS ポリシーによるテナント分離
 * 実行コマンド: pnpm test:integration
 * 設定ファイル: vitest.integration.config.ts
 *
 * 【テスト方針】
 * - User B のデータを service_role で事前投入
 * - User A としてアクセス試行し、RLS フィルタが正しく機能することを確認
 * - SELECT → 空集合、INSERT → error、UPDATE → 影響行数 0 を検証
 * - 自 Group へのアクセス成功確認は TASK-0015 (RPC テスト) でカバー
 */

import { describe, it, expect, beforeAll, afterAll, inject } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  createGroupForUserB,
  createPlayer,
  createMatch,
  createSet,
  createSetPlayerPosition,
  createRally,
  createShot,
  createPositionOverride,
  createRecordingGap,
  createInvitation,
  cleanupUserBData
} from './helpers/rls-fixtures'

// ========================================
// 環境変数チェック
// ========================================

const url = process.env.NUXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NUXT_PUBLIC_SUPABASE_KEY
const serviceRoleKey = process.env.NUXT_SUPABASE_SECRET_KEY
const skip = !url || !anonKey || !serviceRoleKey

// ========================================
// テスト本体
// ========================================

describe.skipIf(skip)('RLS 統合テスト: TASK-0014', () => {
  // ========================================
  // テスト共有変数
  // ========================================

  let serviceClient: SupabaseClient
  let userAClient: SupabaseClient
  let anonClient: SupabaseClient

  // User B Group 配下のテストデータ ID
  let userBGroupId: string
  let userBPlayerId: string
  let userBMatchId: string
  let userBSetId: string
  let userBSetPositionId: string
  let userBRallyId: string
  let userBShotId: string
  let userBPositionOvId: string
  let userBRecordingGapId: string
  let userBInvitationId: string

  // User A/B の情報
  let userAEmail: string
  let userAPassword: string
  let userBId: string

  // ========================================
  // beforeAll: テストデータ投入 + User A ログイン
  // ========================================

  beforeAll(async () => {
    // 【テスト前準備】: TASK-0013 globalSetup が作成し provide した User A/B を取得
    // 【環境初期化】: dev プロジェクトに対する RLS 統合テストの全 fixture を構築
    const { userA, userB } = inject('users')
    userAEmail = userA.email
    userAPassword = userA.password
    userBId = userB.id

    // service_role クライアント（RLS バイパス、テストデータ投入用）
    serviceClient = createClient(url!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // 【初期条件設定】: User B 名義で Group + 配下 11 種データを service_role で投入
    userBGroupId = await createGroupForUserB(serviceClient, userBId)

    // matches には 4 名の選手が必要（全員別人・同一 Group）
    const p1 = await createPlayer(serviceClient, userBGroupId)
    const p2 = await createPlayer(serviceClient, userBGroupId)
    const p3 = await createPlayer(serviceClient, userBGroupId)
    const p4 = await createPlayer(serviceClient, userBGroupId)
    userBPlayerId = p1

    userBMatchId = await createMatch(serviceClient, userBGroupId, [p1, p2, p3, p4])
    userBSetId = await createSet(serviceClient, userBMatchId)
    userBSetPositionId = await createSetPlayerPosition(serviceClient, userBSetId, userBPlayerId)
    userBRallyId = await createRally(serviceClient, userBSetId, userBPlayerId)
    userBShotId = await createShot(serviceClient, userBRallyId)
    userBPositionOvId = await createPositionOverride(serviceClient, userBRallyId)
    userBRecordingGapId = await createRecordingGap(serviceClient, userBSetId)
    userBInvitationId = await createInvitation(serviceClient, userBGroupId, userBId)

    // 【User A 認証セッション準備】: signInWithPassword で JWT を保持
    userAClient = createClient(url!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
    const { error: signInError } = await userAClient.auth.signInWithPassword({
      email: userAEmail,
      password: userAPassword
    })
    if (signInError) throw new Error(`User A signIn failed: ${signInError.message}`)

    // 【匿名クライアント】: TC-14-29 用（未認証）
    anonClient = createClient(url!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  }, 60_000)

  afterAll(async () => {
    // 【テスト後処理】: User B 配下データを service_role で物理削除
    // 【状態復元】: 次回テスト実行時に orphan data が残らないよう service_role で明示削除
    if (userBGroupId) {
      await cleanupUserBData(serviceClient, userBGroupId)
    }
    await userAClient?.auth.signOut()
  }, 60_000)

  // ========================================
  // TC-14-01〜11: SELECT 境界値テスト（11 テーブル × User A → User B Group）
  // ========================================

  describe('RLS SELECT: User A は User B Group のデータを取得できない', () => {
    it('TC-14-01: groups - User A は User B の Group を SELECT しても空集合', async () => {
      // 【テスト目的】: groups テーブルの RLS SELECT ポリシーが is_member_of(id) で User A をフィルタアウトすること
      // 【テスト内容】: userAClient で User B の group_id を eq 指定して SELECT を実行
      // 【期待される動作】: data === []、error === null（RLS により空集合を返す）
      // 🔵 信頼性レベル: REQ-101 + EDGE-003 + NFR-104 + マイグレーション DDL に基づく

      // 【テストデータ準備】: beforeAll で User B Group を service_role で投入済み
      // 【初期条件設定】: User A は userBGroupId の group_members に存在しない

      // 【実際の処理実行】: userAClient で他 Group の groups 行取得を試行
      // 【処理内容】: PostgREST SELECT に対して RLS USING `is_member_of(id)` が走る
      const { data, error } = await userAClient
        .from('groups')
        .select('*')
        .eq('id', userBGroupId)

      // 【結果検証】: RLS フィルタにより data が空配列、error は null
      // 【期待値確認】: REQ-101（自 Group のみアクセス可）+ EDGE-003（他 Group SELECT は空集合）
      expect(data).toEqual([]) // 【確認内容】: 他 Group の groups 行は取得不可（空配列）🔵
      expect(error).toBeNull() // 【確認内容】: SELECT 自体はエラーではない（RLS は USING で行フィルタ）🔵
    })

    it('TC-14-02: group_members - User A は User B Group の group_members を SELECT しても空集合', async () => {
      // 【テスト目的】: group_members テーブルの RLS SELECT ポリシーが is_member_of(group_id) で User A をフィルタアウトすること
      // 【テスト内容】: userAClient で userBGroupId の group_members を SELECT
      // 【期待される動作】: data === []、error === null
      // 🔵 信頼性レベル: REQ-101 + EDGE-003 + NFR-104

      const { data, error } = await userAClient
        .from('group_members')
        .select('*')
        .eq('group_id', userBGroupId)

      expect(data).toEqual([]) // 【確認内容】: 他 Group の group_members は取得不可 🔵
      expect(error).toBeNull() // 【確認内容】: SELECT 自体はエラーなし 🔵
    })

    it('TC-14-03: players - User A は User B Group の players 行を SELECT しても空集合', async () => {
      // 【テスト目的】: players テーブルの RLS SELECT ポリシーが is_member_of(group_id) で User A をフィルタアウトすること
      // 【テスト内容】: userAClient で userBPlayerId を eq 指定して SELECT を実行
      // 【期待される動作】: data === []、error === null
      // 🔵 信頼性レベル: REQ-101 + EDGE-003 + NFR-104

      const { data, error } = await userAClient
        .from('players')
        .select('*')
        .eq('id', userBPlayerId)

      expect(data).toEqual([]) // 【確認内容】: 他 Group の players 行は取得不可（空配列）🔵
      expect(error).toBeNull() // 【確認内容】: SELECT 自体はエラーではない 🔵
    })

    it('TC-14-04: matches - User A は User B Group の matches 行を SELECT しても空集合', async () => {
      // 【テスト目的】: matches テーブルの RLS SELECT ポリシーが is_member_of(group_id) で User A をフィルタアウトすること
      // 🔵 信頼性レベル: REQ-101 + EDGE-003 + NFR-104

      const { data, error } = await userAClient
        .from('matches')
        .select('*')
        .eq('id', userBMatchId)

      expect(data).toEqual([]) // 【確認内容】: 他 Group の matches 行は取得不可 🔵
      expect(error).toBeNull() // 【確認内容】: SELECT 自体はエラーなし 🔵
    })

    it('TC-14-05: sets - User A は User B Group の sets 行を SELECT しても空集合', async () => {
      // 【テスト目的】: sets テーブルの RLS SELECT ポリシー（FK 経由 sets→matches）が機能すること
      // 🔵 信頼性レベル: REQ-101 + EDGE-003 + NFR-104

      const { data, error } = await userAClient
        .from('sets')
        .select('*')
        .eq('id', userBSetId)

      expect(data).toEqual([]) // 【確認内容】: 他 Group の sets 行は取得不可 🔵
      expect(error).toBeNull() // 【確認内容】: SELECT 自体はエラーなし 🔵
    })

    it('TC-14-06: set_player_positions - User A は User B Group の行を SELECT しても空集合', async () => {
      // 【テスト目的】: set_player_positions の RLS SELECT ポリシー（FK 経由 sets→matches）が機能すること
      // 🔵 信頼性レベル: REQ-101 + EDGE-003 + NFR-104

      const { data, error } = await userAClient
        .from('set_player_positions')
        .select('*')
        .eq('id', userBSetPositionId)

      expect(data).toEqual([]) // 【確認内容】: 他 Group の set_player_positions 行は取得不可 🔵
      expect(error).toBeNull() // 【確認内容】: SELECT 自体はエラーなし 🔵
    })

    it('TC-14-07: rallies - User A は User B Group の rallies 行を SELECT しても空集合', async () => {
      // 【テスト目的】: rallies の RLS SELECT ポリシー（FK 経由 sets→matches）が機能すること
      // 🔵 信頼性レベル: REQ-101 + EDGE-003 + NFR-104

      const { data, error } = await userAClient
        .from('rallies')
        .select('*')
        .eq('id', userBRallyId)

      expect(data).toEqual([]) // 【確認内容】: 他 Group の rallies 行は取得不可 🔵
      expect(error).toBeNull() // 【確認内容】: SELECT 自体はエラーなし 🔵
    })

    it('TC-14-08: shots - User A は User B Group の shots 行を SELECT しても空集合', async () => {
      // 【テスト目的】: shots の RLS SELECT ポリシー（FK 経由 rallies→sets→matches）が機能すること
      // 🔵 信頼性レベル: REQ-101 + EDGE-003 + NFR-104

      const { data, error } = await userAClient
        .from('shots')
        .select('*')
        .eq('id', userBShotId)

      expect(data).toEqual([]) // 【確認内容】: 他 Group の shots 行は取得不可 🔵
      expect(error).toBeNull() // 【確認内容】: SELECT 自体はエラーなし 🔵
    })

    it('TC-14-09: position_overrides - User A は User B Group の行を SELECT しても空集合', async () => {
      // 【テスト目的】: position_overrides の RLS SELECT ポリシー（FK 経由 rallies→sets→matches）が機能すること
      // 🔵 信頼性レベル: REQ-101 + EDGE-003 + NFR-104

      const { data, error } = await userAClient
        .from('position_overrides')
        .select('*')
        .eq('id', userBPositionOvId)

      expect(data).toEqual([]) // 【確認内容】: 他 Group の position_overrides 行は取得不可 🔵
      expect(error).toBeNull() // 【確認内容】: SELECT 自体はエラーなし 🔵
    })

    it('TC-14-10: recording_gaps - User A は User B Group の行を SELECT しても空集合', async () => {
      // 【テスト目的】: recording_gaps の RLS SELECT ポリシー（FK 経由 sets→matches）が機能すること
      // 🔵 信頼性レベル: REQ-101 + EDGE-003 + NFR-104

      const { data, error } = await userAClient
        .from('recording_gaps')
        .select('*')
        .eq('id', userBRecordingGapId)

      expect(data).toEqual([]) // 【確認内容】: 他 Group の recording_gaps 行は取得不可 🔵
      expect(error).toBeNull() // 【確認内容】: SELECT 自体はエラーなし 🔵
    })

    it('TC-14-11: group_invitations - User A は User B Group の行を SELECT しても空集合', async () => {
      // 【テスト目的】: group_invitations の RLS SELECT ポリシーが is_member_of(group_id) で User A をフィルタアウトすること
      // 🔵 信頼性レベル: REQ-101 + EDGE-003 + NFR-104

      const { data, error } = await userAClient
        .from('group_invitations')
        .select('*')
        .eq('id', userBInvitationId)

      expect(data).toEqual([]) // 【確認内容】: 他 Group の group_invitations 行は取得不可 🔵
      expect(error).toBeNull() // 【確認内容】: SELECT 自体はエラーなし 🔵
    })
  })

  // ========================================
  // TC-14-12〜18: 他テナント INSERT 拒否
  // ========================================

  describe('RLS INSERT: User A は User B Group に書き込めない', () => {
    it('TC-14-12: players - User A は User B Group に players を INSERT できない', async () => {
      // 【テスト目的】: players の WITH CHECK ポリシー `is_member_of(group_id)` が false を返し RLS で拒否されること
      // 【テスト内容】: userAClient で userBGroupId を指定した players INSERT を試行
      // 【期待される動作】: data === null、error !== null（RLS 拒否）
      // 🔵 信頼性レベル: REQ-101（テナント越境書き込み防止）+ マイグレーション DDL

      // 【実際の処理実行】: 他 Group への spoof INSERT を試行
      const { data, error } = await userAClient
        .from('players')
        .insert({ group_id: userBGroupId, name: 'spoof-player' })
        .select()
        .single()

      // 【結果検証】: RLS WITH CHECK により INSERT が拒否される
      expect(error).not.toBeNull() // 【確認内容】: 拒否エラーが返る（code: 42501 等）🔵
      expect(data).toBeNull() // 【確認内容】: 行が挿入されていない 🔵
    })

    it('TC-14-13: matches - User A は User B Group に matches を INSERT できない', async () => {
      // 【テスト目的】: matches の WITH CHECK ポリシー `is_member_of(group_id)` による拒否確認
      // 🔵 信頼性レベル: REQ-101

      const { data, error } = await userAClient
        .from('matches')
        .insert({
          group_id: userBGroupId,
          team_a_player1_id: userBPlayerId,
          team_a_player2_id: userBPlayerId,
          team_b_player1_id: userBPlayerId,
          team_b_player2_id: userBPlayerId,
          video_source_type: 'youtube',
          video_source_url: 'https://youtu.be/spoof'
        })
        .select()
        .single()

      expect(error).not.toBeNull() // 【確認内容】: 他 Group への matches INSERT は拒否 🔵
      expect(data).toBeNull() // 【確認内容】: 行が挿入されていない 🔵
    })

    it('TC-14-14: sets - User A は User B Group の match に sets を INSERT できない', async () => {
      // 【テスト目的】: sets の WITH CHECK ポリシー（FK 経由で group_id を解決）による拒否確認
      // 🔵 信頼性レベル: REQ-101

      const { data, error } = await userAClient
        .from('sets')
        .insert({ match_id: userBMatchId, set_number: 99, first_serving_team: 'A' })
        .select()
        .single()

      expect(error).not.toBeNull() // 【確認内容】: 他 Group の match への sets INSERT は拒否 🔵
      expect(data).toBeNull() // 【確認内容】: 行が挿入されていない 🔵
    })

    it('TC-14-15: rallies - User A は User B Group の set に rallies を INSERT できない', async () => {
      // 【テスト目的】: rallies の WITH CHECK ポリシー（FK 経由で group_id を解決）による拒否確認
      // 🔵 信頼性レベル: REQ-101

      const { data, error } = await userAClient
        .from('rallies')
        .insert({
          set_id: userBSetId,
          rally_number: 99,
          serving_team: 'A',
          server_position: 'left',
          server_player_id: userBPlayerId,
          receiver_player_id: userBPlayerId
        })
        .select()
        .single()

      expect(error).not.toBeNull() // 【確認内容】: 他 Group の set への rallies INSERT は拒否 🔵
      expect(data).toBeNull() // 【確認内容】: 行が挿入されていない 🔵
    })

    it('TC-14-16: shots - User A は User B Group の rally に shots を INSERT できない', async () => {
      // 【テスト目的】: shots の WITH CHECK ポリシー（FK 経由 rallies→sets→matches）による拒否確認
      // 🔵 信頼性レベル: REQ-101

      const { data, error } = await userAClient
        .from('shots')
        .insert({ rally_id: userBRallyId, shot_number: 99 })
        .select()
        .single()

      expect(error).not.toBeNull() // 【確認内容】: 他 Group の rally への shots INSERT は拒否 🔵
      expect(data).toBeNull() // 【確認内容】: 行が挿入されていない 🔵
    })

    it('TC-14-17: position_overrides - User A は User B Group の rally に position_overrides を INSERT できない', async () => {
      // 【テスト目的】: position_overrides の WITH CHECK ポリシーによる拒否確認
      // 🔵 信頼性レベル: REQ-101

      const { data, error } = await userAClient
        .from('position_overrides')
        .insert({ rally_id: userBRallyId, team: 'A', override_type: 'swapped' })
        .select()
        .single()

      expect(error).not.toBeNull() // 【確認内容】: 他 Group の rally への position_overrides INSERT は拒否 🔵
      expect(data).toBeNull() // 【確認内容】: 行が挿入されていない 🔵
    })

    it('TC-14-18: recording_gaps - User A は User B Group の set に recording_gaps を INSERT できない', async () => {
      // 【テスト目的】: recording_gaps の WITH CHECK ポリシー（FK 経由 sets→matches）による拒否確認
      // 🔵 信頼性レベル: REQ-101

      const { data, error } = await userAClient
        .from('recording_gaps')
        .insert({ set_id: userBSetId })
        .select()
        .single()

      expect(error).not.toBeNull() // 【確認内容】: 他 Group の set への recording_gaps INSERT は拒否 🔵
      expect(data).toBeNull() // 【確認内容】: 行が挿入されていない 🔵
    })
  })

  // ========================================
  // TC-14-19〜21: RPC 経由必須テーブルへの直接 INSERT 拒否
  // ========================================

  describe('RLS INSERT 直接禁止: groups / group_members / group_invitations', () => {
    it('TC-14-19: groups - User A は groups テーブルに直接 INSERT できない（RPC 経由のみ許可）', async () => {
      // 【テスト目的】: スキーマレビュー ⑦ A-1: groups の直接 INSERT は禁止（INSERT ポリシーなし）
      // 【テスト内容】: userAClient で groups に直接 INSERT を試行
      // 【期待される動作】: error !== null（INSERT ポリシーが存在しないため RLS で拒否）
      // 🔵 信頼性レベル: スキーマレビュー ⑦ A-1 + マイグレーション DDL（INSERT ポリシーなし）

      // 【実際の処理実行】: RPC を経由せず直接 INSERT を試行
      const { data, error } = await userAClient
        .from('groups')
        .insert({ name: 'spoof-direct-group' })
        .select()
        .single()

      // 【結果検証】: INSERT ポリシーが存在しないため RLS で拒否される
      expect(error).not.toBeNull() // 【確認内容】: 直接 INSERT は拒否（RPC 経由のみ許可）🔵
      expect(data).toBeNull() // 【確認内容】: Group が作成されていない 🔵
    })

    it('TC-14-20: group_members - User A は group_members テーブルに直接 INSERT できない（RPC 経由のみ許可）', async () => {
      // 【テスト目的】: スキーマレビュー ⑦ A-2: group_members の直接 INSERT は禁止（INSERT ポリシーなし）
      // 🔵 信頼性レベル: スキーマレビュー ⑦ A-2 + マイグレーション DDL（INSERT ポリシーなし）

      const { data: userA } = await userAClient.auth.getUser()
      const userAId = userA.user?.id

      const { data, error } = await userAClient
        .from('group_members')
        .insert({ group_id: userBGroupId, user_id: userAId! })
        .select()
        .single()

      expect(error).not.toBeNull() // 【確認内容】: 直接 INSERT は拒否（RPC 経由のみ許可）🔵
      expect(data).toBeNull() // 【確認内容】: group_members への直接加入は不可 🔵
    })

    it('TC-14-21: group_invitations - User A は group_invitations テーブルに直接 INSERT できない（RPC 経由のみ許可）', async () => {
      // 【テスト目的】: スキーマレビュー ⑧ B-12: group_invitations の直接 INSERT は禁止（INSERT ポリシーなし）
      // 🔵 信頼性レベル: スキーマレビュー ⑧ B-12 + マイグレーション DDL（INSERT ポリシーなし）

      const { data: userA } = await userAClient.auth.getUser()
      const userAId = userA.user?.id
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

      const { data, error } = await userAClient
        .from('group_invitations')
        .insert({
          group_id: userBGroupId,
          code: 'SPOOF12',
          created_by: userAId!,
          expires_at: expiresAt
        })
        .select()
        .single()

      expect(error).not.toBeNull() // 【確認内容】: 直接 INSERT は拒否（RPC 経由のみ許可）🔵
      expect(data).toBeNull() // 【確認内容】: 招待コードの直接発行は不可 🔵
    })
  })

  // ========================================
  // TC-14-22〜28: 他テナント UPDATE 影響行数 0（EDGE-003 派生）
  // ========================================

  describe('RLS UPDATE: User A は User B Group の行を更新できない', () => {
    it('TC-14-22: players - User A は User B Group の players 行を UPDATE しても影響行数 0', async () => {
      // 【テスト目的】: players の USING ポリシー `is_member_of(group_id)` で行がフィルタアウトされ、UPDATE 対象 0 行
      // 【テスト内容】: userAClient で userBPlayerId の players を UPDATE 試行
      // 【期待される動作】: (data ?? []) === []、error === null（Supabase RLS UPDATE は空集合を返す）
      // 🔵 信頼性レベル: REQ-101 + EDGE-003 派生 + マイグレーション DDL

      // 【実際の処理実行】: 他 Group の players 行を改竄しようとする
      const { data, error } = await userAClient
        .from('players')
        .update({ name: 'hacked' })
        .eq('id', userBPlayerId)
        .select()

      // 【結果検証】: RLS USING ポリシーにより UPDATE 対象行数 0（空配列）
      expect(data ?? []).toEqual([]) // 【確認内容】: 他 Group の players 行は更新されない（影響行数 0）🔵
      expect(error).toBeNull() // 【確認内容】: UPDATE 自体はエラーではない（RLS は USING で行フィルタ）🔵
    })

    it('TC-14-23: matches - User A は User B Group の matches 行を UPDATE しても影響行数 0', async () => {
      // 【テスト目的】: matches の USING ポリシーによる UPDATE フィルタ確認
      // 🔵 信頼性レベル: REQ-101 + EDGE-003 派生

      const { data, error } = await userAClient
        .from('matches')
        .update({ video_source_url: 'https://evil.example.com' })
        .eq('id', userBMatchId)
        .select()

      expect(data ?? []).toEqual([]) // 【確認内容】: 他 Group の matches 行は更新されない 🔵
      expect(error).toBeNull() // 【確認内容】: UPDATE 自体はエラーなし 🔵
    })

    it('TC-14-24: sets - User A は User B Group の sets 行を UPDATE しても影響行数 0', async () => {
      // 【テスト目的】: sets の USING ポリシー（FK 経由）による UPDATE フィルタ確認
      // 🔵 信頼性レベル: REQ-101 + EDGE-003 派生

      const { data, error } = await userAClient
        .from('sets')
        .update({ winner: 'A' })
        .eq('id', userBSetId)
        .select()

      expect(data ?? []).toEqual([]) // 【確認内容】: 他 Group の sets 行は更新されない 🔵
      expect(error).toBeNull() // 【確認内容】: UPDATE 自体はエラーなし 🔵
    })

    it('TC-14-25: rallies - User A は User B Group の rallies 行を UPDATE しても影響行数 0', async () => {
      // 【テスト目的】: rallies の USING ポリシー（FK 経由）による UPDATE フィルタ確認
      // 🔵 信頼性レベル: REQ-101 + EDGE-003 派生

      const { data, error } = await userAClient
        .from('rallies')
        .update({ is_let: true })
        .eq('id', userBRallyId)
        .select()

      expect(data ?? []).toEqual([]) // 【確認内容】: 他 Group の rallies 行は更新されない 🔵
      expect(error).toBeNull() // 【確認内容】: UPDATE 自体はエラーなし 🔵
    })

    it('TC-14-26: shots - User A は User B Group の shots 行を UPDATE しても影響行数 0', async () => {
      // 【テスト目的】: shots の USING ポリシー（FK 経由 rallies→sets→matches）による UPDATE フィルタ確認
      // 🔵 信頼性レベル: REQ-101 + EDGE-003 派生

      const { data, error } = await userAClient
        .from('shots')
        .update({ shot_number: 99 })
        .eq('id', userBShotId)
        .select()

      expect(data ?? []).toEqual([]) // 【確認内容】: 他 Group の shots 行は更新されない 🔵
      expect(error).toBeNull() // 【確認内容】: UPDATE 自体はエラーなし 🔵
    })

    it('TC-14-27: position_overrides - User A は User B Group の行を UPDATE しても影響行数 0', async () => {
      // 【テスト目的】: position_overrides の USING ポリシーによる UPDATE フィルタ確認
      // 🔵 信頼性レベル: REQ-101 + EDGE-003 派生

      const { data, error } = await userAClient
        .from('position_overrides')
        .update({ team: 'B' })
        .eq('id', userBPositionOvId)
        .select()

      expect(data ?? []).toEqual([]) // 【確認内容】: 他 Group の position_overrides 行は更新されない 🔵
      expect(error).toBeNull() // 【確認内容】: UPDATE 自体はエラーなし 🔵
    })

    it('TC-14-28: recording_gaps - User A は User B Group の行を UPDATE しても影響行数 0', async () => {
      // 【テスト目的】: recording_gaps の USING ポリシーによる UPDATE フィルタ確認
      // 🔵 信頼性レベル: REQ-101 + EDGE-003 派生

      const { data, error } = await userAClient
        .from('recording_gaps')
        .update({ note: 'hacked' })
        .eq('id', userBRecordingGapId)
        .select()

      expect(data ?? []).toEqual([]) // 【確認内容】: 他 Group の recording_gaps 行は更新されない 🔵
      expect(error).toBeNull() // 【確認内容】: UPDATE 自体はエラーなし 🔵
    })
  })

  // ========================================
  // TC-14-29: 未認証アクセス（REQ-201）
  // ========================================

  describe('RLS 未認証: anon は全テーブル拒否', () => {
    it('TC-14-29: groups - 匿名（未認証）クライアントから groups を SELECT しても空集合または error', async () => {
      // 【テスト目的】: REQ-201（全テーブル未認証拒否）の代表 1 テーブル分検証
      // 【テスト内容】: anonClient（認証なし）で groups 全件 SELECT を試行
      // 【期待される動作】: (data ?? []) === []（または error !== null）
      // 🔵 信頼性レベル: REQ-201 + NFR-104（anon ロールへの SELECT GRANT なし or RLS USING で false）

      // 【実際の処理実行】: 認証フローを通らない PostgREST 直叩きを想定
      const { data, error } = await anonClient
        .from('groups')
        .select('*')

      // 【結果検証】: anon ロールへの SELECT 権限がないか RLS で全行フィルタされる
      // error !== null または data が空配列のどちらかで RLS が機能していることを確認
      const isBlocked = error !== null || (data ?? []).length === 0
      expect(isBlocked).toBe(true) // 【確認内容】: 未認証アクセスは拒否または空集合 🔵
    })
  })

  // ========================================
  // TC-14-30〜31: ADR-006 1 ユーザー = 1 Group 制約
  // ========================================

  describe('ADR-006: 1 ユーザー = 1 Group 制約', () => {
    it('TC-14-30: group_members の UNIQUE(user_id) で service_role 経由の二重所属 INSERT も拒否される', async () => {
      // 【テスト目的】: ADR-006 §決定 §DB 制約 — `group_members_user_id_unique` が
      //   全経路 (RPC / 直接 INSERT / 並行操作) で二重所属を構造的に防止すること
      // 【テスト内容】: User B は beforeAll で User B Group に所属済み。
      //   別 Group を service_role で新規作成 → 同 User B を 2 件目の group_members に INSERT 試行
      // 【期待される動作】: PG error code === '23505' (unique_violation)
      // 🔵 信頼性レベル: ADR-006 §決定 §DB 制約 +
      //   migration 20260524150000_adr_006_single_group_per_user.sql

      // 【テストデータ準備】: 別 Group を service_role で作成 (group_members は追加しない)
      const { data: secondGroup, error: groupErr } = await serviceClient
        .from('groups')
        .insert({ name: 'UserB-Second-Group-ADR006' })
        .select('id')
        .single()
      if (groupErr || !secondGroup) {
        throw new Error(`TC-14-30 setup failed: ${groupErr?.message}`)
      }

      // DEBUG: confirm User B membership state before insert
      const { data: gmBefore } = await serviceClient
        .from('group_members')
        .select('id, group_id, user_id, deleted_at')
        .eq('user_id', userBId)
      console.log('[TC-14-30 DEBUG] group_members rows for User B before insert:', JSON.stringify(gmBefore, null, 2))

      // 【実際の処理実行】: User B を 2 件目の Group に所属させようとする
      const { data: insertData, error } = await serviceClient
        .from('group_members')
        .insert({ group_id: secondGroup.id, user_id: userBId })
        .select()

      // DEBUG: dump full error and insert result
      console.log('[TC-14-30 DEBUG] insert error:', JSON.stringify(error, null, 2))
      console.log('[TC-14-30 DEBUG] insert data:', JSON.stringify(insertData, null, 2))

      // 【結果検証】: UNIQUE(user_id) 違反で 23505 が返る
      expect(error?.code).toBe('23505') // 【確認内容】: PG unique_violation 🔵

      // 【後処理】: 追加した Group を削除 (cleanupUserBData は元の userBGroupId のみ対象)
      await serviceClient.from('groups').delete().eq('id', secondGroup.id)
    })

    it('TC-14-31: join_group_with_code は既所属 User に対し already_in_group 例外で早期失敗する', async () => {
      // 【テスト目的】: ADR-006 §決定 §RPC ガード — `join_group_with_code` 冒頭の
      //   `IF EXISTS (SELECT 1 FROM group_members WHERE user_id = auth.uid())` 早期失敗
      // 【テスト内容】: User A 用に別 Group を service_role で作成し User A を所属させた状態で、
      //   User A が User B Group の招待コードで join_group_with_code を呼び出す
      // 【期待される動作】: error.message に 'already_in_group' を含む
      // 🔵 信頼性レベル: ADR-006 §決定 §RPC ガード +
      //   migration 20260524150000_adr_006_single_group_per_user.sql

      // 【テストデータ準備】: User A 用 Group + group_members 行を service_role で作成
      const { data: userAUserData } = await userAClient.auth.getUser()
      const userAId = userAUserData.user?.id
      if (!userAId) throw new Error('TC-14-31 setup: User A not authenticated')

      const { data: userAGroup, error: groupErr } = await serviceClient
        .from('groups')
        .insert({ name: 'UserA-Group-ADR006' })
        .select('id')
        .single()
      if (groupErr || !userAGroup) {
        throw new Error(`TC-14-31 setup failed: ${groupErr?.message}`)
      }

      const { error: memberErr } = await serviceClient
        .from('group_members')
        .insert({ group_id: userAGroup.id, user_id: userAId })
      if (memberErr) throw new Error(`TC-14-31 setup member failed: ${memberErr.message}`)

      // 【User B Group の招待コードを service_role で発行】
      const code = `ADR006${Math.floor(Math.random() * 0xffff)
        .toString(16)
        .toUpperCase()
        .padStart(2, '0')}`
      const { error: invErr } = await serviceClient
        .from('group_invitations')
        .insert({
          group_id: userBGroupId,
          code,
          created_by: userBId,
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
        })
      if (invErr) throw new Error(`TC-14-31 setup invitation failed: ${invErr.message}`)

      // 【実際の処理実行】: User A (既所属) が User B Group の招待コードを使う
      const { error } = await userAClient.rpc('join_group_with_code', { invite_code: code })

      // 【結果検証】: RPC 冒頭ガードが発火し already_in_group 例外
      expect(error).not.toBeNull() // 【確認内容】: 例外発生 🔵
      expect(error?.message).toContain('already_in_group') // 【確認内容】: ADR-006 識別子 🔵

      // 【後処理】: User A 用 Group + member + 招待コードを削除
      await serviceClient.from('group_invitations').delete().eq('code', code)
      await serviceClient.from('group_members').delete().eq('user_id', userAId)
      await serviceClient.from('groups').delete().eq('id', userAGroup.id)
    })
  })
})
