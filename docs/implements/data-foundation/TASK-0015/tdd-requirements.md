# TDD 要件定義書: TASK-0015 RPC 統合テスト

- **要件名**: data-foundation
- **タスク ID**: TASK-0015
- **機能名（英）**: rpc-integration-test
- **出力ファイル**: `docs/implements/data-foundation/TASK-0015/tdd-requirements.md`
- **作成日**: 2026-05-24
- **前提タスク**: TASK-0007（RPC 実装）/ TASK-0013（テストユーザセットアップ）
- **参考タスク**: TASK-0014（RLS 統合テスト）

---

## 【信頼性レベル凡例】

- 🔵 **青信号**: EARS 要件定義書・設計文書・タスクファイルを参考にしてほぼ推測していない
- 🟡 **黄信号**: EARS 要件定義書・設計文書から妥当な推測
- 🔴 **赤信号**: EARS 要件定義書・設計文書にない推測

---

## 1. 機能の概要（EARS 要件定義書・設計文書ベース）

### 1.1 何をする「機能」か 🔵

- **対象は機能ではなく自動テスト群**。Supabase に実装済みの 3 つの SECURITY DEFINER RPC
  （`create_group_with_owner` / `generate_invitation_code` / `join_group_with_code`）の
  振る舞いを **dev プロジェクト相手の統合テスト** で保証する。🔵
- 各 RPC の **正常パス・異常パス・境界値** を網羅し、戻り値・DB 副作用・エラー識別子の
  整合性を検証する。🔵
- テスト配置: `tests/integration/rpc.test.ts`（TASK-0015 仕様で確定）。🔵

### 1.2 解決する問題 🔵

- **マルチテナント基盤 RPC の回帰防止**: groups / group_members / group_invitations に対する
  特権操作（`SECURITY DEFINER`）を集約する 3 RPC が破壊された場合、Group 作成・招待・参加
  フロー全体が動作不能になる。CI で早期検出する。🔵
- **TASK-0007 確定値の整合性ゲート**: 例外名（`invitation_not_found` / `invitation_expired`）
  および PG コード `23505` が `database-schema.sql` / `api-endpoints.md` 行 320〜332 と一致
  していることを担保する。🔵
- 後続タスク **TASK-0017（prd 初回マイグレーション適用）の前提ゲート**。dev で本テスト群が
  全通過しない限り、prd 適用は行わない。🔵

### 1.3 想定ユーザ（実行主体） 🔵

- 開発者（pre-commit 後の `pnpm test:integration` ローカル実行）🔵
- GitHub Actions CI ジョブ（PR チェック・main 適用前ゲート）🔵
- 「badkichi の Group 作成・招待コード発行・参加」が正しく動作することを間接的に保証される
  最終ユーザ（Group 管理者・メンバー）🟡

### 1.4 システム内での位置づけ 🔵

```
Infrastructure Layer (data-foundation)
└── tests/integration/
    ├── rls.integration.test.ts     (TASK-0014 既存)
    ├── helpers/
    │   └── rls-fixtures.ts         (TASK-0014 既存。service_role ヘルパ)
    └── rpc.test.ts                 ← 本タスクで新規作成
└── tests/setup/
    └── create-test-users.ts        (TASK-0013 既存。globalSetup でテストユーザ作成)
```

- レイヤー: Infrastructure Layer のテスト（実 Supabase 依存）🔵
- mock unit テスト（`*.test.ts` / pre-commit + CI）とは分離。`vitest.integration.config.ts`
  で `globalSetup` + `pool: 'forks'` + `singleFork: true` を共有する（TASK-0013, TASK-0014 と
  同一構成）。🔵

### 1.5 参照したドキュメント

- **EARS 要件**: REQ-102 / REQ-103 / REQ-202 / EDGE-001 / EDGE-002 / EDGE-101 /
  NFR-101 / NFR-103
- **設計文書**:
  - `docs/design/data-foundation/api-endpoints.md` § 「RPC 関数 API」（行 222〜353）
  - `docs/design/data-foundation/database-schema.sql`（行 478〜575: 3 RPC 実装本体）
  - `docs/design/data-foundation/architecture.md` § 「Group 作成・招待コード設計」
  - `docs/decisions/005-error-handling-strategy.md`（識別子・例外名統一）
- **タスク仕様**: `docs/tasks/data-foundation/TASK-0015.md`
- **タスクノート**: `docs/implements/data-foundation/TASK-0015/tdd-tasknote.md`

