# TDD テストケース定義書: TASK-0014 RLS 統合テスト

- **要件名**: data-foundation
- **タスク ID**: TASK-0014
- **機能名（英）**: rls-integration-test
- **出力ファイル**: `docs/implements/data-foundation/TASK-0014/tdd-testcases.md`
- **作成日**: 2026-05-24
- **対象テストファイル**: `tests/integration/rls.test.ts`
- **実行コマンド**: `pnpm test:integration`

---

## 【信頼性レベル凡例】

- 🔵 **青信号**: EARS 要件・設計文書・既存実装・マイグレーション DDL を参照、推測なし
- 🟡 **黄信号**: 元資料から妥当な推測（境界値の具体値選定、エラーコード省略など）
- 🔴 **赤信号**: 元資料にない推測（本ドキュメントでは原則使用しない）

---

## 0. テスト全体方針（ポリシー: feedback_test_coverage）

| 項目 | 方針 | 信頼性 |
|------|------|------|
| カバレッジ方針 | 境界値 1 ケース + 主要 branch 1 ケースのみ。冗長な「複数行 SELECT」「同型 branch の言い換え」「DELETE（MVP 未実装）」「自 Group 成功確認（TASK-0015 でカバー）」は **省略** | 🔵 |
| INSERT 用ダミーデータ | 各テーブルの NOT NULL カラム最小集合のみを満たす。CHECK 制約に違反しない最小値を採用 | 🔵 |
| エラーコード照合 | `error !== null` のみ検証し、`code === '42501'` 詳細照合は省略（テスト保守性優先） | 🟡 |
| 並列実行 | `vitest.integration.config.ts` の `pool: 'forks'` + `singleFork: true` で単一フォーク実行 | 🔵 |
| テストフレームワーク | Vitest 1.x（TypeScript strict mode） | 🔵 |

---

## 1. 開発言語・フレームワーク

- **プログラミング言語**: TypeScript (strict mode)
  - **言語選択の理由**: プロジェクト全体が Nuxt 3 + TypeScript で統一されており、`@supabase/supabase-js` の型定義（`SupabaseClient<Database>` / `PostgrestSingleResponse<T>`）を活用できる
  - **テストに適した機能**: 型補完による誤った API 呼び出しの compile-time 検出、`generated/types/supabase.ts` による Database 型整合性確認
- **テストフレームワーク**: Vitest 1.x
  - **フレームワーク選択の理由**: TASK-0013 で `vitest.integration.config.ts` 構築済み、`globalSetup` でテストユーザを共有可能、`pool: 'forks'` + `singleFork: true` で state 共有が容易
  - **テスト実行環境**: Supabase Cloud dev プロジェクト（実プロジェクト）。ローカル Supabase は使用しない（REQ-403）
- 🔵 信頼性レベル

---

## 2. 事前条件・共通セットアップ

### 2.1 環境変数 🔵

| 変数 | 値 | 設定場所 | 信頼性 |
|------|------|---------|------|
| `NUXT_PUBLIC_SUPABASE_URL` | dev プロジェクト URL | `.env.test`（gitignore 対象外） | 🔵 |
| `NUXT_PUBLIC_SUPABASE_KEY` | `sb_publishable_*` | `.env.test` | 🔵 |
| `NUXT_SUPABASE_SECRET_KEY` | `sb_secret_*`（service_role） | **シェル env / GitHub Secrets のみ** | 🔵 |
| `TEST_USER_A_EMAIL` / `TEST_USER_B_EMAIL` | テストユーザ識別子 | `.env.test` | 🔵 |

### 2.2 共通 beforeAll（テスト 1 ファイル全体で 1 度実行） 🔵

