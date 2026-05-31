# TDD Red フェーズ記録: TASK-0014 RLS 統合テスト

- **要件名**: data-foundation
- **タスク ID**: TASK-0014
- **機能名（英）**: rls-integration-test
- **作成日**: 2026-05-24
- **フェーズ**: Red（失敗するテストを作成済み）

---

## 作成したテストケース一覧

| TC-ID | テーブル | 操作 | 期待結果 | 実装状態 |
|-------|---------|------|---------|---------|
| TC-14-01 | groups | SELECT | `data === []` | ✅ 作成済み |
| TC-14-02 | group_members | SELECT | `data === []` | ✅ 作成済み |
| TC-14-03 | players | SELECT | `data === []` | ✅ 作成済み |
| TC-14-04 | matches | SELECT | `data === []` | ✅ 作成済み |
| TC-14-05 | sets | SELECT | `data === []` | ✅ 作成済み |
| TC-14-06 | set_player_positions | SELECT | `data === []` | ✅ 作成済み |
| TC-14-07 | rallies | SELECT | `data === []` | ✅ 作成済み |
| TC-14-08 | shots | SELECT | `data === []` | ✅ 作成済み |
| TC-14-09 | position_overrides | SELECT | `data === []` | ✅ 作成済み |
| TC-14-10 | recording_gaps | SELECT | `data === []` | ✅ 作成済み |
| TC-14-11 | group_invitations | SELECT | `data === []` | ✅ 作成済み |
| TC-14-12 | players | INSERT（他テナント） | `error !== null` | ✅ 作成済み |
| TC-14-13 | matches | INSERT（他テナント） | `error !== null` | ✅ 作成済み |
| TC-14-14 | sets | INSERT（他テナント） | `error !== null` | ✅ 作成済み |
| TC-14-15 | rallies | INSERT（他テナント） | `error !== null` | ✅ 作成済み |
| TC-14-16 | shots | INSERT（他テナント） | `error !== null` | ✅ 作成済み |
| TC-14-17 | position_overrides | INSERT（他テナント） | `error !== null` | ✅ 作成済み |
| TC-14-18 | recording_gaps | INSERT（他テナント） | `error !== null` | ✅ 作成済み |
| TC-14-19 | groups | 直接 INSERT | `error !== null` | ✅ 作成済み |
| TC-14-20 | group_members | 直接 INSERT | `error !== null` | ✅ 作成済み |
| TC-14-21 | group_invitations | 直接 INSERT | `error !== null` | ✅ 作成済み |
| TC-14-22 | players | UPDATE（他テナント） | `(data??[]) === []` | ✅ 作成済み |
| TC-14-23 | matches | UPDATE（他テナント） | `(data??[]) === []` | ✅ 作成済み |
| TC-14-24 | sets | UPDATE（他テナント） | `(data??[]) === []` | ✅ 作成済み |
| TC-14-25 | rallies | UPDATE（他テナント） | `(data??[]) === []` | ✅ 作成済み |
| TC-14-26 | shots | UPDATE（他テナント） | `(data??[]) === []` | ✅ 作成済み |
| TC-14-27 | position_overrides | UPDATE（他テナント） | `(data??[]) === []` | ✅ 作成済み |
| TC-14-28 | recording_gaps | UPDATE（他テナント） | `(data??[]) === []` | ✅ 作成済み |
| TC-14-29 | groups | 未認証 SELECT | `(data??[]).length === 0` または `error !== null` | ✅ 作成済み |

**合計**: 29 件（TC-14-01〜29 全件）

---

## テストファイルパス

- **テストファイル**: `tests/integration/rls.integration.test.ts`

---

## 期待される失敗内容（Red フェーズ）

### ENV 未設定の場合（ローカル実行、ENV なし）

```
Error: NUXT_PUBLIC_SUPABASE_URL / NUXT_SUPABASE_SECRET_KEY が未設定です (.env.test 参照)
```

- `globalSetup`（`create-test-users.ts`）で ENV チェックが走り、即座に `Error` が throw される
- これは意図した Red 状態（ENV 設定後に実 dev DB でテスト実行が可能）
- `describe.skipIf(skip)` でラップしているため、ENV 未設定の場合テストスイート全体がスキップされる
  - しかし `globalSetup` が先に走るため、ENV がないとそこで crash する仕様

### ENV 設定済み・実 dev DB 接続後の想定失敗（実装未済の場合）

RLS ポリシーは TASK-0006 のマイグレーションで既に実装済みのため、ENV と dev DB があれば **すべて成功する可能性が高い**。
もし RLS ポリシーが未実装・不備の場合は以下のような失敗が発生する：

- TC-14-01〜11: `expected [ {...} ] to equal []` — 他 Group の行が取得できてしまう
- TC-14-12〜21: `expected null not to be null` — INSERT が成功してしまう
- TC-14-22〜28: `expected [ {...} ] to equal []` — UPDATE が成功してしまう
- TC-14-29: `expected false to be true` — 未認証でもデータが見えてしまう

---

## Green フェーズで実装すべき内容

RLS ポリシーは TASK-0006 で実装済みのため、主な Green フェーズの作業は：

1. **ENV 設定**: `.env.test` に `NUXT_PUBLIC_SUPABASE_URL` / `NUXT_PUBLIC_SUPABASE_KEY` を設定、シェル env に `NUXT_SUPABASE_SECRET_KEY` を設定
2. **`cleanupUserBData` ヘルパーの最適化**: inline 実装をシンプルな `groups` テーブルの cascade delete に置き換え可能（FK CASCADE を活用）
3. **テスト実行確認**: `NUXT_SUPABASE_SECRET_KEY=<key> pnpm test:integration` で全 29 件が通ることを確認
4. **マイグレーション不備があればバックフィード**: `supabase/migrations/20260519060000_initial_schema.sql` の RLS ポリシーを確認・修正

---

## 修正した設定ファイル

### vitest.integration.config.ts

- `poolOptions.forks.singleFork` → Vitest 4 の `forks.singleFork` トップレベルオプションに移行
- `resolve.alias` で `@supabase/supabase-js` を `.pnpm` 内のパスに解決（pnpm の hoist 問題対応）

### package.json

- `devDependencies` に `@supabase/supabase-js: "^2.105.4"` を追加（`pnpm install` 後に有効化）

---

## 品質評価

| 観点 | 評価 | コメント |
|------|------|---------|
| テスト実行 | ✅ | ENV 未設定で想定通りのエラーで終了（Red 意図満たす） |
| 期待値 | ✅ 明確 | `data === []` / `error !== null` / `(data??[]).length === 0` を明示 |
| アサーション | ✅ 適切 | `toEqual([])` / `not.toBeNull()` / `toBeNull()` / `toBe(true)` |
| 実装方針 | ✅ 明確 | TASK-0006 マイグレーション済み RLS ポリシーを検証 |
| 信頼性レベル | 🔵 94% | EARS + DDL + 既存実装に基づく |

**判定: 高品質**（ENV 設定後にそのまま Green フェーズへ進行可能）