---

## 2. 入力・出力の仕様（EARS 機能要件・TypeScript 型定義ベース）

### 2.1 入力（テストランタイム前提条件） 🔵

#### 環境変数 🔵

| 変数 | 用途 | 信頼性 |
|------|------|------|
| `NUXT_PUBLIC_SUPABASE_URL` | dev プロジェクト URL（`.env.test` 経由） | 🔵 |
| `NUXT_PUBLIC_SUPABASE_KEY` | publishable key（`sb_publishable_*`） | 🔵 |
| `NUXT_SUPABASE_SECRET_KEY` | service_role key（`sb_secret_*`）。**シェル env / GitHub Actions Secrets から注入**、`.env.test` には書かない（NFR-101 + ユーザルール `feedback_strict_secret_policy`） | 🔵 |
| `TEST_USER_A_EMAIL`, `TEST_USER_B_EMAIL` | テストユーザの識別子 | 🔵 |
| `TEST_USER_A_PASSWORD`, `TEST_USER_B_PASSWORD` | サインインに使用 | 🔵 |

#### 事前データ 🔵

| 入力 | 提供元 | 信頼性 |
|------|-------|------|
| User A / User B（auth.users 行 + email/password） | TASK-0013 の `setupTestUsers()`（globalSetup） | 🔵 |
| User A のサインイン済みクライアント（`userAClient`） | 本タスクの `beforeAll` 内で `signInWithPassword()` 実行 | 🔵 |
| User B のサインイン済みクライアント（`userBClient`） | 本タスクの `beforeAll` 内で `signInWithPassword()` 実行 | 🔵 |
| service_role クライアント（`serviceClient`） | テストデータ事前投入（期限切れコード作成等） | 🔵 |
| 各 `describe` 内で必要な Group / 招待コード | 当該 `describe` の `beforeAll` で RPC 経由作成 | 🔵 |

#### テスト操作（テストケース単位の入力） 🔵

| 操作 | API | 信頼性 |
|------|-----|------|
| Group 作成 | `userAClient.rpc('create_group_with_owner', { group_name })` | 🔵 |
| 招待コード発行 | `userAClient.rpc('generate_invitation_code', { target_group_id })` | 🔵 |
| Group 参加 | `userBClient.rpc('join_group_with_code', { invite_code })` | 🔵 |
| 未認証呼び出し | `createClient(url, key)` した素のクライアントで RPC 実行（サインインしない） | 🔵 |
| 期限切れコード投入 | `serviceClient.from('group_invitations').insert({ ..., expires_at: <past> })` | 🔵 |
| DB 状態確認 | `serviceClient.from('groups' / 'group_members' / 'group_invitations').select()` | 🔵 |

### 2.2 出力（検証対象） 🔵

#### 戻り値（正常系） 🔵

| RPC | 戻り値の型・形式 | 信頼性 |
|-----|--------------|------|
| `create_group_with_owner` | `string` (新規 `group_id`、uuid 36 文字 `^[0-9a-f-]{36}$`) | 🔵 |
| `generate_invitation_code` | `string` (8 文字、大文字英数字 `^[A-Z0-9]{8}$`)。実装は `upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8))` で hex 大文字のみ | 🔵 |
| `join_group_with_code` | `string` (参加した `group_id`、uuid) | 🔵 |

> **照合パターン補足**: api-endpoints.md 行 273 では「8 文字の大文字 hex」と記載。実装 `database-schema.sql` 行 529 も `upper(...hex...)` で英数大文字混在の可能性は無く、実体は `[A-F0-9]{8}` が正確。テストでは `^[A-F0-9]{8}$` で照合する（TASK-0015.md 中の `[A-Za-z0-9]` 表記は緩い側で互換）。🟡

#### DB 副作用（正常系） 🔵

| RPC | 副作用 | 信頼性 |
|-----|--------|------|
| `create_group_with_owner` | `groups` に 1 行（`name = trim(group_name)`）+ `group_members` に 1 行（`group_id, user_id = auth.uid()`） | 🔵 |
| `generate_invitation_code` | `group_invitations` に 1 行（`group_id, code, created_by = auth.uid(), expires_at = now() + 7 days`） | 🔵 |
| `join_group_with_code` | `group_members` に 1 行（`group_id, user_id = auth.uid()`） | 🔵 |