```typescript
let serviceClient: SupabaseClient<Database>
let userAClient:   SupabaseClient<Database>
let anonClient:    SupabaseClient<Database>
let userBGroupId:        string
let userBPlayerId:       string
let userBMatchId:        string
let userBSetId:          string
let userBSetPositionId:  string
let userBRallyId:        string
let userBShotId:         string
let userBPositionOvId:   string
let userBRecordingGapId: string
let userBInvitationId:   string

beforeAll(async () => {
  // 【テストデータ準備】: TASK-0013 globalSetup が作成済みの User A/B を取得
  const { userA, userB } = getCurrentTestUsers()

  serviceClient = createClient<Database>(
    process.env.NUXT_PUBLIC_SUPABASE_URL!,
    process.env.NUXT_SUPABASE_SECRET_KEY!
  )

  // 【初期条件設定】: User B 名義で Group + 配下 11 種データを service_role で投入
  userBGroupId = await createGroupForUserB(serviceClient, userB.id)
  userBPlayerId       = await createPlayer(serviceClient, userBGroupId)
  userBMatchId        = await createMatch(serviceClient, userBGroupId, [<player_ids x4>])
  userBSetId          = await createSet(serviceClient, userBMatchId)
  userBSetPositionId  = await createSetPlayerPosition(serviceClient, userBSetId, userBPlayerId)
  userBRallyId        = await createRally(serviceClient, userBSetId, userBPlayerId)
  userBShotId         = await createShot(serviceClient, userBRallyId)
  userBPositionOvId   = await createPositionOverride(serviceClient, userBRallyId)
  userBRecordingGapId = await createRecordingGap(serviceClient, userBSetId)
  userBInvitationId   = await createInvitation(serviceClient, userBGroupId, userB.id)

  // 【User A 認証セッション準備】: signInWithPassword で JWT を保持
  userAClient = createClient<Database>(
    process.env.NUXT_PUBLIC_SUPABASE_URL!,
    process.env.NUXT_PUBLIC_SUPABASE_KEY!
  )
  await userAClient.auth.signInWithPassword({ email: userA.email, password: userA.password })

  // 【匿名クライアント】: TC-14-29 用（未認証）
  anonClient = createClient<Database>(
    process.env.NUXT_PUBLIC_SUPABASE_URL!,
    process.env.NUXT_PUBLIC_SUPABASE_KEY!
  )
})

afterAll(async () => {
  // 【テスト後処理】: User B 配下データを service_role で物理削除（auth.users 削除は globalTeardown が担当）
  await cleanupUserBData(serviceClient, userBGroupId)
})
```

### 2.3 INSERT 用ダミーデータ最小集合（マイグレーション DDL ベース） 🔵

| テーブル | 最小 INSERT カラム | 補足 |
|---------|-------------------|------|
| `groups` | `name: 'spoof-group'` | CHECK: `char_length(trim(name)) BETWEEN 1 AND 50` |
| `group_members` | `group_id: userBGroupId, user_id: userA.id` | RPC 経由のみ許可 |
| `group_invitations` | `group_id: userBGroupId, code: 'SPOOF12', created_by: userA.id, expires_at: <now+7d>` | RPC 経由のみ許可 |
| `players` | `group_id: userBGroupId, name: 'spoof-player'` | `handedness` は DEFAULT `'unknown'` |
| `matches` | `group_id: userBGroupId, team_a_player1_id, team_a_player2_id, team_b_player1_id, team_b_player2_id, video_source_type: 'youtube', video_source_url: 'https://youtu.be/x'` | players の複合 FK 制約あり |
| `sets` | `match_id: userBMatchId, set_number: 1, first_serving_team: 'A'` | その他は DEFAULT |
| `set_player_positions` | `set_id: userBSetId, player_id: userBPlayerId, team: 'A', position: 'left'` | - |
| `rallies` | `set_id: userBSetId, rally_number: 1, serving_team: 'A', server_position: 'left', server_player_id: userBPlayerId, receiver_player_id: userBPlayerId` | - |
| `shots` | `rally_id: userBRallyId, shot_number: 1` | `input_source` DEFAULT `'manual'` |
| `position_overrides` | `rally_id: userBRallyId, team: 'A', override_type: 'swapped'` | - |
| `recording_gaps` | `set_id: userBSetId`（+ 必要カラム） | DDL 行 261-269 参照 |

---

## 3. 正常系テストケース

> 本タスクは「**RLS によるテナント分離が機能していること**」をテストする統合テストであり、
> 期待動作は「他テナント操作が **拒否 / 空集合返却される** こと」である。
> 慣例的な「正常系 = 機能成功」ではなく、**「RLS フィルタが正しく拒否を返す」ことを正常動作**と定義する。
> 自 Group の正常成功パスは TASK-0015 (RPC テスト) でカバーされるため、本タスクでは省略。

### TC-14-01〜11: SELECT 境界値テスト（11 テーブル × User A → User B Group）

> **境界値の意味**: 「自 Group」と「他 Group」の境界。境界の外側を踏んだとき、RLS が `[]` を返すか。
> **境界値選択の根拠**: User A は User B Group に所属していない（最小の境界差）。User B が投入した行 ID を直接 `.eq('id', ...)` 指定することで、RLS フィルタ通過のみが取得可否を分ける状況を作る。

