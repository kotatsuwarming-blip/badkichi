# TDD 要件定義書: TASK-0014 RLS 統合テスト

- **要件名**: data-foundation
- **タスク ID**: TASK-0014
- **機能名（英）**: rls-integration-test
- **出力ファイル**: `docs/implements/data-foundation/TASK-0014/tdd-requirements.md`
- **作成日**: 2026-05-24
- **前提タスク**: TASK-0006（スキーマ + RLS マイグレーション）/ TASK-0013（テストユーザセットアップ）

---

## 【信頼性レベル凡例】

- 🔵 **青信号**: EARS 要件定義書・設計文書・タスクファイルを参考にしてほぼ推測していない
- 🟡 **黄信号**: EARS 要件定義書・設計文書から妥当な推測
- 🔴 **赤信号**: EARS 要件定義書・設計文書にない推測

---

## 1. 機能の概要（EARS 要件定義書・設計文書ベース）

### 1.1 何をする「機能」か 🔵

- **対象は機能ではなく自動テスト群**。Supabase に投入済みの RLS ポリシー（TASK-0006）が、
  「認証ユーザは自 Group のデータのみアクセス可、未認証ユーザは全テーブル拒否、他 Group のデータには
  空集合または拒否を返す」ことを **dev プロジェクト相手の統合テスト** で保証する。🔵
- 全 11 テーブル（groups / group_members / group_invitations / players / matches / sets /
  set_player_positions / rallies / shots / position_overrides / recording_gaps）について、
  SELECT / INSERT / UPDATE の境界挙動を網羅する。🔵
- テスト配置: `tests/integration/rls.test.ts`（`*.integration.test.ts` 命名規約）。🔵

### 1.2 解決する問題 🔵

- マルチテナント設計（PRD §1）における **テナント間データ漏洩**を、デプロイ前に自動検出する。🔵
- RLS マイグレーション (`supabase/migrations/20260519060000_initial_schema.sql`) の **回帰防止**:
  ヘルパー関数 `is_member_of()` や FK 経路を辿るポリシー SQL を編集した際に、テナント分離が
  壊れていないかを CI で検証する。🔵
- 後続タスク TASK-0017（prd 初回マイグレーション適用）の **前提ゲート**。dev で本テスト群が
  全通過しない限り、prd 適用は行わない。🔵

### 1.3 想定ユーザ（実行主体） 🔵

- 開発者（pre-commit 後の `pnpm test:integration` ローカル実行）🔵
- GitHub Actions CI ジョブ（PR チェック・main 適用前ゲート）🔵
- 「badkichi のテナント分離が正しく機能していること」を間接的に保証される最終ユーザ（Group A の
  メンバーが Group B のデータを覗けないこと）🟡

### 1.4 システム内での位置づけ 🔵

```
Infrastructure Layer (data-foundation)
└── tests/integration/         ← ★ ここ（TASK-0014）
    ├── setup/                 (TASK-0013 が提供)
    │   └── create-test-users.integration.test.ts
    └── rls.test.ts            ← 🆕 本タスクで新規作成
```

- レイヤー: Infrastructure Layer のテスト（実 Supabase 依存）🔵
- mock unit テスト（`*.test.ts` / pre-commit + CI）とは分離。`*.integration.test.ts` の
  別レイヤーで実行する（ユーザルール `feedback_test_layer_separation`）。🔵
- 単一フォーク実行（`vitest.integration.config.ts` の `pool: 'forks'` + `singleFork: true`）で
  globalSetup ステートを共有する。🔵

### 1.5 参照したドキュメント

- **EARS 要件**: REQ-101 / REQ-201 / NFR-104 / EDGE-003 / REQ-401 / REQ-402 / REQ-403
- **設計文書**:
  - `docs/design/data-foundation/architecture.md` § 「RLS 設計」「Group 作成・招待コード設計」
  - `docs/design/data-foundation/database-schema.sql`（11 テーブル DDL + RLS）
  - `docs/design/data-foundation/api-endpoints.md`（PostgREST / RPC API 仕様）