> **重要**: `groups` テーブルに `owner_user_id` カラムは **存在しない**（TASK-0014 で確認済み）。
> 所有者情報は `group_members` テーブル経由でのみ取得可能。TASK-0015.md 中のサンプルコード
> `groupRow?.owner_user_id` および `memberRow?.role` の照合は **誤り** であり、本タスクでは
> 以下の方針に修正する（tdd-red フェーズで実装時に反映）：
> - `groups`: `name` の値を検証
> - `group_members`: `group_id` + `user_id` の存在を検証（`role` カラムは現スキーマに無いため検証不可）🔵

#### エラー識別子（異常系） 🔵 — TASK-0007 確定値

| RPC | エラー識別子 | 発生条件 | 照合方法 | 信頼性 |
|-----|------------|---------|---------|------|
| `create_group_with_owner` | `not_authenticated` | `auth.uid() IS NULL` | `error.message.includes('not_authenticated')` | 🔵 |
| `create_group_with_owner` | `invalid_group_name` | `group_name` が NULL / trim 後 0 文字 / trim 後 51 文字以上 | `error.message.includes('invalid_group_name')` | 🔵 |
| `generate_invitation_code` | `not_a_member` | `is_member_of(target_group_id)` が false | `error.message.includes('not_a_member')` | 🔵 |
| `generate_invitation_code` | `invitation_code_collision_after_retry` | UNIQUE 衝突を 5 回連続発生 | `error.message.includes('invitation_code_collision_after_retry')` | 🔵 |
| `join_group_with_code` | `invitation_not_found` | コード未存在 or `deleted_at IS NOT NULL` | `error.message.includes('invitation_not_found')` | 🔵 |
| `join_group_with_code` | `invitation_expired` | `expires_at < now()` | `error.message.includes('invitation_expired')` | 🔵 |
| `join_group_with_code` | `already_in_group` | 既所属 User の再 join (ADR-006 早期失敗ガード) | `error.message.includes('already_in_group')` | 🔵 |
| `join_group_with_code` | PG code `23505` (理論上のみ) | UNIQUE (user_id) または UNIQUE (group_id, user_id) 違反。ADR-006 適用後は RPC ガードが先発するため到達は同時並行 INSERT (race) のみ | `(error as { code?: string })?.code === '23505'` で **厳密一致** | 🟡 |

> **TASK-0007 整合性の確認**: `database-schema.sql` 行 489 / 495 / 523 / 537 / 560 / 564 にて
> 上記識別子と `RAISE EXCEPTION` 文字列が一致することを確認済み。`api-endpoints.md` 行 320〜332
> （join_group_with_code エラー表）とも整合。**旧仕様の `invalid_code` / `expired_code` /
> `already_member` は使用しない**。🔵
>
> **ADR-006 追補 (TASK-0018, 2026-05-24)**: 追記 migration `20260524150000_adr_006_single_group_per_user.sql`
> で `group_members.UNIQUE(user_id)` と `join_group_with_code` 冒頭の `IF EXISTS → RAISE EXCEPTION 'already_in_group'`
> 早期失敗ガードが導入された。これにより TC-15-11 の期待値は `23505` から `already_in_group` 文字列照合に
> 変更された (tdd-testcases.md §3.11 参照)。App 識別子 `ALREADY_IN_GROUP` の追加は ADR-005 §D2-D3 規約により
> auth-onboarding 単位の管轄でありここでは対象外。🔵

### 2.3 入出力の関係性 🔵

- 入力（RPC 引数 + 認証状態 + DB 既存データ）→ RPC 内部の検証フロー（auth check → 引数
  バリデーション → 副作用） → 出力（戻り値 + DB 副作用 + エラー識別子）。
- カスタム例外（`RAISE EXCEPTION 'xxx'`）は PostgrestError の `message` フィールドに格納される
  （PG code は `P0001`、検証は文字列部分一致を採用）。🔵
- UNIQUE 違反は PostgreSQL 由来のため `message` ではなく `code = '23505'` で識別する
  （api-endpoints.md 行 346）。🔵

### 2.4 データフロー（dataflow.md） 🔵

主要フロー（簡略）:

