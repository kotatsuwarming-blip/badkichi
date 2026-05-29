/**
 * TASK-0015: RPC 統合テスト用フィクスチャヘルパ
 *
 * 用途: rpc.integration.test.ts の TC-15-07 / TC-15-10 で必要となる
 *   service_role 経由の招待コード seed / 削除を共通化。
 *
 * 既存の rls-fixtures.ts `createInvitation()` はランダムコード + 7 日有効期限固定のため、
 * 期限切れ / 固定コード seed 用途にはここで別ヘルパを提供する。
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * service_role で期限切れの招待コードを INSERT する (TC-15-10 EDGE-001/EDGE-101 用)。
 * @returns 作成したコード文字列
 */
export async function createExpiredInvitation(
  client: SupabaseClient,
  params: { groupId: string, createdBy: string, code: string }
): Promise<string> {
  await client.from('group_invitations').delete().eq('code', params.code)
  const { error } = await client.from('group_invitations').insert({
    group_id: params.groupId,
    code: params.code,
    created_by: params.createdBy,
    expires_at: new Date(Date.now() - 1000).toISOString()
  })
  if (error) throw new Error(`createExpiredInvitation failed: ${error.message}`)
  return params.code
}

/**
 * service_role で固定コードの有効な招待を INSERT する (TC-15-07 衝突再現用 seed)。
 * test_force_collision_invitation_code は同コードで 5 回 INSERT を試みるため、
 * 事前に同じコードを INSERT しておけば UNIQUE 違反が確定する。
 */
export async function seedCollisionInvitation(
  client: SupabaseClient,
  params: { groupId: string, createdBy: string, code: string }
): Promise<void> {
  await client.from('group_invitations').delete().eq('code', params.code)
  const { error } = await client.from('group_invitations').insert({
    group_id: params.groupId,
    code: params.code,
    created_by: params.createdBy,
    expires_at: new Date(Date.now() + 7 * 86400_000).toISOString()
  })
  if (error) throw new Error(`seedCollisionInvitation failed: ${error.message}`)
}

/**
 * service_role で指定コードの招待を削除する (テスト後のクリーンアップ用)。
 */
export async function deleteInvitationByCode(
  client: SupabaseClient,
  code: string
): Promise<void> {
  await client.from('group_invitations').delete().eq('code', code)
}