| TC-ID | テーブル | 操作 SQL（疑似） | 入力 | 期待 `data` | 期待 `error` | 信頼性 |
|-------|---------|-----------------|------|-------------|--------------|------|
| TC-14-01 | `groups` | `.select('*').eq('id', userBGroupId)` | `userBGroupId` | `[]` | `null` | 🔵 |
| TC-14-02 | `group_members` | `.select('*').eq('group_id', userBGroupId)` | `userBGroupId` | `[]` | `null` | 🔵 |
| TC-14-03 | `players` | `.select('*').eq('id', userBPlayerId)` | `userBPlayerId` | `[]` | `null` | 🔵 |
| TC-14-04 | `matches` | `.select('*').eq('id', userBMatchId)` | `userBMatchId` | `[]` | `null` | 🔵 |
| TC-14-05 | `sets` | `.select('*').eq('id', userBSetId)` | `userBSetId` | `[]` | `null` | 🔵 |
| TC-14-06 | `set_player_positions` | `.select('*').eq('id', userBSetPositionId)` | `userBSetPositionId` | `[]` | `null` | 🔵 |
| TC-14-07 | `rallies` | `.select('*').eq('id', userBRallyId)` | `userBRallyId` | `[]` | `null` | 🔵 |
| TC-14-08 | `shots` | `.select('*').eq('id', userBShotId)` | `userBShotId` | `[]` | `null` | 🔵 |
| TC-14-09 | `position_overrides` | `.select('*').eq('id', userBPositionOvId)` | `userBPositionOvId` | `[]` | `null` | 🔵 |
| TC-14-10 | `recording_gaps` | `.select('*').eq('id', userBRecordingGapId)` | `userBRecordingGapId` | `[]` | `null` | 🔵 |
| TC-14-11 | `group_invitations` | `.select('*').eq('id', userBInvitationId)` | `userBInvitationId` | `[]` | `null` | 🔵 |

**代表例**: TC-14-03 `players` SELECT

- **テスト名**: 「User A は User B Group の `players` 行を SELECT しても空集合が返る」
  - **何をテストするか**: `players` テーブルの RLS SELECT ポリシーが、`is_member_of(group_id)` で User A をフィルタアウトすること
  - **期待される動作**: `data === []`、`error === null`（SELECT は RLS により空集合を返すのが正常挙動）
- **入力値**: `userBPlayerId`（User B の Group 配下に存在する有効な UUID）
  - **入力データの意味**: 実在する行を指定することで「権限がないため見えない」と「行自体が存在しない」を区別する
- **期待される結果**: `data === []`、`error === null`
  - **期待結果の理由**: REQ-101 + EDGE-003：他 Group SELECT は空集合（Supabase RLS 標準挙動）
- **テストの目的**: `players` の RLS SELECT ポリシーが TASK-0006 マイグレーションで正しく適用されている回帰検証
  - **確認ポイント**: NFR-104（全テーブル RLS 有効）の網羅
- 🔵 信頼性レベル

---

## 4. 境界値テストケース（追加分）

### TC-14-29: 未認証ユーザによる SELECT

- **テスト名**: 「匿名（未認証）クライアントから `groups` を SELECT しても空集合または error が返る」
  - **境界値の意味**: 「認証あり = 自 Group のみ可」vs「認証なし = 全テーブル拒否」という境界。anon ロールが GRANT されていないか、RLS USING でフィルタされるかが境界
  - **境界値での動作保証**: REQ-201 / NFR-104 の代表 1 テーブル分検証（11 テーブル全網羅は冗長）
- **入力値**: `anonClient.from('groups').select('*')`（条件指定なし、全件取得試行）
  - **境界値選択の根拠**: 最も基本的なエントリテーブル `groups` で代表確認。他テーブルは同一の anon ロール拒否ポリシー
  - **実際の使用場面**: 攻撃者がログイン前に直接 PostgREST を叩く想定
- **期待される結果**: `(data ?? []) === []`（または `error !== null`、いずれでも RLS で見えていない）
  - **境界での正確性**: anon ロールに対し SELECT 権限を許可していない or RLS USING で false が返る
  - **一貫した動作**: REQ-201（全テーブル拒否）の代表検証
- **テストの目的**: 未認証アクセスの RLS 拒否を確認
  - **堅牢性の確認**: 認証フローを通らない PostgREST 直叩きでもデータが露出しないこと
- 🔵 信頼性レベル

---

