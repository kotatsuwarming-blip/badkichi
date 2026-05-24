# テストケース一覧: TASK-0015 RPC 統合テスト

- **要件名**: data-foundation
- **タスク ID**: TASK-0015
- **作成日**: 2026-05-24
- **前提**: tdd-requirements.md 参照

---

## 信頼性レベル凡例

- 🔵 青信号: 設計文書・タスクファイル直接根拠あり
- 🟡 黄信号: 妥当な推測（実装時詳細化が必要）
- 🔴 赤信号: 設計文書にない推測

---

## 1. テストケース一覧

| テスト ID | 種別 | 対象 RPC | シナリオ | 期待結果 | 信頼性 |
|----------|------|---------|---------|---------|--------|
| TC-15-01 | boundary | `create_group_with_owner` | 認証済み User A、`group_name: 'テストG'` | uuid 返却 (`^[0-9a-f-]{36}$`)、`groups.name = 'テストG'`、`group_members(group_id, userAId)` の行が存在 | 🔵 |
| TC-15-02 | branch | `create_group_with_owner` | 未認証クライアント（サインインなし） | `error.message` に `'not_authenticated'` を含む | 🔵 |
| TC-15-03 | boundary | `create_group_with_owner` | `group_name: ''`（trim 後 0 文字、下限境界外） | `error.message` に `'invalid_group_name'` を含む | 🔵 |
| TC-15-04 | boundary | `create_group_with_owner` | `group_name: 'a'.repeat(51)`（trim 後 51 文字、上限境界外） | `error.message` に `'invalid_group_name'` を含む | 🔵 |
| TC-15-05 | boundary | `generate_invitation_code` | メンバー User A が `groupAId` で発行 | 戻り値が `^[A-F0-9]{8}$` にマッチ、`group_invitations` に `group_id = groupAId` の行が存在 | 🔵 |
| TC-15-06 | branch | `generate_invitation_code` | 非メンバー User B が `groupAId` で発行 | `error.message` に `'not_a_member'` を含む | 🔵 |
| TC-15-07 | branch | `generate_invitation_code` | 5 回連続 UNIQUE 衝突（B 案: テスト用 RPC 経由） | `error.message` に `'invitation_code_collision_after_retry'` を含む | 🔵（再現方法 🟡） |
| TC-15-08 | boundary | `join_group_with_code` | User B が有効コードで参加 | `error` が null、`group_members(groupAId, userBId)` の行が存在 | 🔵 |
| TC-15-09 | branch | `join_group_with_code` | `invite_code: 'INVALID0'`（存在しないコード） | `error.message` に `'invitation_not_found'` を含む | 🔵 |
| TC-15-10 | branch | `join_group_with_code` | service_role で `expires_at` を過去に設定したコード（EDGE-001 / EDGE-101 負側） | `error.message` に `'invitation_expired'` を含む | 🔵 |
| TC-15-11 | branch | `join_group_with_code` | TC-15-08 実行後に User B が同じコードで再参加（EDGE-002 / ADR-006 早期失敗ガード経路） | `error.message` に `'already_in_group'` を含む | 🔵 |

> **TC-15-11 の前提**: `describe('join_group_with_code')` 内で TC-15-08 の後に順序通り実行される
> こと。`vitest` の `it` は describe 内で定義順に実行されるため、単一ファイル構成であれば保証される。
>
> **ADR-006 追補 (TASK-0018, 2026-05-24)**: ADR-006 適用前は期待値 `error.code === '23505'` (UNIQUE 違反) だったが、
> 適用後は RPC 冒頭の `IF EXISTS (SELECT 1 FROM group_members WHERE user_id = auth.uid())` 早期失敗ガードが
> 先に発火するため、期待値を `'already_in_group'` 文字列照合に更新した。`23505` の再現は同時並行 INSERT
> (race condition) でしか起きず、本テストでは扱わない (MVP スコープ外)。**新規 TC-15-12 は追加しない** —
> 別 Group の招待コードで試行するケースも RPC 冒頭ガードで同じ `already_in_group` に到達するため redundant
> (feedback_test_coverage 準拠)。

---

## 2. 共通 setup

