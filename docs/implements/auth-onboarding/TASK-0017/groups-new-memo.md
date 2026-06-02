# TDD開発メモ: groups-new

## 概要

- 機能名: groups-new (Group 作成画面 `/groups/new`)
- 開発開始: 2026-06-01
- 現在のフェーズ: **verify-complete 完了 (2026-06-01)**

## 🎯 最終結果 (2026-06-01)
- **実装率**: 依存層8テストケース全通過 / page新規テスト0件(NFR-301による意図的判断)
- **品質判定**: ✅ 合格 (高品質)
- **pnpm typecheck**: ✅ PASS
- **pnpm lint**: ✅ PASS (exit code 0)
- **pnpm test --run**: ✅ PASS (20 test files, 76 tests GREEN)
- **TODO更新**: ✅ TASK-0017.md 完了マーク追加

## 関連ファイル

- 元タスクファイル: `docs/tasks/auth-onboarding/TASK-0017.md`
- 要件定義: `docs/implements/auth-onboarding/TASK-0017/groups-new-requirements.md`
- テストケース定義: `docs/implements/auth-onboarding/TASK-0017/groups-new-testcases.md`
- Red フェーズ記録: `docs/implements/auth-onboarding/TASK-0017/groups-new-red-phase.md`
- 実装ファイル: `app/pages/groups/new.vue` (未実装、Green フェーズで作成)
- テストファイル: 新規作成なし（依存層の既存テストを再確認のみ）

## Redフェーズ（失敗するテスト作成）

### 作成日時

2026-06-01

### テストケース

**新規テスト 0 件**（意図的）

理由:
- `app/pages/groups/new.vue` は結線のみを持つ presentation 層 (NFR-301)
- フォーム検証 (Zod): `tests/unit/schemas/group-name.test.ts` 検証済 (TASK-0006)
- create / fieldErrors / pending 制御: `tests/unit/composables/useCreateGroup.test.ts` 検証済 (TASK-0010)
- navigateTo 分岐: 自明な結線、同型パターン依存層実証済、基盤コスト過大、E2E 担保 (TASK-0020) の 4 点から不要
- 通し動作: TASK-0020 (E2E / NFR-302) に委譲

### 依存層テスト緑確認結果

```
コマンド: pnpm vitest run tests/unit/schemas/group-name.test.ts tests/unit/composables/useCreateGroup.test.ts

 Test Files  2 passed (2)
       Tests  8 passed (8)
    Duration  183ms
```

✅ 全 8 テスト GREEN

### 期待される失敗

新規失敗テストなし。依存層テストはすべて GREEN。

### 次のフェーズへの要求事項

**Green フェーズ (tdd-green) で実装すること**:

1. `app/pages/groups/new.vue` を新規作成
2. `<script setup lang="ts">` で以下を結線:
   - `groupNameSchema` (`app/schemas/group-name.ts`) import
   - `useCreateGroup()` から `{ create, pending, fieldErrors }` 取得
   - `useI18n().t()` で文言を locale から取得 (NFR-204)
   - `form` reactive object を `reactive({ name: '' })` で定義
   - `onSubmit` 関数: `create(form.name)` → 成功 `navigateTo('/')` / 失敗 fieldErrors 表示
3. `<template>` で以下を構成:
   - `<UForm :schema="groupNameSchema" @submit="onSubmit">`
   - `<UFormField name="name" :label="t('...')" :error="fieldErrors['name']">`
   - `<UInput v-model="form.name" />`
   - `<UButton type="submit" :loading="pending" :disabled="pending">{{ t('...') }}</UButton>`
4. `definePageMeta` は不要（default.vue 自動継承、ADR-011 D1）
5. page 内に context 文字列を書かない (error-handling.md §5.5)
6. `INVALID_GROUP_NAME` は `app/types/error-codes.ts` から import（ただし page では使わない、composable 内に閉じる）

## Greenフェーズ（最小実装）

### 実施日時

2026-06-01

### 実装ファイル

- `app/pages/groups/new.vue` (新規作成)

### 実装方針

- Nuxt UI v4 の `<UForm>` は `FormSchema<I extends object>` を必要とするため、`groupNameSchema` (z.string()) を直接 schema に渡せない。page ローカルで `formSchema = z.object({ name: groupNameSchema })` を定義してラップする方針を採用した。
- `<UFormField :error="fieldErrors['name']">` で RPC エラー (invalid_group_name) を inline 表示。
- `onSubmit(event)` 内で `create(event.data.name)` を await し、`error === null` 時のみ `navigateTo('/')` を呼ぶ。
- `definePageMeta` なし (default.vue 自動継承、ADR-011 D1)。

### テスト結果

```
pnpm vitest run tests/unit/schemas/group-name.test.ts tests/unit/composables/useCreateGroup.test.ts

 Test Files  2 passed (2)
       Tests  8 passed (8)

pnpm test --run
 Test Files  19 passed (19)
       Tests  69 passed (69)
```

✅ 全テスト GREEN (既存テスト破壊なし)

### typecheck / lint 結果

- `pnpm typecheck`: ✅ エラーなし
- `pnpm exec eslint --fix app/pages/groups/new.vue`: ✅ エラーなし

### 課題・改善点（Refactor フェーズ候補）

- `formSchema` は page ローカル定義。共有が必要になれば `app/schemas/group-name.ts` にオブジェクトスキーマも追加できる（現状は page 固有のラッパのため page 内で十分）。
- `UForm` の `loadingAuto` 挙動（デフォルト true で submit 中すべての入力を disable）と `pending` の `UButton :disabled` の関係を Refactor フェーズで整理可能。

## Refactorフェーズ（品質改善）

### 実施日時

2026-06-01

### 改善内容

1. **formSchema コメント明確化** 🔵
   - `FormSchema<I extends object>` の型制約と「過剰共有を避ける」設計意図を明示
   - `app/schemas/` への昇格不要の判断根拠をコメントで担保

2. **UButton の `:loading="pending"` 削除** 🔵
   - `UForm.loadingAuto`(デフォルト `true`) が submit 中に `formLoadingInjectionKey` provide → `UButton type="submit"` は `isLoading=true` → 自動 disabled
   - `:loading="pending"` は二重指定のため削除
   - `:disabled="pending"` は `loadingAuto=false` 設定時の安全網として残存 (EDGE-003 / NFR-202) 🟡

### テスト結果

```
pnpm test --run: Test Files 19 passed / Tests 69 passed
pnpm typecheck: ✅ エラーなし
pnpm lint: ✅ エラーなし
```

### 品質評価

✅ 高品質: テスト全 GREEN・セキュリティ問題なし・パフォーマンス問題なし
