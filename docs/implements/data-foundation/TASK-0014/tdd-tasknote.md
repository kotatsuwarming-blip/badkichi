# TDD タスクノート: TASK-0014 RLS 統合テスト

**作成日**: 2026-05-24  
**タスク**: TASK-0014（RLS 統合テスト）  
**要件名**: data-foundation

---

## 1. 技術スタック

### 使用技術・フレームワーク

- **言語**: TypeScript (strict mode)
- **テストフレームワーク**: Vitest
- **テスト対象**: Supabase RLS ポリシー（PostgreSQL）
- **テストクライアント**: @supabase/supabase-js
- **テストユーザ管理**: Supabase Admin API (`service_role` キー経由)
- **テスト環境**: Supabase Cloud dev プロジェクト（実プロジェクト）

### アーキテクチャパターン

- **マルチテナント RLS パターン**: 全テーブルに Group 単位のアクセス制御を適用
- **RLS ヘルパー関数**: `is_member_of(target_group_id)` で「ログイン中ユーザーが group_members に存在するか」を判定
- **テスト戦略**: 複数認証ユーザ（User A / User B）のクロステスト
  - User B のデータを service_role で事前投入
  - User A としてアクセス試行し、空集合 or 拒否されることを確認
- **テストデータライフサイクル**: globalSetup で User A/B を 1 度作成 → 各 afterEach で groups/group_members を cleanup → globalTeardown で user 削除

### 参照元

- docs/design/data-foundation/architecture.md
- docs/spec/data-foundation/requirements.md
- docs/spec/data-foundation/note.md

---

## 2. 開発ルール

### プロジェクト固有のルール

- **TDD 適用対象**: RLS ポリシーの統合テスト。DDL（マイグレーション）は既存 (TASK-0006) でカバー
- **テストレイヤー分離**: 
  - `tests/integration/**/*.integration.test.ts` = Supabase 実プロジェクト依存
  - テスト環境: dev プロジェクトのみ（REQ-009 + REQ-403）
- **テストユーザ作成方針** (B3 確定方針, 2026-05-13):
  - vitest の `globalSetup` で User A / User B を **1 度だけ作成**
  - 各テスト内の `afterEach` で `cleanupTestUserData()` を呼び出し、group / group_members データを削除
  - auth.users 自体は削除しない（globalTeardown の teardownTestUsers() で一括削除）
  - pytest の session-scoped fixture 相当の構造
- **service_role キーの取り扱い** (NFR-101):
  - `.env.test` には書かない
  - ローカル: `NUXT_SUPABASE_SECRET_KEY=sb_secret_xxx pnpm test:integration` で渡す
  - CI: GitHub Actions Secrets から注入
- **ファイルパス**: プロジェクトルート相対パスで記載（絶対パス不可）

### コーディング規約

- Vue SFC + TypeScript strict mode
- ESLint: 1tbs brace style, no comma dangle
- Zod バリデーション（適用範囲は後続 UI 単位で）

### 注意事項

- **EDGE-003 の挙動**: Supabase RLS では他 Group の行に対する SELECT は空集合、INSERT は `42501 new row violates row-level security policy` エラー、UPDATE は影響行数 0
- **groups テーブルの INSERT**: RPC 経由 (`create_group_with_owner`) のみ許可。直接 INSERT は RLS で拒否
- **group_members / group_invitations の INSERT**: RPC 経由のみ。直接 INSERT は拒否
- **DELETE 操作**: MVP では削除機能未実装 (REQ-402)。RLS DELETE パスは到達しないため、テストの対象外
- **テスト並列実行**: vitest デフォルトはファイル並列。複数 RLS テストファイルを並列実行する場合は、各テストが独立した User B を持つか、テストユーザを分ける必要あり（現在は `vitest.integration.config.ts` で `singleFork: true` で単一フォーク実行）

---

## 3. 関連実装

### 類似機能・参考パターン