```
[正常: Group 作成]
userAClient → rpc('create_group_with_owner', { group_name }) → auth.uid() check →
trim+length check → INSERT groups → INSERT group_members → RETURN group_id

[正常: 招待コード発行]
userAClient → rpc('generate_invitation_code', { target_group_id }) → is_member_of() check →
LOOP { gen_random_uuid → INSERT group_invitations → (UNIQUE OK) RETURN code }

[正常: 参加]
userBClient → rpc('join_group_with_code', { invite_code }) → SELECT group_invitations →
expires_at check → INSERT group_members → RETURN group_id

[異常: 5 回衝突]
userAClient → rpc('generate_invitation_code') → 5 回連続 UNIQUE 違反 →
RAISE EXCEPTION 'invitation_code_collision_after_retry'
```

参照: `docs/design/data-foundation/dataflow.md` の RPC フロー図、
`docs/design/data-foundation/database-schema.sql` 行 480〜575。

---

## 3. 制約条件（EARS 非機能要件・アーキテクチャ設計ベース）

### 3.1 パフォーマンス制約 🔵

- **単一テストファイル**: `tests/integration/rpc.test.ts` で完結（独立した
  `vitest.integration.config.ts` を再利用）。🔵
- **テストタイムアウト**: 30 秒（TASK-0014 / 0013 と同設定）。🔵
- **API 呼び出しレイテンシ**: Supabase Cloud dev とのネットワーク往復が支配的（テストごとに
  1〜2 秒程度を許容）。🟡
- **テスト総数**: 全 11 ケース（TC-15-01 〜 TC-15-11）。実行時間目安: 60〜120 秒程度。🟡

### 3.2 セキュリティ制約 🔵

- **service_role キー取扱い (NFR-101 + ユーザルール `feedback_strict_secret_policy`)**:
  - `.env.test` / `.env.test.example` には絶対に書かない 🔵
  - ローカル: シェル env で都度渡す（`NUXT_SUPABASE_SECRET_KEY=... pnpm test:integration`） 🔵
  - CI: GitHub Actions Secrets から注入 🔵
  - 使用範囲: `tests/` 配下のみ。`app/` には絶対に持ち出さない 🔵
- **SECURITY DEFINER の検証**: 3 RPC は全て `SECURITY DEFINER` + `SET search_path = public`
  が付与されている（B2 確定方針）。これにより未認証クライアントからも `auth.uid()` 経由で
  認証チェックが走り、`not_authenticated` を返す。テストでもこの挙動を検証する。🔵
- **RLS 直接 INSERT の禁止確認**: `groups` / `group_members` / `group_invitations` への
  直接 INSERT は RLS で禁止されているが、本タスクでは RPC 経由検証が主目的のため、RLS 禁止の
  明示テストは TASK-0014 のスコープ。🔵

### 3.3 互換性制約 🔵

- **TASK-0013 共有資産再利用 (MUST)**:
  - `setupTestUsers()`（globalSetup） / `getCurrentTestUsers()` / `cleanupTestUserData()`
    （afterEach）を再利用。🔵
  - User A / User B の ID・email・password は本ヘルパから取得。直接環境変数参照や
    ユーザ作成コードを書かない。🔵
- **TASK-0014 既存ヘルパ参照**: `tests/integration/helpers/rls-fixtures.ts` のパターンを
  参考。ただし RPC テスト固有のヘルパ（`createExpiredInvitation` / `invokeWithGuaranteedCollision`
  等）は本タスク内で別途用意（tdd-refactor フェーズで `helpers/rpc-fixtures.ts` 等に切出）。🟡
- **vitest globalSetup 共有**: `vitest.integration.config.ts` の `pool: 'forks'` +
  `singleFork: true` でグローバル状態を共有する（TASK-0013 / 0014 と同様）。🔵
- **TASK-0007 確定値整合 (MUST)**: 例外名 `invitation_not_found` / `invitation_expired` /
  PG `23505` のみを使用。**旧仕様の `invalid_code` / `expired_code` / `already_member` は
  絶対に使わない** （api-endpoints.md 行 320〜332 と整合）。🔵

### 3.4 アーキテクチャ制約 🔵

- BaaS 直結アーキテクチャ（PRD §5.1）。独自 REST API サーバは介さず、
  `@supabase/supabase-js` の `rpc()` メソッドで直接呼び出す。🔵
- 認証は Google OAuth が本番フローだが、テストでは Email/Password を Admin API 経由で有効化
  済み（TASK-0013）。🔵
- PostgreSQL の `now()` は実時刻のため `vi.useFakeTimers()` では制御不能。期限切れテストは
  service_role で `expires_at` を過去に直接 INSERT する。🔵

### 3.5 データベース制約 🔵

