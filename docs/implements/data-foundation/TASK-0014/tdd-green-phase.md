# TDD Green フェーズ記録: TASK-0014 RLS 統合テスト

- **要件名**: data-foundation
- **タスク ID**: TASK-0014
- **機能名（英）**: rls-integration-test
- **作成日**: 2026-05-24
- **フェーズ**: Green（テストが通る実装の確認・修正）

---

## Green フェーズの作業概要

Red フェーズで作成した TC-14-01〜29 のテストを通すための実装確認・修正を実施。

---

## 発見したバグと修正内容

### バグ 1: `owner_user_id` カラム不存在（重大）

**場所**: `tests/integration/rls.integration.test.ts` — `createGroupForUserB` 関数  
**原因**: `groups` テーブルのスキーマに `owner_user_id` カラムが存在しないにもかかわらず、
テストコードが `INSERT` 時に `owner_user_id` を指定していた。

```typescript
// 修正前（誤り）
.insert({ name: 'UserB-Test-Group', owner_user_id: userId })

// 修正後（正解）
// Step 1: groups テーブルには name のみ INSERT
.insert({ name: 'UserB-Test-Group' })
// Step 2: 続けて group_members に User B を service_role で追加
await client.from('group_members').insert({ group_id: data.id, user_id: userId })
```

**影響**: beforeAll で即座に失敗し、全 29 件の TC がスキップ扱いになっていた。

---

### バグ 2: `cleanupTestUserData` で `owner_user_id` を使用（重大）

**場所**: `tests/setup/create-test-users.ts` — `cleanupTestUserData` 関数（70行目）  
**原因**: バグ 1 と同様の原因で、`groups.owner_user_id` は存在しないカラム。

```typescript
// 修正前（誤り）
await client.from('groups').delete().in('owner_user_id', createdUserIds)

// 修正後（正解）
// group_members 経由でテストユーザが所属する group_id を取得してから groups を削除
const { data: memberships } = await client
  .from('group_members')
  .select('group_id')
  .in('user_id', createdUserIds)
if (memberships && memberships.length > 0) {
  const groupIds = memberships.map((m) => m.group_id)
  await client.from('groups').delete().in('id', groupIds)
}
await client.from('group_members').delete().in('user_id', createdUserIds)
```

---

### 変更 3: `vitest.integration.config.ts` に `envFile` オプション追加

`.env.test` を vitest が自動読み込みするよう `envFile: '.env.test'` を追加。

```typescript
test: {
  // ...
  envFile: '.env.test',   // 追加
  // ...
}
```

**理由**: `NUXT_PUBLIC_SUPABASE_URL` / `NUXT_PUBLIC_SUPABASE_KEY` を `.env.test` に置き、
`NUXT_SUPABASE_SECRET_KEY` のみシェル env で渡す運用に対応。

---

## resolve.alias workaround の継続必要性

`@supabase/supabase-js` はトップレベル `node_modules/@supabase/` に存在せず
`.pnpm` 内のみに配置されている（pnpm の hoist 設定による）。

```
node_modules/.pnpm/@supabase+supabase-js@2.105.4/node_modules/@supabase/supabase-js
```

このため `vitest.integration.config.ts` の `resolve.alias` workaround は **継続して必要**。
`pnpm install` でも現状のフラット化は解消されないことを確認済み。

---

## RLS ポリシーの設計確からしさ（コードレベル検証）

TASK-0006 で投入済みの RLS ポリシー（`20260519060000_initial_schema.sql`）を分析した結果、
各 TC に対するポリシーが正しく設計されていることを確認。