- **TASK-0013 実装**: tests/setup/create-test-users.ts
  - `setupTestUsers()`: User A / User B を Admin API で作成
  - `teardownTestUsers()`: auth.users から削除
  - `cleanupTestUserData()`: groups / group_members を service_role で削除（afterEach 用）
  - `getCurrentTestUsers()`: globalSetup で作成した User A/B を取得

### テスト基盤

- テストユーザ管理: tests/setup/create-test-users.ts（TASK-0013 で実装済み）
  - export `TestUser` インターフェース: `{ id: string, email: string, password: string }`
  - export `setupTestUsers()`: globalSetup から呼ばれる
  - export `teardownTestUsers()`: globalTeardown から呼ばれる
  - export `cleanupTestUserData()`: 各テストの afterEach から呼ばれる
  - export `getCurrentTestUsers()`: テスト内で User A/B を取得
- vitest 設定: vitest.integration.config.ts（TASK-0013 で実装済み）
  - `globalSetup: ['./tests/setup/create-test-users.ts']`
  - `testTimeout: 30_000`
  - `pool: 'forks'` + `singleFork: true`（単一フォーク実行で state 共有）

### 参照元

- tests/setup/create-test-users.ts
- tests/integration/setup/create-test-users.integration.test.ts（TASK-0013 テスト）
- vitest.integration.config.ts

---

## 4. 設計文書

### アーキテクチャ・API 仕様

#### 全テーブル一覧（11 テーブル）

| テーブル | group_id 保持 | FK 経路 | 用途 |
|---------|:---:|:---|------|
| groups | - | (自身が Group) | グループマスタ |
| group_members | ✅ | - | ユーザー所属 |
| group_invitations | ✅ | - | 招待コード |
| players | ✅ | - | 選手マスタ |
| matches | ✅ | - | 試合マスタ |
| sets | - | → matches.group_id | セット |
| set_player_positions | - | → sets → matches → group_id | 初期立ち位置 |
| rallies | - | → sets → matches → group_id | ラリー |
| shots | - | → rallies → sets → matches → group_id | ショット |
| position_overrides | - | → rallies → sets → matches → group_id | 左右入替記録 |
| recording_gaps | - | → sets → matches → group_id | 動画断絶イベント |

#### RLS 設計

- **ヘルパー関数**: `is_member_of(target_group_id uuid) RETURNS boolean`
  - SQL: `SELECT EXISTS (SELECT 1 FROM group_members WHERE group_id = target_group_id AND user_id = auth.uid() AND deleted_at IS NULL)`
  - 各テーブルの SELECT / INSERT / UPDATE ポリシーで使用
- **group_id を間接保持するテーブル** (sets, rallies, shots 等):
  - FK 経路を辿って group_id を解決する SQL をポリシー内に記述
  - 例: `rallies` → `rallies.set_id` → `sets.match_id` → `matches.group_id`

#### RPC 関数

- `create_group_with_owner(group_name)`: Group 作成 + 自己加入を原子化（直接 INSERT は拒否）
- `generate_invitation_code(group_id)`: 招待コード発行
- `join_group_with_code(code)`: 招待コード参加

### データベーススキーマ

- **スキーマ定義**: docs/design/data-foundation/database-schema.sql
- **マイグレーション**: supabase/migrations/20260519060000_initial_schema.sql
  - 全テーブル + RLS ポリシー + RPC 関数を含む
  - TASK-0006 で投入済み
- **全テーブルに共通カラム**:
  - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
  - `created_at timestamptz DEFAULT now()`
  - `updated_at timestamptz DEFAULT now()`（UPDATE トリガーで自動更新）
  - `deleted_at timestamptz` （MVP では常に NULL）

### API エンドポイント

- **PostgREST API**: `supabase.from('<table>').select/insert/update()`
- **RPC API**: `supabase.rpc('<func_name>', args)`
- **Auth API**: `supabase.auth.signInWithPassword()` / `signOut()` / `getUser()`