- **タスク仕様**: `docs/tasks/data-foundation/TASK-0014.md`
- **タスクノート**: `docs/implements/data-foundation/TASK-0014/tdd-tasknote.md`

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

#### 事前データ 🔵

| 入力 | 提供元 | 信頼性 |
|------|-------|------|
| User A / User B（auth.users 行 + email/password） | TASK-0013 の `setupTestUsers()`（globalSetup） | 🔵 |
| User B Group + 配下の Player / Match / Set / Rally / Shot / position_override / recording_gap / group_invitation | 本タスクの `beforeAll` 内で `service_role` クライアントから投入 | 🔵 |
| User A のサインイン済みクライアント | 本タスクの `beforeAll` 内で `signInWithPassword()` 実行 | 🔵 |

#### テスト操作（テストケース単位の入力） 🔵

| 操作 | API | 信頼性 |
|------|-----|------|
| User A クライアントで他テナント行を読む | `userAClient.from('<table>').select('*').eq('id', <User B 行 ID>)` | 🔵 |
| User A クライアントで他テナントに書き込む | `userAClient.from('<table>').insert({ group_id: userBGroupId, ... })` | 🔵 |
| User A クライアントで他テナントの行を更新する | `userAClient.from('<table>').update({...}).eq('id', <User B 行 ID>).select()` | 🔵 |
| 匿名クライアントで読む | `anonClient.from('groups').select('*')` | 🔵 |
| `groups` / `group_members` / `group_invitations` への **直接 INSERT** | `userAClient.from('<table>').insert({...})`（RPC 経由ではない） | 🔵 |

### 2.2 出力（テスト assertion で確認する Supabase 応答） 🔵

Supabase RLS の標準挙動に従い、操作別に下記を **唯一の正答** として assert する（EDGE-003）。

| 操作 | 期待 `data` | 期待 `error` | 根拠 | 信頼性 |
|------|-------------|--------------|------|------|
| 他テナント SELECT | `[]`（空配列） | `null` | RLS 暗黙フィルタ。EDGE-003 / Supabase RLS 仕様 | 🔵 |
| 他テナント INSERT | `null` | 非 `null`（`code === '42501'` または同等の `new row violates row-level security policy`） | RLS WITH CHECK 違反 | 🔵 |
| 他テナント UPDATE | `[]`（`.select()` 連結時） | `null` | RLS が空集合に走り影響行数 0 | 🔵 |
| `groups` 直接 INSERT | `null` | 非 `null` | スキーマレビュー ⑦ A-1: RPC 経由のみ許可 | 🔵 |
| `group_members` 直接 INSERT | `null` | 非 `null` | スキーマレビュー ⑦ A-2: RPC 経由のみ許可 | 🔵 |
| `group_invitations` 直接 INSERT | `null` | 非 `null` | RPC 経由のみ許可（⑧ B-12） | 🔵 |
| 匿名 SELECT | `[]` または `null` | `null` または 非 `null`（いずれにせよ行は取得不可） | REQ-201 / NFR-104（anon ロール全拒否） | 🔵 |

### 2.3 入出力の関係性 🔵

```
beforeAll:
  setupTestUsers()                            ← TASK-0013 の I/F
    └─ returns { userA: TestUser, userB: TestUser }
  serviceClient = createClient(url, secretKey)
  userBGroupId   = createGroupForUserB(serviceClient, userB.id)
  userBPlayerId  = createPlayer(serviceClient, userBGroupId)
  ...（match / set / rally / shot / position_override / recording_gap / invitation）
  userAClient    = createClient(url, publishableKey)
  await userAClient.auth.signInWithPassword({ email: userA.email, password: userA.password })

it(...):
  result = await userAClient.from('<table>').<op>(...)
  expect(result.data).toEqual([])            // SELECT / UPDATE
  expect(result.error).not.toBeNull()        // INSERT

afterAll:
  cleanupUserBData(serviceClient, userBGroupId)
  （teardownTestUsers は TASK-0013 の globalTeardown が担当）
```

### 2.4 参照型定義・API 仕様

- **TestUser 型**（TASK-0013 提供）:
  ```typescript
  interface TestUser { id: string; email: string; password: string }
  ```