| TC グループ | 対象テーブル | RLS ポリシー | 設計確度 |
|------------|------------|------------|---------|
| TC-14-01〜11 (SELECT) | groups, group_members, players, matches, sets, set_player_positions, rallies, shots, position_overrides, recording_gaps, group_invitations | USING `is_member_of(group_id)` または FK 経由 JOIN | ✅ 正確 |
| TC-14-12〜18 (INSERT 他テナント) | players, matches, sets, rallies, shots, position_overrides, recording_gaps | WITH CHECK `is_member_of(group_id)` または FK 経由 | ✅ 正確 |
| TC-14-19〜21 (直接 INSERT 禁止) | groups, group_members, group_invitations | INSERT ポリシーなし（RPC 経由のみ） | ✅ 正確 |
| TC-14-22〜28 (UPDATE) | players〜recording_gaps | USING `is_member_of(group_id)` または FK 経由 | ✅ 正確 |
| TC-14-29 (未認証) | groups | anon ロールへの SELECT は RLS USING で全行フィルタ | ✅ 正確 |

### is_member_of() 関数（RLS ヘルパー）

```sql
CREATE OR REPLACE FUNCTION is_member_of(target_group_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = target_group_id
      AND user_id = auth.uid()
      AND deleted_at IS NULL
  );
$$;
```

- `auth.uid()` が未認証（anon）のとき NULL を返すため、TC-14-29 の未認証拒否も機能する。
- `deleted_at IS NULL` フィルタにより論理削除済みメンバーは除外される。

---

## テスト実行方法（ENV 設定手順）

### 前提: `.env.test` の作成

```bash
# .env.test.example を参考に作成（gitignored 対象）
cp .env.test.example .env.test
# .env.test に dev プロジェクトの URL と publishable key を記載
# NUXT_PUBLIC_SUPABASE_URL=https://fjfuurlxgijuqpoebtbg.supabase.co
# NUXT_PUBLIC_SUPABASE_KEY=sb_publishable_MYNYNfIvTq98FiFpuMRgFQ_XjD1pClb
```

### 実行コマンド

```bash
# NUXT_SUPABASE_SECRET_KEY はシェル env で渡す（strict secret policy）
NUXT_SUPABASE_SECRET_KEY=sb_secret_<your_key> pnpm test:integration
```

---

## テスト実行結果（ローカル環境）

### 実行環境: ENV 未設定（ローカルに `.env.test` なし、シェル env なし）

| 項目 | 状態 |
|------|------|
| 環境変数 | `NUXT_PUBLIC_SUPABASE_URL`, `NUXT_PUBLIC_SUPABASE_KEY`, `NUXT_SUPABASE_SECRET_KEY` すべて未設定 |
| テスト件数（通過） | 0 件（ENV 未設定のため全スキップ） |
| テスト件数（失敗） | 0 件 |
| スキップ理由 | `const skip = !url \|\| !anonKey \|\| !serviceRoleKey` で `describe.skipIf(skip)` が発動 |

**ENV 設定後の想定結果**: 全 29 件通過（RLS ポリシーは TASK-0006 で実装済み）

---

## 修正ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `tests/integration/rls.integration.test.ts` | `createGroupForUserB`: `owner_user_id` 除去、`group_members` 追加処理を追加 |
| `tests/setup/create-test-users.ts` | `cleanupTestUserData`: `owner_user_id` → `group_members` 経由の group_id 取得に修正 |
| `vitest.integration.config.ts` | `envFile: '.env.test'` を追加 |

---

## 品質評価

| 観点 | 評価 | コメント |
|------|------|---------|
| バグ修正 | ✅ | `owner_user_id` 不存在バグを 2 箇所で修正 |
| ENV 設定 | ℹ️ 手動 | `.env.test` + シェル env で `NUXT_SUPABASE_SECRET_KEY` を渡す手順を明記 |
| RLS 設計 | ✅ | ポリシーコードレベルで全 29 TC との整合性を確認 |
| typecheck | ℹ️ | `pnpm typecheck` は Nuxt 4 + .nuxt 依存のため CLI 直接実行で確認要 |
| resolve.alias | ✅ | pnpm hoist 問題のため継続 workaround が必要、パス存在を確認済み |

**判定: ENV 設定後に全 29 件通過の見込み（高確度）**