### 2.1 グローバル beforeAll（ファイル先頭）

```typescript
// tests/integration/rpc.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getCurrentTestUsers } from '../setup/create-test-users'

let serviceClient: SupabaseClient
let userAClient: SupabaseClient
let userBClient: SupabaseClient
let userAId: string
let userBId: string

beforeAll(async () => {
  const { userA, userB } = getCurrentTestUsers() // globalSetup 済みユーザを取得

  userAId = userA.id
  userBId = userB.id

  serviceClient = createClient(
    process.env.NUXT_PUBLIC_SUPABASE_URL!,
    process.env.NUXT_SUPABASE_SECRET_KEY!
  )

  userAClient = createClient(
    process.env.NUXT_PUBLIC_SUPABASE_URL!,
    process.env.NUXT_PUBLIC_SUPABASE_KEY!
  )
  await userAClient.auth.signInWithPassword({
    email: userA.email,
    password: userA.password
  })

  userBClient = createClient(
    process.env.NUXT_PUBLIC_SUPABASE_URL!,
    process.env.NUXT_PUBLIC_SUPABASE_KEY!
  )
  await userBClient.auth.signInWithPassword({
    email: userB.email,
    password: userB.password
  })
})
```

> **注意**: `setupTestUsers()` ではなく `getCurrentTestUsers()` を使用。
> `globalSetup` で既にユーザが作成済みのため、本ファイルの `beforeAll` では
> サインインのみ行う。TASK-0013 / TASK-0014 の実装を確認して正しい関数名を使うこと。🟡

### 2.2 各 describe の beforeAll（Group 用意）

`describe('generate_invitation_code')` と `describe('join_group_with_code')` はそれぞれ
独立した Group を必要とするため、`describe` 内の `beforeAll` で RPC 経由で作成する。

```typescript
describe('generate_invitation_code', () => {
  let groupAId: string

  beforeAll(async () => {
    const { data, error } = await userAClient.rpc('create_group_with_owner', {
      group_name: 'gen-code テスト用 G'
    })
    if (error || !data) throw new Error(`Group 作成失敗: ${error?.message}`)
    groupAId = data
  })

  // ...
})

describe('join_group_with_code', () => {
  let groupAId: string
  let validCode: string

  beforeAll(async () => {
    const { data: gid, error: ge } = await userAClient.rpc('create_group_with_owner', {
      group_name: 'join テスト用 G'
    })
    if (ge || !gid) throw new Error(`Group 作成失敗: ${ge?.message}`)
    groupAId = gid

    const { data: code, error: ce } = await userAClient.rpc('generate_invitation_code', {
      target_group_id: groupAId
    })
    if (ce || !code) throw new Error(`招待コード発行失敗: ${ce?.message}`)
    validCode = code
  })

  // ...
})
```

### 2.3 afterAll cleanup

```typescript
afterAll(async () => {
  // service_role で テスト中に作成した groups を全削除
  // group_members / group_invitations は FK CASCADE で連動削除される想定
  // (スキーマの ON DELETE CASCADE を要確認 🟡)
  await serviceClient
    .from('group_members')
    .delete()
    .in('user_id', [userAId, userBId])

  await serviceClient
    .from('groups')
    .delete()
    .like('name', '%テスト用 G%')
    .or(`name.eq.テストG`)
})
```

> **注意**: `afterAll` のクリーンアップ方法は tdd-red / tdd-refactor フェーズで
> TASK-0013 の `cleanupTestUserData()` を活用する形に調整する。
> TASK-0015.md の `groups.delete().or('owner_user_id...')` は `owner_user_id` カラム非存在のため
> **使用不可**（tdd-requirements.md § 7.1 で確認済み）。

---

## 3. 各テストケースの詳細

### 3.1 TC-15-01: create_group_with_owner 正常

- **認証状態**: User A でサインイン済み (`userAClient`)
- **入力**: `{ group_name: 'テストG' }`
- **検証ポイント**:
  1. `error` が `null`
  2. `data` が `/^[0-9a-f-]{36}$/` にマッチ（uuid 形式）
  3. `serviceClient.from('groups').select('name').eq('id', data).single()` → `name === 'テストG'`
  4. `serviceClient.from('group_members').select().eq('group_id', data).eq('user_id', userAId).single()` → エラーなし（行存在）