## 5. 異常系テストケース（テナント越境 INSERT / UPDATE / 直接 INSERT）

### 5.1 TC-14-12〜18: 他テナント INSERT 拒否（branch coverage）

> **エラーケースの概要**: User A が User B Group の `group_id` を指定して書き込みを試行する
> **エラー処理の重要性**: テナント越境書き込みはマルチテナント設計の致命的セキュリティ違反

| TC-ID | テーブル | 入力 INSERT カラム（抜粋） | 期待 `data` | 期待 `error` | 信頼性 |
|-------|---------|--------------------------|-------------|--------------|------|
| TC-14-12 | `players` | `{ group_id: userBGroupId, name: 'spoof' }` | `null` | 非 `null` | 🔵 |
| TC-14-13 | `matches` | `{ group_id: userBGroupId, team_a_player1_id, ..., video_source_type: 'youtube', video_source_url: '...' }` | `null` | 非 `null` | 🔵 |
| TC-14-14 | `sets` | `{ match_id: userBMatchId, set_number: 99, first_serving_team: 'A' }` | `null` | 非 `null` | 🔵 |
| TC-14-15 | `rallies` | `{ set_id: userBSetId, rally_number: 99, serving_team, server_position, server_player_id, receiver_player_id }` | `null` | 非 `null` | 🔵 |
| TC-14-16 | `shots` | `{ rally_id: userBRallyId, shot_number: 99 }` | `null` | 非 `null` | 🔵 |
| TC-14-17 | `position_overrides` | `{ rally_id: userBRallyId, team: 'A', override_type: 'swapped' }` | `null` | 非 `null` | 🔵 |
| TC-14-18 | `recording_gaps` | `{ set_id: userBSetId, ... }` | `null` | 非 `null` | 🔵 |

**代表例**: TC-14-12 `players` INSERT

- **テスト名**: 「User A は User B Group に `players` を INSERT できない」
  - **エラーケースの概要**: WITH CHECK ポリシー `is_member_of(group_id)` が false を返し、RLS で拒否される
  - **エラー処理の重要性**: 他 Group への spoof 行挿入を防ぐ
- **入力値**: `{ group_id: userBGroupId, name: 'spoof-player' }`
  - **不正な理由**: User A は `userBGroupId` の `group_members` に存在しない
  - **実際の発生シナリオ**: 攻撃者が API 経由で他 Group 名義のデータを混入させようとする
- **期待される結果**: `data === null`、`error !== null`（`PostgrestError`、`code: '42501'` または `new row violates row-level security policy` を含む）
  - **エラーメッセージの内容**: Supabase 標準。詳細コード照合はテスト保守性のため省略 🟡
  - **システムの安全性**: 物理行は挿入されず、エラーが返される
- **テストの目的**: `players` WITH CHECK ポリシーの回帰防止
  - **品質保証の観点**: テナント分離の最重要セキュリティ境界を CI で保証
- 🔵 信頼性レベル

### 5.2 TC-14-19〜21: RPC 経由必須テーブルへの直接 INSERT 拒否

> **エラーケースの概要**: スキーマレビュー ⑦ A-1 / A-2 / ⑧ B-12 で「`create_group_with_owner` / `generate_invitation_code` などの RPC 経由のみ許可」と決定されたテーブルへの直接 INSERT を試行
> **エラー処理の重要性**: Group 作成 + オーナー加入の原子化、招待コードの一貫性を担保

| TC-ID | テーブル | 入力 | 期待 `error` | 根拠 | 信頼性 |
|-------|---------|------|--------------|------|------|
| TC-14-19 | `groups` | `{ name: 'spoof-group' }` | 非 `null` | ⑦ A-1: RPC 経由のみ | 🔵 |
| TC-14-20 | `group_members` | `{ group_id: userBGroupId, user_id: userA.id }` | 非 `null` | ⑦ A-2: RPC 経由のみ | 🔵 |
| TC-14-21 | `group_invitations` | `{ group_id: userBGroupId, code: 'SPOOF12', created_by: userA.id, expires_at: <now+7d> }` | 非 `null` | ⑧ B-12: RPC 経由のみ | 🔵 |

**代表例**: TC-14-19 `groups` 直接 INSERT

- **テスト名**: 「User A は `groups` テーブルに直接 INSERT できない（RPC 経由のみ許可）」
  - **エラーケースの概要**: authenticated ロールに対する `groups` の INSERT ポリシーが false を返す
  - **エラー処理の重要性**: `create_group_with_owner` RPC 経由でないと group_members への自己加入が走らないため、Group の orphan 化を防ぐ