### 参照元

- docs/design/data-foundation/architecture.md
- docs/design/data-foundation/database-schema.sql
- docs/design/data-foundation/api-endpoints.md
- docs/spec/data-foundation/requirements.md
- supabase/migrations/20260519060000_initial_schema.sql

---

## 5. テスト関連情報

### テストフレームワーク・設定

- **フレームワーク**: Vitest 1.x
- **実行コマンド**: `pnpm test:integration` (vitest.integration.config.ts で設定)
- **設定ファイル**: vitest.integration.config.ts
  - `include: ['tests/integration/**/*.integration.test.ts']`
  - `globalSetup: ['./tests/setup/create-test-users.ts']`
  - `testTimeout: 30_000`
  - `pool: 'forks'` + `singleFork: true`

### テストディレクトリ構成

```
tests/
├── setup/
│   ├── create-test-users.ts          ← Supabase Admin API でテストユーザを管理 (TASK-0013)
│   └── __tests__/
│       └── create-test-users.test.ts ← create-test-users のテスト (TASK-0013)
└── integration/
    ├── setup/
    │   └── create-test-users.integration.test.ts  ← create-test-users の統合テスト (TASK-0013)
    └── rls.test.ts                  ← 🆕 RLS 統合テスト (TASK-0014)
```

### テストユーティリティ・ヘルパー関数

- **create-test-users.ts で提供**:
  - `setupTestUsers()`: User A / User B を作成（globalSetup で 1 度実行）
  - `teardownTestUsers()`: auth.users から削除（globalTeardown で実行）
  - `cleanupTestUserData()`: groups / group_members を削除（各 afterEach で実行）
  - `getCurrentTestUsers()`: globalSetup で作成した User A/B を取得
  - `TestUser` 型: `{ id: string, email: string, password: string }`

- **TASK-0014 で実装予定のヘルパー**:
  - `createGroupForUserB(client, userId)`: User B 名義で Group を作成
  - `createPlayer(client, groupId)`: Player を作成
  - `createMatch(client, groupId)`: Match を作成
  - `createSet(client, matchId)`: Set を作成
  - `createRally(client, setId)`: Rally を作成
  - `createShot(client, rallyId)`: Shot を作成
  - `cleanupUserBData(client, groupId)`: User B のテストデータを削除
  - （詳細は tdd-green フェーズで設計・実装）

### テストの命名パターン・慣例

- ファイル名: `*.integration.test.ts`（`vitest.integration.config.ts` の `include` パターンで自動検出）
- テストスイート: `describe('機能名: テスト内容', () => { ... })`
- テストケース: `it('条件 / 操作 / 期待結果', async () => { ... })`
- 例:
  - `describe('RLS SELECT: User A は User B Group のデータを取得できない', ...)`
  - `it('groups: 空集合', ...)`

### 環境変数・設定

- **.env.test** (ローカル開発、gitignore):
  - `NUXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co`
  - `NUXT_PUBLIC_SUPABASE_KEY=sb_publishable_xxx...`
  - `TEST_USER_A_EMAIL=test-a@example.com`
  - `TEST_USER_B_EMAIL=test-b@example.com`
  - ⚠️ `NUXT_SUPABASE_SECRET_KEY` は書かない（シェル env で渡す）

- **シェル環境**:
  - ローカル実行: `NUXT_SUPABASE_SECRET_KEY=sb_secret_xxx pnpm test:integration`
  - CI: GitHub Actions Secrets から注入

### 参照元

- vitest.integration.config.ts
- tests/setup/create-test-users.ts
- .env.test.example

---

## 6. 注意事項

### 技術的制約

- **Supabase Cloud dev プロジェクト依存**: ローカル Supabase (Docker) は使わない (REQ-403)
- **本プロジェクト接続**: テストは実 dev プロジェクトに書き込みを行うため、prd プロジェクトには接続しないこと
- **アクセス権**: service_role キーで実行されるため、全テーブルへの書き込み可能。test:integration は dev のみ許可