- **検証しないもの**: `groups.owner_user_id`（カラム非存在）、`group_members.role`（カラム非存在）
- **信頼性**: 🔵

### 3.2 TC-15-02: create_group_with_owner 未認証

- **認証状態**: サインインしていない素のクライアント（`createClient(url, publishableKey)` のみ）
- **入力**: `{ group_name: 'x' }`
- **検証ポイント**: `error?.message` が `'not_authenticated'` を含む
- **信頼性**: 🔵

### 3.3 TC-15-03: create_group_with_owner 空文字列

- **認証状態**: User A でサインイン済み
- **入力**: `{ group_name: '' }`
- **検証ポイント**: `error?.message` が `'invalid_group_name'` を含む
- **備考**: trim 後 0 文字 = 下限境界外
- **信頼性**: 🔵

### 3.4 TC-15-04: create_group_with_owner 51 文字

- **認証状態**: User A でサインイン済み
- **入力**: `{ group_name: 'a'.repeat(51) }`
- **検証ポイント**: `error?.message` が `'invalid_group_name'` を含む
- **備考**: 上限 50 文字 + 1 = 上限境界外
- **信頼性**: 🔵

### 3.5 TC-15-05: generate_invitation_code 正常

- **前提**: `describe` の `beforeAll` で `groupAId` が作成済み
- **認証状態**: User A でサインイン済み（`groupAId` の owner = メンバー）
- **入力**: `{ target_group_id: groupAId }`
- **検証ポイント**:
  1. `error` が `null`
  2. `data` が `/^[A-F0-9]{8}$/` にマッチ（8 文字 hex 大文字、NFR-103）
  3. `serviceClient.from('group_invitations').select().eq('code', data).single()` → `group_id === groupAId`
- **備考**: 発行直後コードの `expires_at` は `now() + 7 days` ≈ 境界正側を暗黙的にカバー（EDGE-101）
- **信頼性**: 🔵

> **照合パターン補足**: `tdd-requirements.md` § 2.2 より `^[A-F0-9]{8}$` が正確（実装は
> `upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8))`）。
> TASK-0015.md の `[A-Za-z0-9]` は緩い側で互換。テストでは `[A-F0-9]` を使用。

### 3.6 TC-15-06: generate_invitation_code 非メンバー

- **前提**: `describe` の `beforeAll` で `groupAId` が作成済み（User A 所有）
- **認証状態**: User B でサインイン済み（`groupAId` のメンバーではない）
- **入力**: `{ target_group_id: groupAId }`
- **検証ポイント**: `error?.message` が `'not_a_member'` を含む
- **信頼性**: 🔵

### 3.7 TC-15-07: generate_invitation_code 5 回連続衝突

- **認証状態**: User A でサインイン済み
- **再現方法**: **実装詳細 5 / 方針 B（テスト用 RPC）を採用**（詳細は § 4 参照）
- **入力**: `invokeWithGuaranteedCollision(userAClient, groupAId)` ヘルパ経由
- **検証ポイント**: `error?.message` が `'invitation_code_collision_after_retry'` を含む
- **信頼性**: 🔵（再現方法の実装詳細は 🟡 — tdd-red フェーズで確定）

### 3.8 TC-15-08: join_group_with_code 正常

- **前提**: `describe` の `beforeAll` で `groupAId` + `validCode` が準備済み
- **認証状態**: User B でサインイン済み（対象 Group の非メンバー）
- **入力**: `{ invite_code: validCode }`
- **検証ポイント**:
  1. `error` が `null`
  2. `data` が `/^[0-9a-f-]{36}$/` にマッチ（戻り値は参加した `group_id`）
  3. `serviceClient.from('group_members').select().eq('group_id', groupAId).eq('user_id', userBId).single()` → エラーなし（行存在）
- **信頼性**: 🔵

### 3.9 TC-15-09: join_group_with_code 不正コード