- **入力値**: `userAClient.from('groups').insert({ name: 'spoof-group' })`
  - **不正な理由**: スキーマレビュー ⑦ A-1: `groups` の直接 INSERT は禁止
  - **実際の発生シナリオ**: フロントが RPC を経由せず直接 INSERT を試みた場合
- **期待される結果**: `error !== null`
  - **システムの安全性**: orphan Group が生成されない
- **テストの目的**: 直接 INSERT ポリシーの回帰防止
- 🔵 信頼性レベル

### 5.3 TC-14-22〜28: 他テナント UPDATE 影響行数 0（EDGE-003 派生）

> **エラーケースの概要**: User A が User B Group の既存行を UPDATE 試行
> **エラー処理の重要性**: Supabase RLS では UPDATE は空集合に走るため、エラーではなく `data === []` が返る（EDGE-003 派生）

| TC-ID | テーブル | 入力 | 期待 `(data ?? [])` | 期待 `error` | 信頼性 |
|-------|---------|------|---------------------|--------------|------|
| TC-14-22 | `players` | `.update({ name: 'hacked' }).eq('id', userBPlayerId).select()` | `[]` | `null` | 🔵 |
| TC-14-23 | `matches` | `.update({ video_source_url: 'evil' }).eq('id', userBMatchId).select()` | `[]` | `null` | 🔵 |
| TC-14-24 | `sets` | `.update({ winner: 'A' }).eq('id', userBSetId).select()` | `[]` | `null` | 🔵 |
| TC-14-25 | `rallies` | `.update({ is_let: true }).eq('id', userBRallyId).select()` | `[]` | `null` | 🔵 |
| TC-14-26 | `shots` | `.update({ shot_number: 99 }).eq('id', userBShotId).select()` | `[]` | `null` | 🔵 |
| TC-14-27 | `position_overrides` | `.update({ team: 'B' }).eq('id', userBPositionOvId).select()` | `[]` | `null` | 🔵 |
| TC-14-28 | `recording_gaps` | `.update({...}).eq('id', userBRecordingGapId).select()` | `[]` | `null` | 🔵 |

**代表例**: TC-14-22 `players` UPDATE

- **テスト名**: 「User A は User B Group の `players` 行を UPDATE しても影響行数 0」
  - **エラーケースの概要**: USING ポリシー `is_member_of(group_id)` で行がフィルタアウトされ、UPDATE 対象 0 行
  - **エラー処理の重要性**: 他 Group データの改竄を防ぐ
- **入力値**: `{ name: 'hacked' }` を `userBPlayerId` に適用
  - **不正な理由**: User A は `userBGroupId` の `group_members` に存在しない
  - **実際の発生シナリオ**: 攻撃者が API 経由で他 Group 名義のデータを改竄しようとする
- **期待される結果**: `(data ?? []) === []`、`error === null`
  - **エラーメッセージの内容**: Supabase RLS UPDATE は error ではなく空集合
  - **システムの安全性**: 物理行は更新されない
- **テストの目的**: `players` USING ポリシーの回帰防止
- 🔵 信頼性レベル

---

## 6. テスト ID 一覧サマリ

