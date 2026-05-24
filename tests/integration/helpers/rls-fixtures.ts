/**
 * RLS 統合テスト用フィクスチャヘルパー
 *
 * 【役割】: TASK-0014 の RLS 統合テストで使用するテストデータ投入・クリーンアップ関数を提供する
 * 【再利用性】: 将来の RLS テスト追加時（TASK-0015 等）でも同ヘルパーを import して利用可能
 * 【単一責任】: テストデータの CRUD のみを担当。RLS 検証ロジックはテスト本体に置く
 * 🔵 信頼性レベル: TASK-0014 DDL + tdd-tasknote の全テーブル定義に基づく
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ========================================
// グループ / メンバー
// ========================================

/**
 * 【ヘルパー関数】: User B 名義の Group を service_role で作成する
 * 【再利用性】: 他テナントのデータを事前投入する全 RLS テストで利用
 * 【単一責任】: groups 行挿入 + group_members 行挿入 の 2 ステップを原子的に実行
 * 🔵 DDL: groups(id, name) — owner_user_id カラムはなし。group_members で所有者を管理
 *
 * @param client service_role クライアント（RLS バイパス用）
 * @param userId Group オーナーとして登録する user_id（User B）
 * @returns 作成した Group の id
 */
export async function createGroupForUserB(
  client: SupabaseClient,
  userId: string
): Promise<string> {
  // 【Step 1】: groups テーブルへ直接 INSERT（service_role は RLS バイパス）
  const { data, error } = await client
    .from('groups')
    .insert({ name: 'UserB-Test-Group' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`createGroupForUserB failed: ${error?.message}`)

  // 【Step 2】: group_members に User B を service_role で追加（RLS バイパス）
  // 注: 通常の authenticated ユーザは RPC create_group_with_owner を経由する必要がある
  const { error: memberError } = await client
    .from('group_members')
    .insert({ group_id: data.id, user_id: userId })
  if (memberError) throw new Error(`addUserBToGroup failed: ${memberError.message}`)

  return data.id
}

// ========================================
// 選手 / 試合 / セット系
// ========================================

/**
 * 【ヘルパー関数】: Player を service_role で作成する
 * 🔵 DDL: players(group_id uuid NOT NULL, name text NOT NULL)
 *
 * @param client service_role クライアント
 * @param groupId 所属グループ ID
 * @returns 作成した Player の id
 */
export async function createPlayer(
  client: SupabaseClient,
  groupId: string
): Promise<string> {
  const { data, error } = await client
    .from('players')
    .insert({ group_id: groupId, name: 'UserB-Player' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`createPlayer failed: ${error?.message}`)
  return data.id
}

/**
 * 【ヘルパー関数】: Match を service_role で作成する
 * 【単一責任】: matches テーブルへの INSERT のみ。4 選手は呼び出し元で用意する
 * 🔵 DDL: matches の 4 選手は全員別人・同一 Group（複合 FK 制約）
 *
 * @param client service_role クライアント
 * @param groupId 所属グループ ID
 * @param playerIds 4 選手の id（全員別人・同一グループが前提）
 * @returns 作成した Match の id
 */
export async function createMatch(
  client: SupabaseClient,
  groupId: string,
  playerIds: [string, string, string, string]
): Promise<string> {
  const { data, error } = await client
    .from('matches')
    .insert({
      group_id: groupId,
      team_a_player1_id: playerIds[0],
      team_a_player2_id: playerIds[1],
      team_b_player1_id: playerIds[2],
      team_b_player2_id: playerIds[3],
      video_source_type: 'youtube',
      video_source_url: 'https://youtu.be/rls-test'
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`createMatch failed: ${error?.message}`)
  return data.id
}

/**
 * 【ヘルパー関数】: Set を service_role で作成する
 * 🔵 DDL: sets(match_id uuid NOT NULL, set_number smallint NOT NULL, first_serving_team text NOT NULL)
 *
 * @param client service_role クライアント
 * @param matchId 親 Match の id
 * @returns 作成した Set の id
 */
export async function createSet(
  client: SupabaseClient,
  matchId: string
): Promise<string> {
  const { data, error } = await client
    .from('sets')
    .insert({ match_id: matchId, set_number: 1, first_serving_team: 'A' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`createSet failed: ${error?.message}`)
  return data.id
}

/**
 * 【ヘルパー関数】: SetPlayerPosition を service_role で作成する
 * 🔵 DDL: set_player_positions(set_id, player_id, team, position)
 *
 * @param client service_role クライアント
 * @param setId 親 Set の id
 * @param playerId 配置する Player の id
 * @returns 作成した SetPlayerPosition の id
 */
export async function createSetPlayerPosition(
  client: SupabaseClient,
  setId: string,
  playerId: string
): Promise<string> {
  const { data, error } = await client
    .from('set_player_positions')
    .insert({ set_id: setId, player_id: playerId, team: 'A', position: 'left' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`createSetPlayerPosition failed: ${error?.message}`)
  return data.id
}

// ========================================
// ラリー系
// ========================================

/**
 * 【ヘルパー関数】: Rally を service_role で作成する
 * 【設計方針】: server_player_id / receiver_player_id は同一プレイヤーを指定可能（テスト用最小セット）
 * 🔵 DDL: rallies(set_id, rally_number, serving_team, server_position, server_player_id, receiver_player_id)
 *
 * @param client service_role クライアント
 * @param setId 親 Set の id
 * @param playerId サーバー / レシーバー 兼任プレイヤー id（テスト用）
 * @returns 作成した Rally の id
 */
export async function createRally(
  client: SupabaseClient,
  setId: string,
  playerId: string
): Promise<string> {
  const { data, error } = await client
    .from('rallies')
    .insert({
      set_id: setId,
      rally_number: 1,
      serving_team: 'A',
      server_position: 'left',
      server_player_id: playerId,
      receiver_player_id: playerId
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`createRally failed: ${error?.message}`)
  return data.id
}

/**
 * 【ヘルパー関数】: Shot を service_role で作成する
 * 🔵 DDL: shots(rally_id, shot_number smallint NOT NULL)
 *
 * @param client service_role クライアント
 * @param rallyId 親 Rally の id
 * @returns 作成した Shot の id
 */
export async function createShot(
  client: SupabaseClient,
  rallyId: string
): Promise<string> {
  const { data, error } = await client
    .from('shots')
    .insert({ rally_id: rallyId, shot_number: 1 })
    .select('id')
    .single()
  if (error || !data) throw new Error(`createShot failed: ${error?.message}`)
  return data.id
}

/**
 * 【ヘルパー関数】: PositionOverride を service_role で作成する
 * 🔵 DDL: position_overrides(rally_id, team, override_type)
 *
 * @param client service_role クライアント
 * @param rallyId 親 Rally の id
 * @returns 作成した PositionOverride の id
 */
export async function createPositionOverride(
  client: SupabaseClient,
  rallyId: string
): Promise<string> {
  const { data, error } = await client
    .from('position_overrides')
    .insert({ rally_id: rallyId, team: 'A', override_type: 'swapped' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`createPositionOverride failed: ${error?.message}`)
  return data.id
}

/**
 * 【ヘルパー関数】: RecordingGap を service_role で作成する
 * 🔵 DDL: recording_gaps(set_id uuid NOT NULL)、その他は全て optional
 *
 * @param client service_role クライアント
 * @param setId 親 Set の id
 * @returns 作成した RecordingGap の id
 */
export async function createRecordingGap(
  client: SupabaseClient,
  setId: string
): Promise<string> {
  const { data, error } = await client
    .from('recording_gaps')
    .insert({ set_id: setId })
    .select('id')
    .single()
  if (error || !data) throw new Error(`createRecordingGap failed: ${error?.message}`)
  return data.id
}

// ========================================
// 招待
// ========================================

/**
 * 【ヘルパー関数】: GroupInvitation を service_role で作成する
 * 【設計方針】: code は Math.random() でランダム生成し、テスト間での衝突を回避
 * 🔵 DDL: group_invitations(group_id, code text UNIQUE, created_by, expires_at)
 *
 * @param client service_role クライアント
 * @param groupId 招待先 Group の id
 * @param createdBy 招待コードを発行したユーザの id（User B）
 * @returns 作成した GroupInvitation の id
 */
export async function createInvitation(
  client: SupabaseClient,
  groupId: string,
  createdBy: string
): Promise<string> {
  // 【衝突回避】: UNIQUE 制約付き code はランダムサフィックスで重複防止
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const code = `RLSTEST${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  const { data, error } = await client
    .from('group_invitations')
    .insert({ group_id: groupId, code, created_by: createdBy, expires_at: expiresAt })
    .select('id')
    .single()
  if (error || !data) throw new Error(`createInvitation failed: ${error?.message}`)
  return data.id
}

// ========================================
// クリーンアップ
// ========================================

/**
 * 【ヘルパー関数】: User B 配下のテストデータを service_role で物理削除する
 * 【設計方針】: FK 依存順に逆順で削除（子テーブルから親テーブルへ）
 * 【再利用性】: afterAll / afterEach で Group 単位のクリーンアップに使用
 * 【パフォーマンス】: 各ステップで必要最小限のクエリを発行。CASCADE 設定があっても明示削除で確実性を担保
 * 🔵 信頼性レベル: TASK-0013 の cleanupTestUserData パターンを踏襲
 *
 * @param client service_role クライアント（RLS バイパス用）
 * @param groupId 削除対象 Group の id
 */
export async function cleanupUserBData(
  client: SupabaseClient,
  groupId: string
): Promise<void> {
  // 【Step 1】: match_id → set_id → rally_id の順で解決して shots / position_overrides を削除
  const { data: matchRows } = await client
    .from('matches')
    .select('id')
    .eq('group_id', groupId)
  const matchIds = matchRows?.map((r: { id: string }) => r.id) ?? []

  if (matchIds.length > 0) {
    const { data: setRows } = await client
      .from('sets')
      .select('id')
      .in('match_id', matchIds)
    const setIds = setRows?.map((r: { id: string }) => r.id) ?? []

    if (setIds.length > 0) {
      const { data: rallyRows } = await client
        .from('rallies')
        .select('id')
        .in('set_id', setIds)
      const rallyIds = rallyRows?.map((r: { id: string }) => r.id) ?? []

      if (rallyIds.length > 0) {
        // 【子テーブル削除】: shots と position_overrides は rally に依存
        await client.from('shots').delete().in('rally_id', rallyIds)
        await client.from('position_overrides').delete().in('rally_id', rallyIds)
      }

      // 【中間テーブル削除】: set_player_positions と recording_gaps は set に依存
      await client.from('set_player_positions').delete().in('set_id', setIds)
      await client.from('rallies').delete().in('set_id', setIds)
      await client.from('recording_gaps').delete().in('set_id', setIds)
    }

    // 【親テーブル削除】: sets と matches を group_id 経由で削除
    await client.from('sets').delete().in('match_id', matchIds)
    await client.from('matches').delete().eq('group_id', groupId)
  }

  // 【独立テーブル削除】: players / group_invitations / group_members は group_id 直接参照
  await client.from('players').delete().eq('group_id', groupId)
  await client.from('group_invitations').delete().eq('group_id', groupId)
  await client.from('group_members').delete().eq('group_id', groupId)

  // 【最後に Group 本体を削除】
  await client.from('groups').delete().eq('id', groupId)
}