- **認証状態**: User B でサインイン済み
- **入力**: `{ invite_code: 'INVALID0' }`（DB に存在しない 8 文字）
- **検証ポイント**: `error?.message` が `'invitation_not_found'` を含む（TASK-0007 確定値）
- **信頼性**: 🔵

### 3.10 TC-15-10: join_group_with_code 期限切れコード

- **前提**: service_role で `expires_at` を過去に設定した `group_invitations` 行を事前 INSERT
  ```typescript
  const expiredCode = 'EXPIRED1'
  await serviceClient.from('group_invitations').insert({
    group_id: groupAId,
    code: expiredCode,
    expires_at: new Date(Date.now() - 1000).toISOString(), // 1 秒前 = 確実に期限切れ
    created_by: userAId
  })
  ```
- **認証状態**: User B でサインイン済み
- **入力**: `{ invite_code: 'EXPIRED1' }`
- **検証ポイント**: `error?.message` が `'invitation_expired'` を含む（TASK-0007 確定値 / EDGE-001 / EDGE-101 負側）
- **備考**: `vi.useFakeTimers()` は PostgreSQL `now()` に無効のため、実時刻 + 過去日時 INSERT で対応
- **信頼性**: 🔵

### 3.11 TC-15-11: join_group_with_code 既メンバー再参加 (ADR-006 早期失敗ガード経路)

- **前提**: TC-15-08 が先に実行され、User B が `groupAId` のメンバーになっている
- **認証状態**: User B でサインイン済み
- **入力**: `{ invite_code: validCode }`（TC-15-08 と同じコード）
- **検証ポイント**: `error?.message` が `'already_in_group'` を含む（ADR-006 識別子）
- **備考**:
  - ADR-006 適用 (TASK-0018) で RPC 冒頭に `IF EXISTS (SELECT 1 FROM group_members WHERE user_id = auth.uid())` 早期失敗ガードが入った
  - 適用前の期待値だった `error.code === '23505'` (PG UNIQUE 違反) は、ガードが先に発火するため到達しなくなる
  - `23505` の再現は同時並行 INSERT (race condition) のみで、MVP では検証スコープ外
  - カスタム例外 `'already_in_group'` の文字列照合 (`includes` で部分一致) を採用
- **信頼性**: 🔵

---

## 4. TC-15-07 再現方法: 衝突リトライ全敗（方針 B 採用）

### 4.1 方針サマリー

方針 B（テスト用 RPC）を第一候補として採用。tdd-red フェーズで詳細実装を確定する。

### 4.2 方針 B の概要

```sql
-- supabase/migrations/{timestamp}_test_force_collision.sql
-- ※ test / dev 環境専用。prd マイグレーションには含めない（実装時に判断 🟡）
CREATE OR REPLACE FUNCTION test_force_collision_invitation_code(
  target_group_id uuid,
  fixed_code text DEFAULT 'DEADBEEF'  -- 常に同じ値を返す
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  attempt int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  -- is_member_of チェックは generate_invitation_code と同様
  IF NOT is_member_of(target_group_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;
  -- fixed_code で 5 回試行 → UNIQUE 違反を繰り返す
  LOOP
    attempt := attempt + 1;
    BEGIN
      INSERT INTO group_invitations (group_id, code, created_by, expires_at)
      VALUES (target_group_id, fixed_code, auth.uid(), now() + interval '7 days');
      RETURN fixed_code;
    EXCEPTION WHEN unique_violation THEN
      IF attempt >= 5 THEN
        RAISE EXCEPTION 'invitation_code_collision_after_retry';
      END IF;
    END;
  END LOOP;
END;
$$;
```

### 4.3 テストヘルパ

```typescript
// tests/integration/helpers/rpc-fixtures.ts (tdd-refactor フェーズで切り出し)
// tdd-red フェーズでは rpc.test.ts 内に inline で記述して OK

async function invokeWithGuaranteedCollision(
  client: SupabaseClient,
  groupId: string
): Promise<{ data: null; error: PostgrestError }> {
  const fixedCode = 'DEADBEEF'

  // 事前に同じコードを 1 件 INSERT し、test RPC が必ず衝突するようにする
  await serviceClient.from('group_invitations').insert({
    group_id: groupId,
    code: fixedCode,
    created_by: userAId,
    expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString()
  })

  return client.rpc('test_force_collision_invitation_code', {
    target_group_id: groupId,
    fixed_code: fixedCode
  })
}
```