- **Supabase JS API**:
  - `createClient<Database>(url, key)`
  - `PostgrestSingleResponse<T>` = `{ data: T | null, error: PostgrestError | null, count, status, statusText }`
  - `AuthResponse` = `{ data: { user, session }, error: AuthError | null }`
- **PostgrestError**: 主に `code: '42501'`（RLS WITH CHECK 違反）/ `message` に
  `new row violates row-level security policy` を含む。テストでは `error !== null` を満たせば
  細かいエラーコード照合は省略可（黄信号、テスト保守性優先 🟡）。
- **参照**:
  - `docs/design/data-foundation/api-endpoints.md`
  - `tests/setup/create-test-users.ts`

---

## 3. 制約条件（EARS 非機能要件・アーキテクチャ設計ベース）

### 3.1 機能・整合性制約 🔵

| ID | 制約 | 信頼性 |
|----|------|------|
| REQ-101 | 認証ユーザは自 Group のみアクセス可（→ 他 Group は空集合・拒否） | 🔵 |
| REQ-201 | 未認証は全テーブル拒否（anon ロール） | 🔵 |
| REQ-401 | 全データ行が `group_id` か FK 経路で Group に辿れる | 🔵 |
| REQ-402 | MVP では DELETE API を実装しない → **DELETE のテストは対象外** | 🔵 |
| REQ-403 | Supabase ローカル禁止、**dev クラウドプロジェクトのみ**で実行 | 🔵 |
| NFR-104 | 全 11 テーブルで RLS を有効化 → 全テーブル SELECT を網羅 | 🔵 |
| EDGE-003 | 他 Group SELECT は空集合（INSERT は `42501`、UPDATE は影響行数 0 派生） | 🔵 |

### 3.2 セキュリティ制約 🔵

- `service_role` キーは `.env.test` に書かない。シェル環境変数 / GitHub Secrets 経由のみ。
  ログ出力時にマスクされていることを目視確認（NFR-101 + ユーザルール
  `feedback_strict_secret_policy`）。🔵
- `prd` プロジェクトには **絶対に接続しない**（REQ-403 + ユーザルール `feedback_naming_prd` のラベル運用）。
  CI ジョブは dev プロジェクトの URL のみを参照する。🔵
- `groups` / `group_members` / `group_invitations` への **直接 INSERT は禁止**（RPC 経由のみ）。
  テストはこの拒否動作を保証する。🔵

### 3.3 パフォーマンス・実行制約 🟡

| 項目 | 値 | 信頼性 |
|------|----|------|
| `testTimeout` | 30,000ms（`vitest.integration.config.ts`） | 🔵 |
| 各テストケース想定時間 | <100ms（Supabase ネットワーク往復含む） | 🟡 |
| `globalSetup` ユーザ作成時間 | 数秒（実測必要） | 🟡 |
| 並列実行 | `pool: 'forks'` + `singleFork: true`（User B Group ID 共有のため） | 🔵 |
| 全テスト件数 | 29 件（TC-14-01〜29） | 🔵 |

### 3.4 アーキテクチャ・運用制約 🔵

- **テスト配置**: `tests/integration/rls.test.ts`（単一ファイル）。複数ファイルへ分割する場合は
  各ファイルで別 User B を用意するか、ロックが必要 🔵。
- **ヘルパー関数の切り出し**: tdd-refactor フェーズで `tests/integration/helpers/` に
  `createGroupForUserB` / `createPlayer` / `createMatch` / `createSet` / `createRally` /
  `createShot` / `createPositionOverride` / `createRecordingGap` / `createInvitation` /
  `cleanupUserBData` を移動する 🔵。
- **マイグレーション依存**: `supabase/migrations/20260519060000_initial_schema.sql` に
  RLS ポリシー全て格納済み。失敗時はマイグレーションへバックフィードする（TASK-0006 を修正） 🔵。
- **後続タスクへの引き継ぎ**: TASK-0017（prd 初回マイグレーション適用）の前提ゲート。
  本テストが dev で全通過しない限り prd 適用は行わない 🔵。

### 3.5 データベース制約（DDL より） 🔵

