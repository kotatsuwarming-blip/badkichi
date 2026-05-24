# TDD 開発メモ: rls-integration-test

## 概要

- **機能名**: RLS 統合テスト (rls-integration-test)
- **開発開始**: 2026-05-24
- **現在のフェーズ**: Refactor 完了

## 関連ファイル

- 元タスクファイル: `docs/tasks/data-foundation/TASK-0014.md`
- 要件定義: `docs/implements/data-foundation/TASK-0014/tdd-requirements.md`
- テストケース定義: `docs/implements/data-foundation/TASK-0014/tdd-testcases.md`
- タスクノート: `docs/implements/data-foundation/TASK-0014/tdd-tasknote.md`
- 実装ファイル: `supabase/migrations/20260519060000_initial_schema.sql`（RLS ポリシー定義）
- テストファイル: `tests/integration/rls.integration.test.ts`
- テスト基盤: `tests/setup/create-test-users.ts`

## Red フェーズ（失敗するテスト作成）

### 作成日時

2026-05-24

### テストケース概要

TC-14-01〜29 の全 29 件を `tests/integration/rls.integration.test.ts` に実装した。

- **TC-14-01〜11** (11 件): 11 テーブル全ての SELECT 境界値テスト — User A が User B Group のデータを SELECT しても空集合
- **TC-14-12〜18** (7 件): 他テナント INSERT 拒否テスト — User A が User B Group に書き込み試行でエラー
- **TC-14-19〜21** (3 件): 直接 INSERT 禁止テスト — groups / group_members / group_invitations は RPC 経由のみ
- **TC-14-22〜28** (7 件): 他テナント UPDATE 影響行数 0 テスト — User A が User B Group の行を UPDATE しても影響なし
- **TC-14-29** (1 件): 未認証アクセス拒否テスト — anon クライアントからの SELECT で空集合または error

### グルーピング構造

```
describe('RLS 統合テスト: TASK-0014', () => {
  describe('RLS SELECT: User A は User B Group のデータを取得できない', () => { /* TC-14-01〜11 */ })
  describe('RLS INSERT: User A は User B Group に書き込めない', () => { /* TC-14-12〜18 */ })
  describe('RLS INSERT 直接禁止: groups / group_members / group_invitations', () => { /* TC-14-19〜21 */ })
  describe('RLS UPDATE: User A は User B Group の行を更新できない', () => { /* TC-14-22〜28 */ })
  describe('RLS 未認証: anon は全テーブル拒否', () => { /* TC-14-29 */ })
})
```

### inline ヘルパー関数

テストファイルに以下のヘルパーを inline 実装した（Refactor フェーズで切り出し予定）:

- `createGroupForUserB(client, userId)` — groups 作成
- `createPlayer(client, groupId)` — players 作成
- `createMatch(client, groupId, playerIds[4])` — matches 作成（4 選手必要）
- `createSet(client, matchId)` — sets 作成
- `createSetPlayerPosition(client, setId, playerId)` — set_player_positions 作成
- `createRally(client, setId, playerId)` — rallies 作成
- `createShot(client, rallyId)` — shots 作成
- `createPositionOverride(client, rallyId)` — position_overrides 作成
- `createRecordingGap(client, setId)` — recording_gaps 作成
- `createInvitation(client, groupId, createdBy)` — group_invitations 作成
- `cleanupUserBData(client, groupId)` — User B 配下データを FK 逆順で削除

### 期待される失敗（Red フェーズ現在）

**ENV 未設定時（現在のローカル実行）**:
```
Error: NUXT_PUBLIC_SUPABASE_URL / NUXT_SUPABASE_SECRET_KEY が未設定です
```
→ globalSetup でクラッシュ。Red フェーズの意図を満たしている。

**ENV 設定・実 DB 接続時**:
RLS ポリシーは TASK-0006 で実装済みのため、全 29 件が通る見込み（Green に直行できる可能性大）。

### 次のフェーズへの要求事項

**Green フェーズ**:
1. `.env.test` に `NUXT_PUBLIC_SUPABASE_URL` / `NUXT_PUBLIC_SUPABASE_KEY` を設定
2. シェル env で `NUXT_SUPABASE_SECRET_KEY=<sb_secret_xxx>` を設定
3. `pnpm install` を実行（`@supabase/supabase-js` を devDependencies に追加済み）
4. `pnpm test:integration` を実行し全 29 件が通ることを確認
5. 失敗ケースがあれば `supabase/migrations/20260519060000_initial_schema.sql` の RLS ポリシーをバックフィード

**Refactor フェーズ**:
1. `cleanupUserBData` の簡素化（groups 削除で CASCADE が利くなら 1 クエリ化）
2. ヘルパー関数を `tests/integration/helpers/` に切り出し
3. `vitest.integration.config.ts` の `resolve.alias` を `pnpm install` 後に削除（不要になる）

## Green フェーズ（最小実装）

2026-05-24 完了。詳細は `tdd-green-phase.md` 参照。

主な修正:
- `createGroupForUserB` の `owner_user_id` 不存在バグを修正
- `cleanupTestUserData` の `owner_user_id` 参照を group_members 経由に修正
- `vitest.integration.config.ts` に `envFile: '.env.test'` を追加

## Refactor フェーズ（品質改善）

2026-05-24 完了。詳細は `tdd-refactor-phase.md` 参照。

### 主な改善内容

1. **ヘルパー関数の切り出し**: 11 個の inline 関数を `tests/integration/helpers/rls-fixtures.ts` に移動
2. **`cleanupUserBData` のネスト解消**: 深さ 4 のネストを段階的な変数展開（深さ 2）に整理
3. **import 文の整理**: `type SupabaseClient` を各ファイルで適切に import

### ファイルサイズ変化

| ファイル | Before | After |
|---------|--------|-------|
| `tests/integration/rls.integration.test.ts` | 866 行 | 611 行 |
| `tests/integration/helpers/rls-fixtures.ts` | (新規) | 341 行 |

### lint / typecheck

```
pnpm lint    → exit code: 0
pnpm typecheck → エラーなし
```