- `groups`: `id uuid PK`, `name text CHECK(1-50 chars)`, `created_at`, `updated_at`,
  `deleted_at` (REQ-405)。**`owner_user_id` カラムは存在しない**。🔵
- `group_members`: `id uuid PK`, `group_id uuid FK`, `user_id uuid FK`, `joined_at`,
  `UNIQUE(group_id, user_id)`（二重参加防止、EDGE-002）。**`role` カラムは存在しない**。🔵
- `group_invitations`: `id uuid PK`, `group_id uuid FK`, `code text UNIQUE`,
  `created_by uuid FK`, `expires_at timestamptz`, `deleted_at`。🔵
- RLS: groups / group_members / group_invitations の INSERT ポリシーは設定なし
  （RPC SECURITY DEFINER 経由のみ）。🔵

### 3.6 API 制約 🔵

- `supabase.rpc('func_name', args)` の戻り値は `{ data, error }` 形式。
- `error` は PostgrestError オブジェクト: `{ code, message, details, hint }`。
- カスタム例外（`RAISE EXCEPTION 'xxx'`）の `code` は `P0001`、`message` に識別子文字列が
  入る。Supabase の error wrapping により prefix が付く可能性があるため **部分一致照合** を採用。🔵
- UNIQUE 違反は `code = '23505'`、PG ネイティブのため **厳密一致照合** を採用。🔵

### 3.7 EARS 要件・設計文書参照

- **参照 EARS 要件**: REQ-102 (招待コード 7 日有効) / REQ-103 (コード検証 → 参加) /
  REQ-202 (Group 作成・参加が前提条件) / EDGE-001 (期限切れ拒否) /
  EDGE-002 (UNIQUE 二重参加防止) / EDGE-101 (7 日ちょうどの境界) /
  NFR-101 (service_role 取扱い) / NFR-103 (招待コード 8 文字)
- **参照設計文書**:
  - `docs/design/data-foundation/api-endpoints.md` 行 222〜353
  - `docs/design/data-foundation/database-schema.sql` 行 478〜575
  - `docs/design/data-foundation/architecture.md` § Group 作成・招待コード設計
  - `docs/decisions/005-error-handling-strategy.md`（識別子集約）

---

## 4. 想定される使用例（EARS Edge ケース・データフローベース）

### 4.1 基本的な使用パターン（通常要件 REQ-102 / REQ-103 由来） 🔵

#### パターン A: User A が新規 Group を作成 🔵
1. User A が `userAClient.rpc('create_group_with_owner', { group_name: 'テストG' })` 実行
2. `auth.uid()` チェック通過、`trim(group_name)` の長さチェック通過
3. `groups` に 1 行、`group_members` に 1 行が原子的に作成される
4. 戻り値: 新規 `group_id`（uuid 形式）
5. 検証: `serviceClient.from('groups').select('name').eq('id', data).single()` で `name = 'テストG'`、
   `serviceClient.from('group_members').select().eq('group_id', data).eq('user_id', userAId)` で 1 行存在

#### パターン B: User A が招待コードを発行 🔵
1. パターン A で作成済みの `groupAId` を `userAClient.rpc('generate_invitation_code', { target_group_id: groupAId })` に渡す
2. `is_member_of(groupAId)` チェック通過
3. CSPRNG で 8 文字 hex コード生成 → `group_invitations` に INSERT 成功
4. 戻り値: 8 文字大文字英数字コード
5. 検証: 戻り値が `^[A-F0-9]{8}$` にマッチ、`serviceClient.from('group_invitations').select().eq('code', data).single()` で
   `group_id = groupAId`, `expires_at` が「発行から約 7 日後」（境界 EDGE-101 正側を暗黙的にカバー）

#### パターン C: User B が招待コードで参加 🔵
1. パターン B で取得した `validCode` を `userBClient.rpc('join_group_with_code', { invite_code: validCode })` に渡す
2. `group_invitations` から code 検索 → ヒット
3. `expires_at >= now()` 通過
4. `group_members` に `(groupAId, userBId)` を INSERT 成功
5. 戻り値: 参加した `group_id`
6. 検証: `serviceClient.from('group_members').select().eq('group_id', groupAId).eq('user_id', userBId)` で 1 行存在

### 4.2 データフロー（dataflow.md より） 🔵