| TC-ID | 種別 | 対象テーブル | 操作 | 期待結果 | 対応 EARS | 信頼性 |
|-------|------|------------|------|---------|-----------|------|
| TC-14-01 | boundary | groups | SELECT | `data === []` | REQ-101, EDGE-003, NFR-104 | 🔵 |
| TC-14-02 | boundary | group_members | SELECT | `data === []` | REQ-101, EDGE-003, NFR-104 | 🔵 |
| TC-14-03 | boundary | players | SELECT | `data === []` | REQ-101, EDGE-003, NFR-104 | 🔵 |
| TC-14-04 | boundary | matches | SELECT | `data === []` | REQ-101, EDGE-003, NFR-104 | 🔵 |
| TC-14-05 | boundary | sets | SELECT | `data === []` | REQ-101, EDGE-003, NFR-104 | 🔵 |
| TC-14-06 | boundary | set_player_positions | SELECT | `data === []` | REQ-101, EDGE-003, NFR-104 | 🔵 |
| TC-14-07 | boundary | rallies | SELECT | `data === []` | REQ-101, EDGE-003, NFR-104 | 🔵 |
| TC-14-08 | boundary | shots | SELECT | `data === []` | REQ-101, EDGE-003, NFR-104 | 🔵 |
| TC-14-09 | boundary | position_overrides | SELECT | `data === []` | REQ-101, EDGE-003, NFR-104 | 🔵 |
| TC-14-10 | boundary | recording_gaps | SELECT | `data === []` | REQ-101, EDGE-003, NFR-104 | 🔵 |
| TC-14-11 | boundary | group_invitations | SELECT | `data === []` | REQ-101, EDGE-003, NFR-104 | 🔵 |
| TC-14-12 | branch (異常系) | players | INSERT | `error !== null` | REQ-101 | 🔵 |
| TC-14-13 | branch (異常系) | matches | INSERT | `error !== null` | REQ-101 | 🔵 |
| TC-14-14 | branch (異常系) | sets | INSERT | `error !== null` | REQ-101 | 🔵 |
| TC-14-15 | branch (異常系) | rallies | INSERT | `error !== null` | REQ-101 | 🔵 |
| TC-14-16 | branch (異常系) | shots | INSERT | `error !== null` | REQ-101 | 🔵 |
| TC-14-17 | branch (異常系) | position_overrides | INSERT | `error !== null` | REQ-101 | 🔵 |
| TC-14-18 | branch (異常系) | recording_gaps | INSERT | `error !== null` | REQ-101 | 🔵 |
| TC-14-19 | branch (異常系) | groups | 直接 INSERT | `error !== null` | スキーマレビュー ⑦ A-1 | 🔵 |
| TC-14-20 | branch (異常系) | group_members | 直接 INSERT | `error !== null` | スキーマレビュー ⑦ A-2 | 🔵 |
| TC-14-21 | branch (異常系) | group_invitations | 直接 INSERT | `error !== null` | スキーマレビュー ⑧ B-12 | 🔵 |
| TC-14-22 | branch (異常系) | players | UPDATE | `(data ?? []) === []` | REQ-101, EDGE-003 派生 | 🔵 |
| TC-14-23 | branch (異常系) | matches | UPDATE | `(data ?? []) === []` | REQ-101, EDGE-003 派生 | 🔵 |
| TC-14-24 | branch (異常系) | sets | UPDATE | `(data ?? []) === []` | REQ-101, EDGE-003 派生 | 🔵 |
| TC-14-25 | branch (異常系) | rallies | UPDATE | `(data ?? []) === []` | REQ-101, EDGE-003 派生 | 🔵 |
| TC-14-26 | branch (異常系) | shots | UPDATE | `(data ?? []) === []` | REQ-101, EDGE-003 派生 | 🔵 |
| TC-14-27 | branch (異常系) | position_overrides | UPDATE | `(data ?? []) === []` | REQ-101, EDGE-003 派生 | 🔵 |
| TC-14-28 | branch (異常系) | recording_gaps | UPDATE | `(data ?? []) === []` | REQ-101, EDGE-003 派生 | 🔵 |
| TC-14-29 | boundary (異常系) | groups (代表) | 未認証 SELECT | `(data ?? []) === []` | REQ-201, NFR-104 | 🔵 |
| TC-14-30 | branch (異常系) | group_members | service_role で別 Group に既所属 User B を INSERT | `error.code === '23505'` | ADR-006 §決定 §DB 制約 | 🔵 |
| TC-14-31 | branch (異常系) | RPC `join_group_with_code` | 既所属 User A が他 Group の招待コードで呼び出し | `error.message.includes('already_in_group')` | ADR-006 §決定 §RPC ガード | 🔵 |

**合計**: **31 件**（boundary 12 + branch 19、ADR-006 追補 +2）

> **ADR-006 追補 (TASK-0018, 2026-05-24)**: 1 ユーザー = 1 Group 制約 (MVP) の構造的保証 (DB UNIQUE) と RPC 早期失敗ガードを TC-14-30/31 として追加。詳細は `docs/decisions/006-single-group-per-user-mvp.md` と `supabase/migrations/20260524150000_adr_006_single_group_per_user.sql` を参照。

---

## 7. 省略するケース（feedback_test_coverage に基づく redundant 回避）

