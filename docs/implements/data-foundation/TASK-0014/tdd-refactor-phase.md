# TDD Refactor フェーズ記録: TASK-0014 RLS 統合テスト

- **要件名**: data-foundation
- **タスク ID**: TASK-0014
- **機能名（英）**: rls-integration-test
- **作成日**: 2026-05-24
- **フェーズ**: Refactor（コード品質改善）

---

## Refactor フェーズの作業概要

Green フェーズで inline 実装したヘルパー関数を `tests/integration/helpers/rls-fixtures.ts` に切り出し、
テストファイルのサイズを 866 行 → 611 行に削減した。

---

## 実施したリファクタリング内容

### 1. ヘルパー関数の切り出し 🔵

**変更前**: 全 11 個のヘルパー関数が `tests/integration/rls.integration.test.ts` に inline 実装されていた
（// ヘルパー関数（inline 実装、refactor フェーズで切り出し）コメント付き）

**変更後**: 以下の関数を `tests/integration/helpers/rls-fixtures.ts` に移動した

| 関数名 | 役割 |
|--------|------|
| `createGroupForUserB` | User B 名義の Group + group_members を service_role で作成 |
| `createPlayer` | Player を service_role で作成 |
| `createMatch` | Match を service_role で作成（4 選手必要） |
| `createSet` | Set を service_role で作成 |
| `createSetPlayerPosition` | SetPlayerPosition を service_role で作成 |
| `createRally` | Rally を service_role で作成 |
| `createShot` | Shot を service_role で作成 |
| `createPositionOverride` | PositionOverride を service_role で作成 |
| `createRecordingGap` | RecordingGap を service_role で作成 |
| `createInvitation` | GroupInvitation を service_role で作成 |
| `cleanupUserBData` | User B 配下の全テストデータを FK 依存順に逆順削除 |

### 2. `cleanupUserBData` のネスト解消 🔵

**変更前**: 深くネストした Promise チェーンで FK 解決 + 削除を行っており、可読性が低かった

```typescript
// ネストが深い例（変更前）
await client.from('shots').delete().in(
  'rally_id',
  (await client.from('rallies').select('id').in(
    'set_id',
    (await client.from('sets').select('id').eq('match_id',
      (await client.from('matches').select('id').eq('group_id', groupId)).data?.map(r => r.id) ?? []
    )).data?.map(r => r.id) ?? []
  )).data?.map(r => r.id) ?? []
)
```

**変更後**: ID 配列を段階的に変数に展開し、各ステップを明示的に分割

```typescript
// 段階的な変数展開（変更後）
const { data: matchRows } = await client.from('matches').select('id').eq('group_id', groupId)
const matchIds = matchRows?.map((r: { id: string }) => r.id) ?? []

if (matchIds.length > 0) {
  const { data: setRows } = await client.from('sets').select('id').in('match_id', matchIds)
  const setIds = setRows?.map((r: { id: string }) => r.id) ?? []
  // ...
}
```

**改善効果**:
- 可読性: ネスト深度 4 → 2
- パフォーマンス: 空配列ガードにより不要な DB クエリを回避
- 型安全性: 中間変数に明示的な型注釈を付与

### 3. import 文の整理 🔵

**変更前**: `@supabase/supabase-js` から `createClient` と `type SupabaseClient` を同一ファイルで import し、ヘルパー関数内でも参照していた

**変更後**:
- `rls.integration.test.ts`: テスト本体に必要な関数のみ import + helpers から named import
- `rls-fixtures.ts`: `type SupabaseClient` を明示 import し、全関数の引数型として使用

---

## セキュリティレビュー結果

| 観点 | 評価 | 詳細 |
|------|------|------|
| service_role キー漏洩 | ✅ 問題なし | `.env.test` には書かない運用は変更なし |
| テストデータの分離 | ✅ 問題なし | afterAll の cleanupUserBData で確実に削除 |
| spoof INSERT の遮断確認 | ✅ 問題なし | TC-14-12〜21 でテスト済み |
| 招待コードの衝突 | ✅ 問題なし | ランダムサフィックスで UNIQUE 制約衝突を防止 |

---

## パフォーマンスレビュー結果

| 観点 | 評価 | 詳細 |
|------|------|------|
| cleanupUserBData の DB クエリ数 | 改善 | 空配列ガードにより不要なクエリを削減 |
| beforeAll の fixture 投入 | 変更なし | 14 クエリで 11 種データを投入（最小限） |
| テスト間の独立性 | 変更なし | afterAll での group 単位削除は設計通り |

---

## ファイルサイズ

| ファイル | 変更前 | 変更後 | 判定 |
|---------|--------|--------|------|
| `tests/integration/rls.integration.test.ts` | 866 行 | 611 行 | ✅ 500 行超（テスト 29 件で必要最小） |
| `tests/integration/helpers/rls-fixtures.ts` | 新規 | 341 行 | ✅ 500 行未満 |

> **注**: テストファイルは 611 行だが、29 件のテストケースの verbatim なアサーション記述が占めており、
> これ以上の圧縮は可読性 / トレーサビリティを損なうため許容範囲とする。

---

## lint / typecheck 結果

```
pnpm lint   → exit code: 0（エラーなし）
pnpm typecheck → エラーなし（Nuxt Icon 検出ログのみ）
```

---

## 品質評価

| 観点 | 評価 | コメント |
|------|------|---------|
| テスト構造 | ✅ | ヘルパー切り出し完了、テスト本体の見通しが改善 |
| セキュリティ | ✅ | 重大な脆弱性なし |
| パフォーマンス | ✅ | 不要クエリの回避を改善 |
| リファクタ目標 | ✅ | TASK-0014.md 実装手順 5 の切り出し完了 |
| コード品質 | ✅ | ESLint / typecheck ともにエラーなし |
| 過剰抽象化 | ✅ | assertion 共通化は行わず可読性優先 |

**判定: ✅ 高品質**

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `tests/integration/rls.integration.test.ts` | ヘルパー関数を削除し helpers/ から named import に変更（866 行 → 611 行） |
| `tests/integration/helpers/rls-fixtures.ts` | 新規作成（11 関数 + JSDoc コメント付き） |

---

## 次のステップ

`/tsumiki:tdd-verify-complete` で完全性検証を実行します。
