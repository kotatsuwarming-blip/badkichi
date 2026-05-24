# TASK-0015 TDD コンテキストノート

**要件名**: data-foundation  
**タスクID**: TASK-0015 (RPC 統合テスト)  
**作成日**: 2026-05-24  
**参考タスク**: TASK-0013（テストユーザ作成セットアップ）、TASK-0014（RLS 統合テスト）、TASK-0007（RPC 実装）

---

## 1. 技術スタック

### 使用技術・フレームワーク

- **フロントエンド**: Nuxt 3 (Vue 3 + TypeScript strict mode)
- **バックエンド**: Supabase（PostgreSQL + Auth）
- **テストフレームワーク**: Vitest（unit・integration）
- **パッケージマネージャー**: pnpm
- **バリデーション**: Zod
- **開発ツール**: Supabase CLI、ESLint

### アーキテクチャパターン

- **BaaS 直結**: Nuxt クライアントが `@supabase/supabase-js` 経由で PostgREST / RPC を直接呼び出し
- **SECURITY DEFINER RPC**: 「認証済みユーザはこの RPC を通じてのみ Group 作成・招待コード発行が可能」という仕組み
- **RLS**: Row Level Security で行ごとアクセス制御。`is_member_of(group_id)` でフィルタ
- **マルチテナント**: 全テーブルに `group_id` を持たせ、RLS で自分の所属 Group のみ表示
- **Vitest グローバルセットアップ**: `globalSetup` でテストユーザ 1 度作成、各 `it` の `afterEach` でデータ cleanup

**参照**: docs/spec/data-foundation/note.md、docs/design/data-foundation/architecture.md

---

## 2. 開発ルール

### 既存プロジェクトルール

- **ドキュメント言語**: 日本語（CLAUDE.md のみ英語）
- **ファイルパス**: プロジェクトルート相対パス（絶対パスは使わない）
- **Vue SFC 形式**: `<script setup lang="ts">` + Composition API のみ
- **TypeScript**: strict mode、ESLint （1tbs、no comma dangle）
- **テスト層分離**: unit（pre-commit + CI） / integration（CI 専用）、命名は `*.integration.test.ts`

### TASK-0015 固有ルール

- **統合テスト配置**: `tests/integration/rpc.test.ts`（ファイル新規作成）
- **テストユーザ再利用**: TASK-0013 の `globalSetup` で作成済みの User A・B を `getCurrentTestUsers()` で取得
- **データクリーンアップ**: 各 `it` ブロック終了後に `cleanupTestUserData()` を `afterEach` で呼び出し（副作用リーク防止）
- **service_role 用途限定**: RPC では作れないシナリオ（期限切れコード作成など）でのみ `service_role` を使用
- **エラー文字列照合**: `.includes()` で部分一致（Supabase の error wrapping 対応）、PG code `23505` は `.code` で厳密一致
- **境界値とブランチ のみ**: redundant ケースは省略（「4 回衝突 → 5 回成功」は CSPRNG 出力制御不可のため不実施）

**参照**: docs/tasks/data-foundation/TASK-0015.md「開発ルール」セクション

---

## 3. 関連実装

### TASK-0013 実装（前提タスク）

**ファイル**: tests/setup/create-test-users.ts

作成済み機能:
- `setupTestUsers()`: Admin API で User A・B を作成
- `teardownTestUsers()`: 作成したユーザを削除（globalTeardown 用）
- `cleanupTestUserData()`: User A・B が作成した groups・group_members を削除（afterEach 用）
- `getCurrentTestUsers()`: グローバルで作成済みユーザ情報を取得

重要: User A / User B の ID・email・password は本ファイルから取得する。直接マイグレーション実行や環境変数参照は不要。

**参照**: docs/implements/data-foundation/TASK-0013/tdd-requirements.md

### TASK-0014 実装（前提タスク）

**ファイル**: tests/integration/rls.integration.test.ts、tests/integration/helpers/rls-fixtures.ts

- RLS テストで Service Role を使用した Group・Player・Match 作成パターンが実装済み
- `createGroupForUserB()` などのヘルパー関数が利用可能

**重要注記**: `rls-fixtures.ts` コメントで「groups テーブルに owner_user_id カラムはなし。group_members で所有者を管理」が明記されている。TASK-0015.md の afterAll サンプルコード（`.or('owner_user_id...')` ）は誤りであり、修正が必要。

**参照**: docs/implements/data-foundation/TASK-0014/

### TASK-0007 実装（RPC 実装済み）

**ファイル**: supabase/migrations/20260519060000_initial_schema.sql

実装済み RPC:
1. **create_group_with_owner(group_name text) RETURNS uuid**
   - 認証チェック → `group_name` バリデーション → groups INSERT → group_members INSERT （1 トランザクション）
   - エラー: `not_authenticated`, `invalid_group_name`

