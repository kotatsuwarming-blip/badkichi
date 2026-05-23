# TASK-0013 TDD 要件整理

**対象タスク**: [TASK-0013: テストユーザ作成セットアップスクリプト](../../../tasks/data-foundation/TASK-0013.md)
**作成日**: 2026-05-23
**フェーズ**: tdd-requirements (TDD プロセス step-b)

---

## 目的

統合テスト (TASK-0014: RLS, TASK-0015: RPC) で必要な「複数の認証済みテストユーザ」を、Supabase Admin API (`service_role` 経由) でテスト実行前に自動作成し、テスト終了時に削除する共通セットアップを整備する。

## モジュール構造

```
tests/
├── setup/
│   ├── create-test-users.ts                # 本体実装
│   └── __tests__/
│       └── create-test-users.test.ts       # mock unit tests (TC-13-01〜03)
└── integration/
    └── setup/
        └── create-test-users.integration.test.ts  # 実 DB tests (TC-13-04/05)
```

## 公開 API (export する関数)

| 関数 | シグネチャ | 役割 |
|---|---|---|
| `setupTestUsers` | `() => Promise<{ userA: TestUser; userB: TestUser }>` | Admin API で User A/B を作成し、id/email/password を返す |
| `teardownTestUsers` | `() => Promise<void>` | `setupTestUsers` で作成した全 user を `auth.admin.deleteUser` で削除 |
| `cleanupTestUserData` | `() => Promise<void>` | User A/B が作成した `groups` / `group_members` などを `service_role` で削除 (auth.users は残す) |
| `default` (= globalSetup) | `() => Promise<() => Promise<void>>` | vitest globalSetup 用エントリ。setup → teardown を返す関数を返却 |

### TestUser 型

```ts
interface TestUser {
  id: string       // auth.users.id (UUID)
  email: string
  password: string // 動的生成 (crypto.randomUUID)
}
```

## 入出力

### `setupTestUsers()`

- **入力**: なし (環境変数 `NUXT_PUBLIC_SUPABASE_URL` / `NUXT_SUPABASE_SECRET_KEY` / `TEST_USER_A_EMAIL` / `TEST_USER_B_EMAIL` を参照)
- **出力**: `{ userA: TestUser, userB: TestUser }` (両 user の id/email/password)
- **副作用**:
  - Supabase Admin API で 2 user 作成 (`email_confirm: true`)
  - 作成した user id をモジュール内 `createdUserIds` に蓄積

### `teardownTestUsers()`

- **入力**: なし
- **出力**: なし
- **副作用**: `createdUserIds` 内の全 user を Admin API で削除、配列を空に

### `cleanupTestUserData()`

- **入力**: なし
- **出力**: なし
- **副作用**: `createdUserIds` の各 user に対し:
  - `groups` テーブルの `owner_user_id IN (createdUserIds)` 行を削除 (CASCADE で関連テーブルも消える)
  - `group_members` テーブルの `user_id IN (createdUserIds)` 行を削除 (owner 以外の参加分)
- **不変条件**: `auth.users` は削除しない

### `default` (globalSetup)

vitest 規約に従い、`setup → teardown` を返す関数を返却する形:

```ts
export default async function globalSetup() {
  await setupTestUsers()
  return async () => {
    await teardownTestUsers()
  }
}
```

## 例外仕様

| 例外条件 | エラーメッセージ | 該当 TC |
|---|---|---|
| `NUXT_PUBLIC_SUPABASE_URL` 未設定 | `'NUXT_PUBLIC_SUPABASE_URL / NUXT_SUPABASE_SECRET_KEY が未設定です (.env.test 参照)'` | TC-13-02 |
| `NUXT_SUPABASE_SECRET_KEY` 未設定 | 同上 | TC-13-02 |
| Admin API が `error` を返した | `'createUser failed: <error.message>'` | TC-13-03 |
| Admin API が `data.user` を返さない | 同上 | TC-13-03 |

## 依存

- **前提タスク**: TASK-0009 (dev DB に 11 テーブル + RLS + RPC 適用済)
- **ライブラリ**: `@supabase/supabase-js` (Admin API 用), `vitest` (test runner)
- **環境変数** (全て process.env 経由のみ、`nuxt.config.ts` runtimeConfig には絶対に追加しない):
  - `NUXT_PUBLIC_SUPABASE_URL` — dev プロジェクトの URL
  - `NUXT_SUPABASE_SECRET_KEY` — service_role キー (シェル env / CI Secrets でのみ渡す、strict secret policy)
  - `TEST_USER_A_EMAIL` / `TEST_USER_B_EMAIL` — テストユーザ email (任意、未設定なら `test-a@example.com` / `test-b@example.com`)

## テストレイヤー分離方針

| レイヤー | 対象テスト | 配置 | 実行コマンド | 実行タイミング | secret 要否 |
|---|---|---|---|---|---|
| mock unit | TC-13-01/02/03 | `tests/setup/__tests__/create-test-users.test.ts` | `pnpm test` | pre-commit + CI | 不要 (vi.mock + vi.stubEnv) |
| integration | TC-13-04/05 | `tests/integration/setup/create-test-users.integration.test.ts` | `pnpm test:integration` | CI 専用 (+ ローカルオンデマンド) | CI Secrets から注入 |

理由:
- mock unit は環境変数なし・実 API 接続なしで pre-commit 内で数秒で完了でき、ロジック回帰を防ぐ
- integration は実 dev DB が必須なため、secret を持つ CI でのみ走らせる (strict secret policy 準拠)

## NFR-101 (SERVICE_ROLE_KEY 保護)

- `tests/` 配下のみで参照、`app/` 以下からは絶対に参照しない (Nuxt のビルド対象外を維持)
- `nuxt.config.ts` runtimeConfig には追加しない
- `.env.*` ファイルには書かない、シェル env か GitHub Actions Secrets でのみ流通