| 省略対象 | 理由 | 信頼性 |
|---------|------|------|
| 自 Group へのアクセス成功確認 | TASK-0015 の RPC テストで実質検証される | 🔵 |
| DELETE 操作のテスト | REQ-402: MVP では DELETE API 未実装、RLS DELETE パスに到達しない | 🔵 |
| 複数行 SELECT | 1 行で同型動作を確認できる | 🔵 |
| `groups`/`group_members`/`group_invitations` の他テナント INSERT 試行（authenticated 経由） | 直接 INSERT が RPC 経由必須で先に拒否されるため、テナント越境とは別 branch。代表は TC-14-19〜21 で 1 ケース | 🔵 |
| 未認証 INSERT/UPDATE | anon ロールはそもそも GRANT がないため SELECT 1 ケース（TC-14-29）で代表確認 | 🟡 |
| RLS エラーコード詳細照合（`code === '42501'`） | テスト保守性優先。`error !== null` のみで十分 | 🟡 |
| 11 テーブル全てに対する未認証 SELECT | REQ-201 の代表 1 テーブル分で十分。全テーブルは redundant | 🔵 |

---

## 8. テスト実装時の日本語コメント指針（サンプル）

### テストケース開始時

```typescript
// 【テスト目的】: TC-14-03 - User A は User B Group の players 行を SELECT しても空集合が返ることを確認
// 【テスト内容】: userAClient.from('players').select('*').eq('id', userBPlayerId) を実行
// 【期待される動作】: data === []、error === null（RLS フィルタが他 Group をフィルタアウト）
// 🔵 信頼性レベル: REQ-101 + EDGE-003 + NFR-104 + マイグレーション DDL に基づく
```

### Given（準備フェーズ）

```typescript
// 【テストデータ準備】: beforeAll で User B Group 配下の players 行を service_role で投入済み
// 【初期条件設定】: User A は signInWithPassword 済み、userBPlayerId は実在する有効な UUID
// 【前提条件確認】: TASK-0013 globalSetup で User A/B が auth.users に存在
```

### When（実行フェーズ）

```typescript
// 【実際の処理実行】: userAClient で他 Group の row 取得を試行
// 【処理内容】: PostgREST SELECT に対して RLS USING ポリシー `is_member_of(group_id)` が走る
// 【実行タイミング】: beforeAll 完了後、各 it ブロック内で同期実行
const { data, error } = await userAClient.from('players').select('*').eq('id', userBPlayerId)
```

### Then（検証フェーズ）

```typescript
// 【結果検証】: RLS フィルタにより data が空配列、error は null
// 【期待値確認】: REQ-101（自 Group のみアクセス可）+ EDGE-003（他 Group SELECT は空集合）
// 【品質保証】: マルチテナント分離の最重要セキュリティ境界を CI で保証
expect(data).toEqual([])              // 【検証項目】: 他 Group 行は取得不可（空配列）🔵
expect(error).toBeNull()              // 【検証項目】: SELECT 自体はエラーではない（RLS は USING で行フィルタ）🔵
```

### セットアップ・クリーンアップ

```typescript
beforeAll(async () => {
  // 【テスト前準備】: User A/B の取得、User B 配下データの service_role 投入、User A サインイン
  // 【環境初期化】: dev プロジェクトに対する RLS 統合テストの全 fixture を構築
})

afterAll(async () => {
  // 【テスト後処理】: cleanupUserBData() で User B 配下の物理データを削除
  // 【状態復元】: 次回テスト実行時に orphan data が残らないよう service_role で明示削除
})
```

---

## 9. 要件定義との対応関係

| 参照項目 | 該当セクション | 採用テストケース |
|---------|---------------|----------------|
| 機能概要 | tdd-requirements.md § 1.1〜1.4 | 全 29 件（テスト群の存在意義） |
| 入出力仕様 | tdd-requirements.md § 2.1〜2.4 | TC-14-01〜29 すべて（操作 / 期待 data / error） |
| 制約条件 | tdd-requirements.md § 3.1〜3.5 | TC-14-19〜21（RPC 経由必須）、TC-14-29（anon 拒否） |
| 使用例 | tdd-requirements.md § 4.1〜4.4 | TC-14-01〜11（EDGE-003）、TC-14-12〜18（INSERT 拒否）、TC-14-22〜28（UPDATE 影響 0） |
| EARS REQ-101 | requirements.md | TC-14-01〜28 |
| EARS REQ-201 | requirements.md | TC-14-29 |
| EARS REQ-402 | requirements.md | DELETE 対象外として明示 |
| EARS REQ-403 | requirements.md | dev プロジェクト URL のみ使用（CI / .env.test） |
| EARS NFR-101 | requirements.md | service_role キーはシェル env のみ |
| EARS NFR-104 | requirements.md | TC-14-01〜11（11 テーブル全 SELECT カバー） |
| EARS EDGE-003 | requirements.md | TC-14-01〜11（SELECT 空集合）、TC-14-22〜28（UPDATE 影響 0） |