| フロー | 内容 |
|--------|------|
| Group 作成 | クライアント → rpc('create_group_with_owner') → auth/長さ検証 → INSERT × 2 → uuid 返却 |
| 招待コード発行 | クライアント → rpc('generate_invitation_code') → メンバー検証 → INSERT (リトライ最大 5) → コード返却 |
| 参加 | クライアント → rpc('join_group_with_code') → コード検索 → 期限検証 → INSERT → group_id 返却 |

### 4.3 エッジケース（EDGE-XXX 由来） 🔵

#### EDGE-001 + EDGE-101 負側: 期限切れコード参加 🔵
1. service_role で `expires_at = new Date(Date.now() - 1000)` の `group_invitations` 行を直接 INSERT
2. User B が `join_group_with_code({ invite_code: 'EXPIRED1' })` 実行
3. RPC 内部: 行ヒット → `expires_at < now()` → `RAISE EXCEPTION 'invitation_expired'`
4. 検証: `error.message.includes('invitation_expired')` が true

#### EDGE-002: 既メンバー再参加 🔵
1. パターン C 終了後（User B 参加済み）
2. User B が同じ `validCode` で `join_group_with_code` を再実行
3. RPC 内部: 行ヒット → 期限内 → `INSERT group_members` で UNIQUE 違反
4. PostgreSQL から `code = '23505'` の PostgrestError が返る（カスタム例外には変換しない、
   api-endpoints.md 行 346 確定）
5. 検証: `(error as { code?: string })?.code === '23505'` が true

### 4.4 エラーケース（EDGE-XXX エラー処理由来） 🔵

| ケース | 発生条件 | 期待エラー | 信頼性 |
|--------|---------|----------|------|
| 未認証 Group 作成 | サインインしていないクライアントで `create_group_with_owner` 呼び出し | `not_authenticated` | 🔵 |
| 名前 空文字 | `group_name: ''`（trim 後 0 文字） | `invalid_group_name` | 🔵 |
| 名前 51 文字 | `group_name: 'a'.repeat(51)`（trim 後 51 文字） | `invalid_group_name` | 🔵 |
| 非メンバー コード発行 | User B が User A 所有の `groupAId` で `generate_invitation_code` 呼び出し | `not_a_member` | 🔵 |
| 5 回連続衝突 | UNIQUE 違反を 5 回連続発生（再現方法は実装詳細 5 参照、B 案推奨） | `invitation_code_collision_after_retry` | 🔵 |
| 不正コード参加 | `invite_code: 'INVALID0'`（存在しない） | `invitation_not_found`（TASK-0007 確定値） | 🔵 |
| 期限切れコード参加 | service_role で `expires_at` を過去に設定したコード | `invitation_expired`（TASK-0007 確定値） | 🔵 |
| 既メンバー再参加 | パターン C 後の同コード再実行 | PG `23505`（TASK-0007 確定値） | 🔵 |

### 4.5 省略するケース（redundant / コスト×） 🟡

| 省略ケース | 理由 |
|----------|------|
| 名前 1 文字 / 50 文字ぴったり（上限内正常） | TC-15-01 で正常パスを実質カバー、redundant |
| `null` 渡し | PostgreSQL 関数定義の型エラーで SQL レベル自動弾き、テスト不要 |
| 「4 回衝突 → 5 回目成功」 | CSPRNG (`gen_random_uuid()`) 出力制御不可、コスト×（B4 確定方針 2026-05-13） |
| 期限 7 日ぴったり境界（正側） | TC-15-05 / TC-15-08 で発行直後コードが受理 = 実質カバー |

---

## 5. EARS 要件・設計文書との対応関係

### 5.1 参照したユーザストーリー
- US-201（Group 管理者として招待コードを発行したい）
- US-202（ユーザとして招待コードで Group に参加したい）

### 5.2 参照した機能要件
- **REQ-102**: 招待コード発行（有効期限 7 日、使用回数制限なし） → TC-15-05
- **REQ-103**: 招待コードによる Group 参加（コード有効性検証 → group_members 追加） → TC-15-08
- **REQ-202**: 認証済み + 所属 0 個ユーザに Group 作成 / 参加経路を提供 → 全テストで前提

### 5.3 参照した非機能要件
- **NFR-101**: service_role キーをクライアント側コードに含めない → テストヘルパは `tests/` 配下限定
- **NFR-103**: 招待コードは 8 文字英数字、text 型可変 → TC-15-05 で 8 文字確認