- 全テーブルに `id uuid PK DEFAULT gen_random_uuid()`、`created_at timestamptz DEFAULT now()`、
  `updated_at timestamptz DEFAULT now()`、`deleted_at timestamptz`（MVP では常に NULL）が存在。🔵
- `group_id` 保持テーブル: `groups`(自身)/`group_members`/`group_invitations`/`players`/`matches`。
- `group_id` を FK 経由で解決するテーブル: `sets`/`set_player_positions`/`rallies`/`shots`/
  `position_overrides`/`recording_gaps`。
- INSERT 用テストデータは各テーブルの NOT NULL カラム最小集合を満たすこと（具体値は
  tdd-testcases で決定 🟡）。

### 3.6 参照した EARS 要件・設計文書

- **EARS 要件**: REQ-101, REQ-201, REQ-401, REQ-402, REQ-403, NFR-101, NFR-104, EDGE-003
- **設計文書**:
  - `docs/design/data-foundation/architecture.md` § 「RLS 設計」「マイグレーション運用」「CI / 開発者ツール」
  - `docs/design/data-foundation/database-schema.sql`
  - `docs/design/data-foundation/api-endpoints.md`
  - `vitest.integration.config.ts`
  - `tests/setup/create-test-users.ts`

---

## 4. 想定される使用例（EARS Edge ケース・データフローベース）

### 4.1 基本的な使用パターン（通常要件） 🔵

#### パターン 1: ローカル開発時の事前検証 🔵

```bash
# .env.test を読み込み + service_role キーをシェル env で注入
NUXT_SUPABASE_SECRET_KEY=sb_secret_xxx pnpm test:integration
```

- 期待: 29 件全テスト合格。
- 失敗時: RLS ポリシー回帰のサイン。マイグレーション（TASK-0006）にバックフィード。

#### パターン 2: CI ジョブ実行 🔵

- GitHub Actions Secrets に `NUXT_SUPABASE_SECRET_KEY` を登録。
- `.env.test.example` をベースに dev プロジェクト接続情報を CI 内で組み立て。
- PR チェックおよび main 適用前ゲートで実行。
- 期待: 同上。`prd` プロジェクトに **絶対に接続しないこと**を CI 設定で担保（dev URL のみ
  Secrets に登録）。

### 4.2 データフロー（テスト 1 ケースの流れ） 🔵

```
[globalSetup]
  └─ setupTestUsers()  ──▶ User A / User B 作成（Admin API）

[beforeAll]
  ├─ serviceClient.from('groups').insert({...})       ←(直接ではなく)
  │   または serviceClient.rpc('create_group_with_owner', {...}) で User B Group 作成
  ├─ serviceClient.from('players|matches|sets|...').insert({...}) で配下データ投入
  └─ userAClient.auth.signInWithPassword({ email: userA.email, password })

[各 it]
  ├─ SELECT: userAClient.from('<table>').select('*').eq('id', userB行ID)
  │   └─ assert: data === [], error === null
  ├─ INSERT: userAClient.from('<table>').insert({ group_id: userBGroupId, ... })
  │   └─ assert: error !== null
  └─ UPDATE: userAClient.from('<table>').update({...}).eq('id', userB行ID).select()
      └─ assert: (data ?? []) === []

[afterAll]
  └─ cleanupUserBData(serviceClient, userBGroupId)
      （User B 配下の全データを service_role 権限で物理削除）

[globalTeardown]
  └─ teardownTestUsers()  ──▶ auth.users から User A / User B 削除
```

参照: `docs/design/data-foundation/dataflow.md` 該当フロー（マルチテナント RLS フィルタ）

### 4.3 エッジケース・例外パス 🔵