---

## 10. 信頼性レベルサマリー

| カテゴリ | 🔵 青信号 | 🟡 黄信号 | 🔴 赤信号 | 合計 |
|---------|---------|---------|---------|------|
| 全体方針 | 4 | 1 | 0 | 5 |
| 言語・FW 選定 | 1 | 0 | 0 | 1 |
| 事前条件 / セットアップ | 11 | 0 | 0 | 11 |
| TC-14-01〜11 (SELECT) | 11 | 0 | 0 | 11 |
| TC-14-12〜18 (INSERT) | 7 | 0 | 0 | 7 |
| TC-14-19〜21 (直接 INSERT) | 3 | 0 | 0 | 3 |
| TC-14-22〜28 (UPDATE) | 7 | 0 | 0 | 7 |
| TC-14-29 (anon) | 1 | 0 | 0 | 1 |
| 省略ケース理由 | 5 | 2 | 0 | 7 |
| **合計** | **50** | **3** | **0** | **53** |

**品質判定**: **高品質**（🔵 94%）。EARS 要件 / マイグレーション DDL / Supabase 公式 RLS 挙動 / TASK-0013 既存実装に基づき、推測なしで実装可能。黄信号は (1) エラーコード詳細照合の省略 (2) anon ロール INSERT/UPDATE 省略 (3) 全体方針のエラーコード照合に限定される。

---

## 11. 次フェーズ（tdd-red）への引き継ぎ

1. **テストファイル新規作成**: `tests/integration/rls.test.ts`
2. **失敗テスト 29 件作成**: TC-14-01〜29 を `describe`/`it` で実装
   - グルーピング案:
     - `describe('RLS SELECT: User A は User B Group のデータを取得できない', () => { /* TC-14-01〜11 */ })`
     - `describe('RLS INSERT: User A は User B Group に書き込めない', () => { /* TC-14-12〜18 */ })`
     - `describe('RLS INSERT 直接禁止: groups / group_members / group_invitations', () => { /* TC-14-19〜21 */ })`
     - `describe('RLS UPDATE: User A は User B Group の行を更新できない', () => { /* TC-14-22〜28 */ })`
     - `describe('RLS 未認証: anon は全テーブル拒否', () => { /* TC-14-29 */ })`
3. **ヘルパー関数（inline 実装、refactor で切り出し）**:
   - `createGroupForUserB(serviceClient, userBId): Promise<string>`
   - `createPlayer(serviceClient, groupId): Promise<string>`
   - `createMatch(serviceClient, groupId, playerIds): Promise<string>`
   - `createSet(serviceClient, matchId): Promise<string>`
   - `createSetPlayerPosition(serviceClient, setId, playerId): Promise<string>`
   - `createRally(serviceClient, setId, playerId): Promise<string>`
   - `createShot(serviceClient, rallyId): Promise<string>`
   - `createPositionOverride(serviceClient, rallyId): Promise<string>`
   - `createRecordingGap(serviceClient, setId): Promise<string>`
   - `createInvitation(serviceClient, groupId, createdBy): Promise<string>`
   - `cleanupUserBData(serviceClient, groupId): Promise<void>`
4. **環境変数**: `.env.test` + シェル env から `NUXT_SUPABASE_SECRET_KEY` を読み込み
5. **想定失敗状態**: RLS ポリシーが既存マイグレーションでカバー済みなら、tdd-red 直後に **すべて成功する可能性が高い**（実装は TASK-0006 で完了済み）。期待値と異なる挙動が出た場合は、マイグレーション側（`supabase/migrations/20260519060000_initial_schema.sql`）の不備としてバックフィードする。

---

## 12. 品質判定（自己評価）

| 観点 | 評価 | コメント |
|------|------|---------|
| テストケース分類 | 完全 | 境界値 12 + branch 17 で正常・異常を網羅 |
| 期待値定義 | 明確 | `data` / `error` を表形式で全件明記 |
| 技術選択 | 確定 | TypeScript + Vitest（既存基盤を継続利用） |
| 実装可能性 | 確実 | TASK-0013 で globalSetup 完備、本タスクは追加 1 ファイル |
| 信頼性レベル | 🔵 94% | EARS + DDL + 既存実装に基づきほぼ推測なし |

→ **判定: 高品質** / 次フェーズ `tdd-red` に進行可能。