### 5.4 参照した Edge ケース
- **EDGE-001**: 期限切れコードは expired を返す → TC-15-10
- **EDGE-002**: user_id × group_id ユニーク制約 → TC-15-11
- **EDGE-101**: 招待コード有効期限 7 日ちょうど（604800 秒） → TC-15-10 (負側) /
  TC-15-05 + TC-15-08 (正側、暗黙的)

### 5.5 参照した受け入れ基準
- `acceptance-criteria.md` § Group 作成・招待・参加フロー成功条件
- TASK-0015.md 「完了条件」のチェックリスト全 13 項目

### 5.6 参照した設計文書

| 領域 | ファイル | 該当セクション |
|------|---------|--------------|
| アーキテクチャ | `docs/design/data-foundation/architecture.md` | RLS 設計 + Group 作成・招待コード設計 |
| データフロー | `docs/design/data-foundation/dataflow.md` | RPC 経由 Group 作成・招待・参加 |
| 型定義 | `docs/design/data-foundation/interfaces.ts` | RPC 引数 / 戻り値型（Database['public']['Functions']） |
| データベース | `docs/design/data-foundation/database-schema.sql` | groups / group_members / group_invitations + 3 RPC 実装本体（行 480〜575） |
| API 仕様 | `docs/design/data-foundation/api-endpoints.md` | RPC 関数 API（行 222〜353）+ エラーオブジェクトの形（行 380〜389） |
| ADR | `docs/decisions/005-error-handling-strategy.md` | 識別子・例外名統一方針 |

### 5.7 参照した TASK ドキュメント

- **TASK-0007** (RPC 実装): 例外識別子の SoT（`invitation_not_found` / `invitation_expired` / PG `23505`）
- **TASK-0013** (テストユーザセットアップ): `setupTestUsers` / `cleanupTestUserData` 共有資産
- **TASK-0014** (RLS 統合テスト): `tests/integration/` ディレクトリ構造・ヘルパパターン
- **TASK-0017** (prd 適用): 本タスクが前提ゲート

---

## 6. テストケース一覧（boundary + branch のみ、redundant 省略）

| テストID | 種別 | 対象 RPC | シナリオ | 期待結果 | 信頼性 |
|----------|------|---------|---------|---------|--------|
| TC-15-01 | boundary | create_group_with_owner | 正常: 認証済み + `'テストG'` | uuid 返却、`groups` + `group_members` 行作成 | 🔵 |
| TC-15-02 | branch | create_group_with_owner | 未認証 | `not_authenticated` | 🔵 |
| TC-15-03 | boundary | create_group_with_owner | 空文字列（下限境界外） | `invalid_group_name` | 🔵 |
| TC-15-04 | boundary | create_group_with_owner | 51 文字（上限境界外） | `invalid_group_name` | 🔵 |
| TC-15-05 | boundary | generate_invitation_code | 正常: メンバーが発行 | 8 文字コード、`group_invitations` 行 | 🔵 |
| TC-15-06 | branch | generate_invitation_code | 非メンバー | `not_a_member` | 🔵 |
| TC-15-07 | branch | generate_invitation_code | 5 回連続衝突（B4 確定方針） | `invitation_code_collision_after_retry` | 🔵 (再現方法 🟡) |
| TC-15-08 | boundary | join_group_with_code | 正常: 有効コード | `group_members` 行追加 | 🔵 |
| TC-15-09 | branch | join_group_with_code | 不正コード（TASK-0007 確定値） | `invitation_not_found` | 🔵 |
| TC-15-10 | branch | join_group_with_code | 期限切れコード（EDGE-101 負側 / TASK-0007 確定値） | `invitation_expired` | 🔵 |
| TC-15-11 | branch | join_group_with_code | 既メンバー再参加（EDGE-002 / TASK-0007 確定値） | PG code `23505` | 🔵 |

---

## 7. 注意事項・実装時に詳細化する論点

### 7.1 既知の不備（TASK-0015.md サンプルコードの修正要否） 🔵

- `groups` テーブルに `owner_user_id` カラムは存在しない（TASK-0014 で発見・確認済み）
- `group_members` テーブルに `role` カラムは存在しない
- TASK-0015.md の `afterAll` および TC-15-01 の検証コードは現スキーマと不整合
- **修正方針**:
  - `afterAll` cleanup: TASK-0013 の `cleanupTestUserData()` を `afterEach` で呼び出す方式に統一
  - TC-15-01 の DB 検証: `groups.name` の値と `group_members(group_id, user_id)` の存在のみ検証

### 7.2 招待コード衝突リトライ全敗テスト（TC-15-07）の再現方法 🟡