| ID | シナリオ | 期待動作 | 検証ケース | 信頼性 |
|----|---------|--------|-----------|------|
| EDGE-003 | 他 Group SELECT | 空配列 `[]` | TC-14-01〜11（11 テーブル分） | 🔵 |
| EDGE-003 派生 | 他 Group INSERT | RLS WITH CHECK 違反 → `error` 非 null | TC-14-12〜18 | 🔵 |
| EDGE-003 派生 | 他 Group UPDATE | RLS フィルタで影響行数 0 → `data` 空配列 | TC-14-22〜28 | 🔵 |
| ⑦ A-1 | `groups` 直接 INSERT | 拒否 → `error` 非 null | TC-14-19 | 🔵 |
| ⑦ A-2 | `group_members` 直接 INSERT | 拒否 → `error` 非 null | TC-14-20 | 🔵 |
| ⑧ B-12 | `group_invitations` 直接 INSERT | 拒否 → `error` 非 null | TC-14-21 | 🔵 |
| REQ-201 | 匿名ユーザの SELECT | 空配列または error | TC-14-29 | 🔵 |

### 4.4 明示的に対象外とするケース 🔵

| 対象外 | 理由 | 信頼性 |
|--------|------|------|
| 自 Group へのアクセス成功確認 | TASK-0015（RPC テスト）で実質的に検証される。冗長回避（ユーザルール `feedback_test_coverage`） | 🔵 |
| DELETE 操作のテスト | REQ-402: MVP では DELETE API 未実装。RLS DELETE パスは到達しない | 🔵 |
| 複数行 SELECT の挙動 | 1 行で同型動作を確認できるため、冗長回避 | 🔵 |
| INSERT・UPDATE の 11 テーブル全網羅 | `groups`/`group_members`/`group_invitations` は RPC 経由必須なので別カテゴリで網羅、残り 7 テーブルは同型なので 1 ケースずつで branch coverage 達成 | 🔵 |
| NFR-001（マイグレーション適用 30s 以内）の実測 | TASK-0017 で別途実施 | 🟡 |
| RLS ポリシーのエラーコード詳細照合（`code === '42501'`） | テスト保守性優先。`error !== null` のみ検証。詳細はマイグレーション側で担保 | 🟡 |

### 4.5 参照した EARS 要件・設計文書

- **EARS 要件**: EDGE-003（他 Group SELECT 空集合）/ REQ-201（未認証拒否）/ REQ-402（削除なし）
- **設計文書**:
  - `docs/design/data-foundation/dataflow.md`
  - `docs/design/data-foundation/architecture.md` § 「RLS 設計」「Group 作成・招待コード設計」

---

## 5. EARS 要件・設計文書との対応関係

### 5.1 参照したユーザストーリー

- 「複数の Group に所属するメンバーが、自分の Group 以外のデータを参照できないこと」
  （`docs/spec/data-foundation/user-stories.md` マルチテナント関連ストーリー）

### 5.2 参照した機能要件

| EARS ID | 内容 | 本タスクでの取り扱い |
|---------|------|---------------------|
| REQ-101 | 認証ユーザは自 Group のみアクセス可 | TC-14-01〜28 で他 Group アクセスの拒否を網羅検証 |
| REQ-201 | 未認証は全テーブル拒否 | TC-14-29 で代表 1 テーブル分検証 |
| REQ-401 | 全行が group_id か FK で Group に辿れる | テストデータ投入時の前提条件 |
| REQ-402 | MVP では DELETE 未実装 | DELETE テストを対象外として明示 |
| REQ-403 | dev クラウドプロジェクトのみで実行 | CI / ローカル両方で dev URL のみ使用 |

### 5.3 参照した非機能要件

| EARS ID | 内容 | 本タスクでの取り扱い |
|---------|------|---------------------|
| NFR-101 | service_role キーをクライアント側に含めない | `.env.test` に書かず、シェル env / GitHub Secrets のみ |
| NFR-104 | 全テーブル RLS 有効化 | 11 テーブル全てを SELECT テストで網羅（TC-14-01〜11） |

### 5.4 参照した Edge ケース

| EARS ID | 内容 | 本タスクでの取り扱い |
|---------|------|---------------------|
| EDGE-003 | 他 Group SELECT は空集合 | 全 SELECT テストの期待値（空配列）として採用 |
| EDGE-003 派生 | 他 Group INSERT は `42501` エラー | INSERT テストの期待値（`error` 非 null）として採用 |
| EDGE-003 派生 | 他 Group UPDATE は影響行数 0 | UPDATE テストの期待値（`data` 空配列）として採用 |

