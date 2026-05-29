import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { TestProject } from 'vitest/node'

export interface TestUser {
  id: string
  email: string
  password: string
}

// Vitest provide/inject 用の型拡張。globalSetup が provide した値をテスト側で
// inject('users') の型として参照可能にする。
declare module 'vitest' {
  export interface ProvidedContext {
    users: { userA: TestUser, userB: TestUser }
  }
}

let adminClient: SupabaseClient | null = null
let createdUserIds: string[] = []

function getAdminClient(): SupabaseClient {
  if (adminClient) return adminClient
  const url = process.env.NUXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.NUXT_SUPABASE_SECRET_KEY
  if (!url || !serviceRoleKey) {
    throw new Error(
      'NUXT_PUBLIC_SUPABASE_URL / NUXT_SUPABASE_SECRET_KEY が未設定です (.env.test 参照)'
    )
  }
  adminClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
  return adminClient
}

async function deleteExistingByEmail(client: SupabaseClient, email: string): Promise<void> {
  // 前回 run の teardown が走らずに残った同 email のユーザを冪等に削除する。
  // listUsers は perPage 1000 が上限のためメイン候補のみで十分 (テスト email は 2 件想定)。
  const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw new Error(`listUsers failed: ${error.message}`)
  for (const u of data.users) {
    if (u.email === email) {
      const { error: delErr } = await client.auth.admin.deleteUser(u.id)
      if (delErr) throw new Error(`pre-cleanup deleteUser failed for ${email}: ${delErr.message}`)
    }
  }
}

async function createOne(client: SupabaseClient, email: string): Promise<TestUser> {
  // 冪等性確保: 前回 run 由来の同 email ユーザが残っていれば先に削除
  await deleteExistingByEmail(client, email)

  const password = `test-${globalThis.crypto.randomUUID()}`
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  })
  if (error || !data.user) {
    throw new Error(`createUser failed: ${error?.message ?? 'no user returned'}`)
  }
  createdUserIds.push(data.user.id)
  return { id: data.user.id, email, password }
}

export async function setupTestUsers(): Promise<{ userA: TestUser, userB: TestUser }> {
  const client = getAdminClient()
  const emailA = process.env.TEST_USER_A_EMAIL || 'test-a@example.com'
  const emailB = process.env.TEST_USER_B_EMAIL || 'test-b@example.com'
  const userA = await createOne(client, emailA)
  const userB = await createOne(client, emailB)
  return { userA, userB }
}

export async function teardownTestUsers(): Promise<void> {
  if (createdUserIds.length === 0) return
  const client = getAdminClient()
  for (const id of createdUserIds) {
    await client.auth.admin.deleteUser(id)
  }
  createdUserIds = []
}

/**
 * afterEach 用 cleanup (B3 確定方針, 2026-05-13)。
 * 指定された user_id 群が所属する groups と group_members を削除し、
 * auth.users 自体は残す (globalSetup の作成済みを再利用するため)。
 * 注: groups テーブルに owner_user_id カラムはないため group_members 経由で特定。
 * FK ON DELETE CASCADE が schema に無いため、子テーブル → 親テーブル の順で削除。
 *
 * @param userIds 対象ユーザ ID 配列 (vitest worker process では inject 経由で取得)
 */
export async function cleanupTestUserData(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return
  const client = getAdminClient()

  // 1. 対象ユーザが所属する group_id を抽出
  const { data: memberships } = await client
    .from('group_members')
    .select('group_id')
    .in('user_id', userIds)
  const groupIds = [...new Set((memberships ?? []).map((m: { group_id: string }) => m.group_id))]

  // 2. group_invitations を削除 (groups の子、FK CASCADE 未設定)
  if (groupIds.length > 0) {
    await client.from('group_invitations').delete().in('group_id', groupIds)
  }

  // 3. group_members を削除 (groups の子)
  await client.from('group_members').delete().in('user_id', userIds)

  // 4. groups 自体を削除
  if (groupIds.length > 0) {
    await client.from('groups').delete().in('id', groupIds)
  }
}

/**
 * Vitest globalSetup エントリポイント。
 * メインプロセスでテストユーザを作成し、provide('users', ...) で worker process に
 * 共有する。worker process 側は `inject('users')` で値を取得する
 * (worker は別プロセスのためモジュール変数は共有されない)。
 */
export default async function globalSetup({ provide }: TestProject): Promise<() => Promise<void>> {
  const users = await setupTestUsers()
  provide('users', users)
  return async () => {
    await teardownTestUsers()
  }
}