- **方針候補 B（推奨）**: テスト用 RPC `test_force_collision_invitation_code` を別マイグレーションで追加し、
  `gen_random_uuid()` を固定値に置換 + 事前に同コードを INSERT して 5 回連続 UNIQUE 違反を確定
- **実装時詳細化**: tdd-red フェーズで方針 B のマイグレーション SQL と呼び出しヘルパ
  `invokeWithGuaranteedCollision()` の実装を確定
- **保留**: 方針 B のマイグレーションを本タスクの SQL に含めるか、別タスクで切出すかは実装時に判断

### 7.3 テスト順序依存 🟡

- TC-15-11（既メンバー再参加）は TC-15-08（正常参加）の後に実行される前提
- `describe('join_group_with_code')` 内では `it` 順序保証されるため、`tests/integration/rpc.test.ts`
  単一ファイルに集約する限り問題なし
- ファイル分割する場合は順序を明示的に保証する必要あり（現状単一ファイル方針）

### 7.4 タイムスタンプ依存テストの実時刻使用 🔵

- PostgreSQL の `now()` は実時刻のため `vi.useFakeTimers()` では制御不能
- 期限切れ判定は service_role 経由で `expires_at = new Date(Date.now() - 1000)` を直接 INSERT する
  方法を採用（TASK-0015.md 実装詳細 6 参照）

### 7.5 service_role 使用範囲の限定 🔵

- RPC の振る舞いを検証するテストなので、service_role は **RPC では作れないシナリオ** でのみ使用:
  - TC-15-10: 期限切れコードの事前 INSERT
  - TC-15-07: 衝突再現のための事前 INSERT（方針 B のヘルパ内）
  - 検証クエリ: 各テストの DB 副作用確認（`groups` / `group_members` / `group_invitations` の SELECT）
- それ以外（正常パス / 異常パス）は必ず認証済みクライアント（`userAClient` / `userBClient`）または
  未認証クライアントで RPC を呼び出す

### 7.6 後続タスク（TASK-0017）への引き継ぎ 🔵

- 本タスクが dev で全通過しないと prd 適用後の RPC 不具合発見が遅れる
- TASK-0017（prd 初回マイグレーション適用）の前に必ず通すこと

---

## 8. 品質判定

### 8.1 信頼性レベル分布

| カテゴリ | 🔵 青信号 | 🟡 黄信号 | 🔴 赤信号 |
|---------|----------|----------|----------|
| 機能の概要 | 9 | 1 | 0 |
| 入出力の仕様 | 27 | 2 | 0 |
| 制約条件 | 20 | 2 | 0 |
| 想定される使用例 | 22 | 1 | 0 |
| テストケース一覧 | 11 | 0 | 0 |
| 注意事項 | 7 | 3 | 0 |
| **合計** | **96** | **9** | **0** |

**🔵 比率**: 96 / 105 ≈ **91%**

### 8.2 評価基準照合

| 観点 | 評価 | 根拠 |
|------|------|------|
| 要件の曖昧さ | ✅ なし | 3 RPC × 正常+異常+境界 が明確、TASK-0007 確定値で例外名統一済み |
| 入出力定義 | ✅ 完全 | 引数・戻り値・DB 副作用・エラー識別子を全て表で網羅 |
| 制約条件 | ✅ 明確 | NFR-101 / NFR-103 / TASK-0007 整合 / vitest 設定すべて引用元あり |
| 実装可能性 | ✅ 確実 | 既存 RPC 実装 + 既存テストインフラ（TASK-0013 / 0014）が利用可能 |
| 信頼性レベル | ✅ 高 | 🔵 91%、🟡 9%、🔴 0% |

**総合判定**: ✅ **高品質**

残る 🟡 項目:
- 招待コード衝突リトライ再現方法の実装時詳細化（TC-15-07）
- テスト順序依存（単一ファイルで担保するが、分割時の注意点）
- レイテンシ目安・テスト総実行時間の推測
- groups テーブル `owner_user_id` 不在に対する TASK-0015.md サンプル修正は確定 🔵 だが、
  詳細実装は tdd-red フェーズで反映

---

## 9. 次のステップ

- 次のフェーズ: **テストケース洗い出し**
- 推奨コマンド: `/tsumiki:tdd-testcases data-foundation TASK-0015`
- 成果物（次フェーズ）: `docs/implements/data-foundation/TASK-0015/tdd-testcases.md`