### 5.5 参照した受け入れ基準

- `docs/spec/data-foundation/acceptance-criteria.md` のマルチテナント関連項目（自 Group のみ
  アクセス可、未認証は全拒否）
- TASK-0014 § 完了条件チェックリスト全項目

### 5.6 参照した設計文書

| 設計領域 | ファイル | 参照箇所 |
|----------|---------|----------|
| アーキテクチャ | `docs/design/data-foundation/architecture.md` | § RLS 設計 / Group 作成・招待コード設計 / CI 開発者ツール |
| データフロー | `docs/design/data-foundation/dataflow.md` | マルチテナント RLS フィルタフロー |
| 型定義 | `tests/setup/create-test-users.ts` の `TestUser` 型 / `@supabase/supabase-js` の `SupabaseClient` / `PostgrestSingleResponse` | 型整合性確認 |
| データベース | `docs/design/data-foundation/database-schema.sql` / `supabase/migrations/20260519060000_initial_schema.sql` | 11 テーブル DDL + RLS ポリシー |
| API 仕様 | `docs/design/data-foundation/api-endpoints.md` | PostgREST API / RPC API |

### 5.7 参照したタスク仕様・関連タスク

- **本タスク**: `docs/tasks/data-foundation/TASK-0014.md`
- **タスクノート**: `docs/implements/data-foundation/TASK-0014/tdd-tasknote.md`
- **前提タスク**: TASK-0013（テストユーザ作成セットアップ） / TASK-0006（スキーマ + RLS マイグレーション）
- **後続タスク**: TASK-0015（RPC テスト） / TASK-0017（prd 初回マイグレーション + NFR-001 実測）

---

## 6. テスト ID 一覧（要件トレース）

| テスト ID | 種別 | 対象テーブル | 操作 | 期待結果 | 対応 EARS | 信頼性 |
|-----------|------|------------|------|---------|----------|------|
| TC-14-01 | boundary | groups | SELECT | `data === []` | REQ-101, EDGE-003 | 🔵 |
| TC-14-02 | boundary | group_members | SELECT | `data === []` | REQ-101, EDGE-003 | 🔵 |
| TC-14-03 | boundary | players | SELECT | `data === []` | REQ-101, EDGE-003 | 🔵 |
| TC-14-04 | boundary | matches | SELECT | `data === []` | REQ-101, EDGE-003 | 🔵 |
| TC-14-05 | boundary | sets | SELECT | `data === []` | REQ-101, EDGE-003 | 🔵 |
| TC-14-06 | boundary | set_player_positions | SELECT | `data === []` | REQ-101, EDGE-003 | 🔵 |
| TC-14-07 | boundary | rallies | SELECT | `data === []` | REQ-101, EDGE-003 | 🔵 |
| TC-14-08 | boundary | shots | SELECT | `data === []` | REQ-101, EDGE-003 | 🔵 |
| TC-14-09 | boundary | position_overrides | SELECT | `data === []` | REQ-101, EDGE-003 | 🔵 |
| TC-14-10 | boundary | recording_gaps | SELECT | `data === []` | REQ-101, EDGE-003 | 🔵 |
| TC-14-11 | boundary | group_invitations | SELECT | `data === []` | REQ-101, EDGE-003 | 🔵 |
| TC-14-12 | branch | players | INSERT | `error !== null` | REQ-101 | 🔵 |
| TC-14-13 | branch | matches | INSERT | `error !== null` | REQ-101 | 🔵 |
| TC-14-14 | branch | sets | INSERT | `error !== null` | REQ-101 | 🔵 |
| TC-14-15 | branch | rallies | INSERT | `error !== null` | REQ-101 | 🔵 |
| TC-14-16 | branch | shots | INSERT | `error !== null` | REQ-101 | 🔵 |
| TC-14-17 | branch | position_overrides | INSERT | `error !== null` | REQ-101 | 🔵 |
| TC-14-18 | branch | recording_gaps | INSERT | `error !== null` | REQ-101 | 🔵 |
| TC-14-19 | branch | groups | 直接 INSERT | `error !== null` | ⑦ A-1 | 🔵 |
| TC-14-20 | branch | group_members | 直接 INSERT | `error !== null` | ⑦ A-2 | 🔵 |
| TC-14-21 | branch | group_invitations | 直接 INSERT | `error !== null` | ⑧ B-12 | 🔵 |
| TC-14-22 | branch | players | UPDATE | `(data ?? []) === []` | REQ-101, EDGE-003 派生 | 🔵 |
| TC-14-23 | branch | matches | UPDATE | `(data ?? []) === []` | REQ-101, EDGE-003 派生 | 🔵 |
| TC-14-24 | branch | sets | UPDATE | `(data ?? []) === []` | REQ-101, EDGE-003 派生 | 🔵 |
| TC-14-25 | branch | rallies | UPDATE | `(data ?? []) === []` | REQ-101, EDGE-003 派生 | 🔵 |
| TC-14-26 | branch | shots | UPDATE | `(data ?? []) === []` | REQ-101, EDGE-003 派生 | 🔵 |
| TC-14-27 | branch | position_overrides | UPDATE | `(data ?? []) === []` | REQ-101, EDGE-003 派生 | 🔵 |
| TC-14-28 | branch | recording_gaps | UPDATE | `(data ?? []) === []` | REQ-101, EDGE-003 派生 | 🔵 |
| TC-14-29 | branch | groups（代表） | 未認証 SELECT | `(data ?? []) === []` | REQ-201, NFR-104 | 🔵 |