2. **generate_invitation_code(target_group_id uuid) RETURNS text**
   - メンバーシップチェック（`is_member_of()`） → 8 文字 hex 生成 → INSERT → UNIQUE 衝突時リトライ最大 5 回
   - エラー: `not_a_member`, `invitation_code_collision_after_retry`

3. **join_group_with_code(invite_code text) RETURNS uuid**
   - コード検索 → 期限チェック → group_members INSERT → 二重参加は PG code `23505`
   - エラー: `invitation_not_found`, `invitation_expired`, PG code `23505`

全関数に `SECURITY DEFINER` + `SET search_path = public` が付与されている（B2 確定方針）。

**参照**: docs/design/data-foundation/database-schema.sql（RPC セクション）、docs/design/data-foundation/api-endpoints.md

---

## 4. 設計文書

### API / RPC 仕様

**ファイル**: docs/design/data-foundation/api-endpoints.md

- PostgREST API: CRUD は `supabase.from('table').select/insert/...`
- RPC API: `supabase.rpc('func_name', args)`
- Auth API: Google OAuth のみ（Email/Password は無効化）
- エラーハンドリング: PostgrestError オブジェクト形（code / message / details / hint）、PG code 一覧

**重要**: join_group_with_code の二重参加時は **カスタム例外に変換せず** PG code `23505` をそのまま伝播させる（api-endpoints.md 行 346 で確定）。

### DB スキーマ

**ファイル**: docs/design/data-foundation/database-schema.sql

関連テーブル:
- `groups(id uuid PK, name text, created_at, updated_at, deleted_at, CHECK(name_length 1-50))`
- `group_members(id uuid PK, group_id uuid FK, user_id uuid FK, joined_at, created_at, updated_at, deleted_at, UNIQUE(group_id, user_id))`
- `group_invitations(id uuid PK, group_id uuid FK, code text UNIQUE, created_by uuid FK, expires_at, created_at, updated_at, deleted_at)`

**注意**: `groups` テーブルに `owner_user_id` カラムは **存在しない**。所有者情報は `group_members` テーブルで管理される（必要に応じて JOIN で取得）。

### アーキテクチャ・要件

**ファイル**: docs/design/data-foundation/architecture.md、docs/spec/data-foundation/requirements.md、docs/decisions/005-error-handling-strategy.md

関連要件:
- REQ-102: 招待コード発行（有効期限 7 日、使用回数制限なし）
- REQ-103: 招待コードによる Group 参加（コード有効性検証）
- EDGE-001: 期限切れコードは `invitation_expired` で拒否
- EDGE-002: 同 user × 同 group の二重 INSERT はユニーク制約で拒否
- EDGE-101: 招待コード有効期限は正確に 7 日（604800 秒）
- NFR-101: service_role キーは `tests/` 配下のみ、app/ に持ち出さない
- スキーマレビュー ⑦: Group 作成を RPC のみに制限、⑧: CSPRNG + リトライ、⑩: 名前長 1-50 文字制限

---

## 5. テスト関連情報

### テストフレームワーク・設定ファイル

**Vitest 統合テスト設定**: vitest.integration.config.ts
```typescript
{
  test: {
    include: ['tests/integration/**/*.test.ts'],
    globalSetup: ['./tests/setup/create-test-users.ts'],
    testTimeout: 30_000
  }
}
```

**スクリプト**: package.json の `"test:integration": "vitest run --config vitest.integration.config.ts"`

### 既存テストディレクトリ構成・命名パターン

```
tests/
├── setup/
│   ├── create-test-users.ts        ← Admin API でテストユーザ作成・削除
│   └── __tests__/
│       └── create-test-users.test.ts
├── integration/
│   ├── rls.integration.test.ts     ← TASK-0014 の RLS テスト
│   ├── rpc.test.ts                 ← ← TASK-0015（本タスク、新規作成）
│   └── helpers/
│       └── rls-fixtures.ts         ← Service Role 経由のテストデータ作成ヘルパー
```

**命名**: 統合テストは `*.integration.test.ts` または `*.test.ts` で区別。TASK-0015 は `rpc.test.ts` として作成。

### テストユーティリティ・モック設定

**テストユーザ取得**:
```typescript
import { getCurrentTestUsers, cleanupTestUserData } from '../setup/create-test-users'

describe('RPC tests', () => {
  let userA, userB
  beforeAll(() => {
    const users = getCurrentTestUsers()
    userA = users.userA
    userB = users.userB
  })
  
  afterEach(async () => {
    await cleanupTestUserData()  // 各テスト後、作成データを削除
  })
})
```

**クライアント作成（ユーザー認証済み）**:
```typescript
const userAClient = createClient(
  process.env.NUXT_PUBLIC_SUPABASE_URL!,
  process.env.NUXT_PUBLIC_SUPABASE_KEY!
)
await userAClient.auth.signInWithPassword({
  email: userA.email,
  password: userA.password
})
```

