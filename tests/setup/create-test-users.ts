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

async function createOne(client: SupabaseClient, email: string): Promise<TestUser> {
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
 * 指定された user_id 群が所属する groups を削除し (CASCADE で配下データも消える)、
 * group_members から該当ユーザ行を削除。auth.users 自体は残す。
 * 注: groups テーブルに owner_user_id カラムはないため group_members 経由で削除。
 *
 * @param userIds 対象ユーザ ID 配列 (vitest worker process では inject 経由で取得)
 */
export async function cleanupTestUserData(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return
  const client = getAdminClient()
  const { data: memberships } = await client
    .from('group_members')
    .select('group_id')
    .in('user_id', userIds)
  if (memberships && memberships.length > 0) {
    const groupIds = memberships.map((m: { group_id: string }) => m.group_id)
    await client.from('groups').delete().in('id', groupIds)
  }
  await client.from('group_members').delete().in('user_id', userIds)
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