### 4.4 保留事項（tdd-red フェーズで決定）

| 論点 | 選択肢 | 現状方針 |
|------|--------|---------|
| `test_force_collision_invitation_code` のマイグレーション配置 | 本タスクの SQL に含める / 別マイグレーションで追加 | 実装時に決定 🟡 |
| prd 環境への混入防止 | 環境判定ガード / migration を dev-only に分ける | dev-only 分離を推奨 🟡 |
| RPC 関数の `is_member_of` 関数参照 | `generate_invitation_code` と同一 helper を使用 | 同一 helper 前提 🔵 |

---

## 5. 省略するケース（redundant）

| 省略ケース | 理由 |
|----------|------|
| `group_name = 'a'`（1 文字、下限境界内正常） | TC-15-01 で正常パスをカバー済み。1 文字のみの追加テストは redundant |
| `group_name = 'a'.repeat(50)`（50 文字、上限境界内正常） | TC-15-01 の正常パスで実質カバー。TC-15-04 で 51 文字（境界外）を確認済みのため redundant |
| `group_name = null` 渡し | PostgreSQL 関数定義の型エラーで SQL レベル自動拒否。テスト不要 |
| 招待コード「4 回衝突 → 5 回目成功」 | CSPRNG (`gen_random_uuid()`) 出力を制御不可。テスト構築コスト見合わず（B4 確定方針 2026-05-13） |
| 期限 7 日ぴったり（境界正側 / EDGE-101 正側） | TC-15-05 で発行直後コードを TC-15-08 で受理。発行から数秒以内 ≪ 7 日 = 正側暗黙カバー |
| `invite_code = null` 渡し | PostgreSQL 型エラー自動拒否。テスト不要 |
| `generate_invitation_code` の未認証呼び出し | `create_group_with_owner` の TC-15-02 で `not_authenticated` 挙動パターンを確認済み。3 RPC すべてで繰り返すのは redundant（ただし実装時に必要と判断すれば追加可） |

---

## 6. テストファイル構成

```
tests/integration/
├── rpc.test.ts                   ← 本タスク（TC-15-01〜11）
├── rls.integration.test.ts       (TASK-0014 既存)
└── helpers/
    ├── rls-fixtures.ts           (TASK-0014 既存)
    └── rpc-fixtures.ts           ← tdd-refactor フェーズで切り出し

supabase/migrations/
└── {timestamp}_test_force_collision.sql  ← TC-15-07 用（tdd-red フェーズで作成）

tests/setup/
└── create-test-users.ts          (TASK-0013 既存)
```

---

## 7. 照合ルール まとめ

| 照合対象 | 照合方法 | 根拠 |
|---------|---------|------|
| カスタム例外識別子 (`not_authenticated` 等) | `error?.message` 部分一致 (`includes`) | Supabase error wrapping でプレフィックスが付く可能性あり |
| UNIQUE 違反（既メンバー再参加） | `(error as { code?: string })?.code === '23505'` 厳密一致 | PG ネイティブエラー。`message` ではなく `code` で識別（api-endpoints.md 行 346） |
| uuid 形式 | `/^[0-9a-f-]{36}$/` | uuid v4 標準形式 |
| 招待コード形式 | `/^[A-F0-9]{8}$/` | `database-schema.sql` 行 529: `upper(...hex...)` |

> **旧識別子の禁止**: `invalid_code` / `expired_code` / `already_member` は使用しない。
> TASK-0007 確定値の `invitation_not_found` / `invitation_expired` / PG `23505` のみ使用する。

---

## 8. 次のステップ

- 次フェーズ: **tdd-red**
- 成果物: `tests/integration/rpc.test.ts`（失敗する状態のテスト実装）
- 同時作業: TC-15-07 再現用 `test_force_collision_invitation_code` RPC の SQL 草稿（方針 B）
- 推奨コマンド: `/tsumiki:tdd-red data-foundation TASK-0015`