**Service Role クライアント（テストデータ事前投入用）**:
```typescript
const serviceClient = createClient(
  process.env.NUXT_PUBLIC_SUPABASE_URL!,
  process.env.NUXT_SUPABASE_SECRET_KEY!
)
```

### 環境変数・.env.test テンプレート

**ファイル**: .env.test.example

```
NUXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NUXT_PUBLIC_SUPABASE_KEY=sb_publishable_xxx
TEST_USER_A_EMAIL=test-a@example.com
TEST_USER_B_EMAIL=test-b@example.com

# ⚠️ NUXT_SUPABASE_SECRET_KEY (sb_secret_*) は .env.test に書かない方針
# ローカル: NUXT_SUPABASE_SECRET_KEY=sb_secret_xxx pnpm test:integration
# CI: GitHub Actions Secrets から注入
```

**実行方法**:
```bash
# ローカル
NUXT_SUPABASE_SECRET_KEY=sb_secret_xxx pnpm test:integration

# CI（GitHub Actions）
env:
  NUXT_SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY }}
run: pnpm test:integration
```

---

## 6. 注意事項

### 技術的制約・セキュリティ・パフォーマンス要件

1. **招待コード衝突リトライテスト方針（B4 確定方針, 2026-05-13）**
   - テストするもの: 5 回連続衝突 → `invitation_code_collision_after_retry` 例外のみ
   - テストしないもの: 「4 回衝突 → 5 回目成功」シナリオ（CSPRNG 出力制御不可、コスト×）
   - 再現方法は実装詳細を参照。B 案（テスト用 RPC）が推奨されている
   - 参照: docs/tasks/data-foundation/TASK-0015.md「実装詳細 5」

2. **group_members は group_id で削除**
   - `groups` テーブルに `owner_user_id` カラムは存在しない（TASK-0014 で発見済みバグ）
   - TASK-0015.md のサンプルコード `.or('owner_user_id.eq.${userAId},...')` は誤りであり、修正が必要
   - `group_members` 経由で `user_id` を特定して削除する手法を採用（既に create-test-users.ts で実装済み）
   - 参照: tests/integration/helpers/rls-fixtures.ts のコメント（line 20-21）

3. **タイムスタンプ依存テストは実時刻使用**
   - PostgreSQL の `now()` は実時刻のため、`vi.useFakeTimers()` では制御不能
   - 期限切れ判定は `service_role` で `expires_at` を過去に設定して再現する
   - 参照: docs/tasks/data-foundation/TASK-0015.md「実装詳細 6」

4. **Service Role キー の取り扱い（strict secret policy, NFR-101）**
   - `NUXT_SUPABASE_SECRET_KEY` は `.env.test` に絶対に書かない
   - ローカル: シェル env で都度渡す（`NUXT_SUPABASE_SECRET_KEY=... pnpm test:integration`）
   - CI: GitHub Actions Secrets から注入
   - tests/ 配下のみで使用。app/ に持ち出さない

5. **エラー照合パターン**
   - カスタム例外: `error.message.includes('invitation_not_found')` で部分一致
   - PG コード: `error.code === '23505'` で厳密一致
   - Supabase の error wrapping によりメッセージに prefix が付く可能性があるため部分一致推奨

6. **後続タスク（TASK-0017）への依存**
   - prd 初回マイグレーション前に、dev 環境で全テスト通過が必須
   - テスト失敗で問題発見が遅れると prd 適用後の RPC 不具合につながる

---

## 参照ドキュメント

| ファイル | 内容 | 参照元 |
|---------|------|-------|
| docs/spec/data-foundation/note.md | プロジェクトコンテキスト | スキーム・用語定義 |
| docs/tasks/data-foundation/TASK-0015.md | タスク仕様・完了条件・実装詳細 | 本タスクの source of truth |
| docs/tasks/data-foundation/TASK-0013.md | テストユーザセットアップ仕様 | 前提タスク |
| docs/tasks/data-foundation/TASK-0007.md | RPC 実装仕様 | RPC 関数定義・検証方法 |
| docs/design/data-foundation/api-endpoints.md | RPC・PostgREST・Auth API 仕様 | エラーハンドリング・呼び出し例 |
| docs/design/data-foundation/database-schema.sql | DB スキーマ・RPC 実装コード | DDL・RPC 関数本体 |
| docs/design/data-foundation/architecture.md | アーキテクチャ全体 | BaaS 直結・RLS・マルチテナント |
| docs/decisions/005-error-handling-strategy.md | エラー処理統一方針 | 例外名・識別子・UI チャネル |
| tests/setup/create-test-users.ts | テストユーザ作成ヘルパー | 前提実装済み |
| tests/integration/helpers/rls-fixtures.ts | Service Role ヘルパー | テストデータ作成 |
| vitest.integration.config.ts | Vitest 統合テスト設定 | テストフレームワーク構成 |

---

**ノート作成日**: 2026-05-24