合計: **29 件**（boundary 11 + branch 18）

---

## 7. 信頼性レベルサマリー

| カテゴリ | 🔵 青信号 | 🟡 黄信号 | 🔴 赤信号 | 合計 |
|---------|---------|---------|---------|------|
| 機能の概要 | 5 | 1 | 0 | 6 |
| 入出力仕様 | 12 | 1 | 0 | 13 |
| 制約条件 | 11 | 3 | 0 | 14 |
| 想定使用例 | 7 | 2 | 0 | 9 |
| テスト ID 一覧 | 29 | 0 | 0 | 29 |
| **合計** | **64** | **7** | **0** | **71** |

**品質判定**: **高品質**（🔵 90%）。EARS 要件・設計文書・タスクファイル・Supabase 公式 RLS 挙動に
基づき、推測なしで要件をトレース可能。黄信号は (1) パフォーマンス実測値 (2) エラーコード詳細照合の
省略 (3) ユーザストーリーの読み替え に限定される。

---

## 8. 品質判定（自己評価）

| 観点 | 評価 | コメント |
|------|------|---------|
| 要件の曖昧さ | なし | 入出力・期待値・対象外を明示 |
| 入出力定義の完全性 | 完全 | 環境変数 / 事前データ / 操作 / 応答 を網羅 |
| 制約条件の明確性 | 明確 | EARS ID / NFR / セキュリティ / 運用制約を列挙 |
| 実装可能性 | 確実 | TASK-0013 で基盤実装済み、本タスクは追加実装のみ |
| 信頼性レベル | 🔵 多数 (90%) | 推測ゼロを目標に達成 |

→ **判定: 高品質** / 次フェーズ `tdd-testcases` に進行可能。

---

## 9. 次フェーズへの引き継ぎ事項

1. **テストケース展開（tdd-testcases）**:
   - 上記 TC-14-01〜29 を `docs/implements/data-foundation/TASK-0014/tdd-testcases.md` に展開
   - 各ケースの「事前条件 / 操作 / 期待結果 / 信頼性」を表で記述
   - INSERT 用ダミーデータの最小集合（NOT NULL カラム）をテーブル別に定義
2. **tdd-red**: `tests/integration/rls.test.ts` に失敗するテストを 29 件作成
3. **tdd-green**: 実装は既存マイグレーション（TASK-0006）でカバー済み想定。失敗時は
   `supabase/migrations/20260519060000_initial_schema.sql` を確認・修正
4. **tdd-refactor**: ヘルパー（`createGroupForUserB` 他）を `tests/integration/helpers/` に切り出し
5. **tdd-verify-complete**: TASK-0014 の完了条件チェックリスト全項目を満たすことを確認