### セキュリティ・パフォーマンス要件

- **service_role キーの非漏洩**: `.env.test` には書かない、ログにマスクされていることを確認 (NFR-101)
- **テスト並列実行時注意**: 複数ファイルを同時実行すると User B の Group ID がコンフリクトする可能性
  - 対策: `vitest.integration.config.ts` で `singleFork: true` に設定（現在実装済み）
  - 複数テストファイルに分ける場合は、各ファイルで異なる User B を用意するか、テストユーザを分ける
- **テスト実行時間**: globalSetup でユーザ作成に数秒、各テストケースは <100ms 想定

### テストの安定性・メンテナンス

- **globalTeardown の確実な実行**: テスト失敗時に globalTeardown が走らない可能性あり
  - 対策: CI ジョブ末尾の `finally` で cleanup スクリプトを呼ぶ検討 (黄信号, 🟡)
- **テストデータの cleanup**: User B が削除されたタイミングで CASCADE で消えるはずだが、念のため `afterAll` で service_role 明示削除を行う
- **EDGE-003 の確認**: RLS 動作が Supabase 標準に従っていることを毎テストで確認（SELECT 空集合、INSERT 拒否、UPDATE 影響行数 0）

### 要件への対応

- **REQ-101**: 認証ユーザは自 Group のみアクセス可 → SELECT / INSERT / UPDATE テスト
- **REQ-201**: 未認証は全テーブル拒否 → anon ロール SELECT テスト (1 テーブル分)
- **NFR-104**: 全テーブル RLS 有効化 → 11 テーブル全て SELECT テスト
- **EDGE-003**: 他 Group SELECT は空集合 → UPDATE 影響行数 0 テスト

### 参考資料

- docs/spec/data-foundation/requirements.md § 関連要件 (REQ-101, REQ-201, NFR-104, EDGE-003)
- docs/tasks/data-foundation/TASK-0013.md § 注意事項（testユーザ作成戦略）
- docs/tasks/data-foundation/TASK-0014.md § 実装詳細・注意事項

---

## 7. 完了条件チェックリスト（参考）

このタスク完了時に満たすべき条件:

- [ ] `tests/integration/rls.test.ts` が存在し、以下の構造を持つ
  - [ ] `beforeAll`: setupTestUsers() で User A/B を取得、service_role で User B のテストデータを投入
  - [ ] `beforeAll`: User A でログイン (signInWithPassword)
  - [ ] `afterAll`: service_role で User B のテストデータを削除
- [ ] 11 テーブル全てについて「User A が User B Group の行を SELECT しても空集合」テスト (TC-14-01〜11)
- [ ] 主要テーブル（groups, players, matches, sets, rallies, shots, position_overrides, recording_gaps）について「User A が User B Group に INSERT 試行 → 拒否」テスト (TC-14-12〜18)
- [ ] group_members / group_invitations について「直接 INSERT 拒否」テスト (TC-14-20, 21)
- [ ] 主要テーブルについて「User A が User B Group の既存行を UPDATE 試行 → 影響行数 0」テスト (TC-14-22〜28)
- [ ] 未認証アクセス（REQ-201）テスト (TC-14-29)
- [ ] `pnpm test:integration` で全テスト通過
- [ ] `pnpm typecheck` でエラーなし

---

## 関連ファイル（相対パス）

- docs/spec/data-foundation/note.md
- docs/spec/data-foundation/requirements.md
- docs/design/data-foundation/architecture.md
- docs/design/data-foundation/database-schema.sql
- docs/design/data-foundation/api-endpoints.md
- docs/tasks/data-foundation/TASK-0013.md
- docs/tasks/data-foundation/TASK-0014.md
- tests/setup/create-test-users.ts
- vitest.integration.config.ts
- supabase/migrations/20260519060000_initial_schema.sql
