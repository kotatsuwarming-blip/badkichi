# useCreateGroup TDD 開発完了記録

## 確認すべきドキュメント

- `docs/tasks/auth-onboarding/TASK-0010.md`
- `docs/implements/auth-onboarding/TASK-0010/use-create-group-requirements.md`
- `docs/implements/auth-onboarding/TASK-0010/use-create-group-testcases.md`

## 🎯 最終結果 (2026-06-01)
- **実装率**: 100% (2/2 テストケース)
- **品質判定**: ✅ 合格（スコープ内テスト全通過・スコープ外テスト全通過）
- **TODO更新**: ✅ 完了マーク追加

## 概要

- 機能名: useCreateGroup（RPC）
- 開発開始: 2026-06-01
- 現在のフェーズ: 完了（verify-complete まで全フェーズ終了）

## 関連ファイル

- 元タスクファイル: `docs/tasks/auth-onboarding/TASK-0010.md`
- 要件定義: `docs/implements/auth-onboarding/TASK-0010/use-create-group-requirements.md`
- テストケース定義: `docs/implements/auth-onboarding/TASK-0010/use-create-group-testcases.md`
- Red フェーズ記録: `docs/implements/auth-onboarding/TASK-0010/use-create-group-red-phase.md`
- 実装ファイル（未作成）: `app/composables/useCreateGroup.ts`
- テストファイル: `tests/unit/composables/useCreateGroup.test.ts`

---

## Red フェーズ（失敗するテスト作成）

### 作成日時

2026-06-01

### テストケース概要

TC1（成功）/ TC2（invalid_group_name）の 2 ケース。`feedback_test_coverage` の最小境界値 + 分岐網羅方針に従い冗長ケースなし。

### 期待される失敗

```
FAIL  |node| tests/unit/composables/useCreateGroup.test.ts
Error: Cannot find module '~/composables/useCreateGroup'
```

`app/composables/useCreateGroup.ts` が未実装のためモジュール解決エラー。

### 次のフェーズへの要求事項（Green）

- `app/composables/useCreateGroup.ts` を実装する
- RPC 引数名: `group_name`（`p_group_name` は誤記）
- 成功時のみ `useCurrentGroup().refresh()` を await
- エラー時は `setFieldError('name', error)` を呼び refresh は呼ばない
- `pending` は `try/finally` で確実に false にリセット
- 戻り値: `{ create, pending: Ref<boolean>, fieldErrors: Ref<Record<string, string>> }`

---

## Green フェーズ（最小実装）

### 実施日時

2026-06-01

### 実装方針

- `app/composables/useCreateGroup.ts` を新規作成
- `useSupabaseClient<Database>()` / `useFormErrors()` / `useCurrentGroup()` は auto-import 利用
- `ActionResult<T>` / `UseCreateGroupReturn` は型が `app/types/interfaces.ts` に存在しないため composable 内でインラインで定義（既存 composable のパターンに合わせ import 不要）
- フロー順序: `clear()` → `pending=true` → `rpc('create_group_with_owner', {group_name})` → エラー: `setFieldError('name', error)` / 成功: `await useCurrentGroup().refresh()` → finally: `pending=false`

### テスト結果

```
 Test Files  14 passed (14)
      Tests  47 passed (47)
   Duration  559ms
```

全 14 ファイル・47 テスト通過。typecheck も通過。

### 信頼性評価

- 全アサーション 🔵（note.md §確定事項に全て記録済み）

### Refactor フェーズで対応すべき点

- `ActionResult<T>` / `UseCreateGroupReturn` の型定義が composable 内にインライン定義されており、他の composable と重複の可能性がある。`app/types/interfaces.ts` が整備されれば import に移行するとよい（ただし現時点では既存 composable も同様のパターンなので問題なし）

---

## 💡 重要な技術学習

### 実装パターン
- `useCurrentGroup()` を composable トップレベルではなく `create()` 内で呼ぶパターンが mock と整合する（テスト時に composable が呼ばれるタイミングに注意）
- `ActionResult<T>` / `UseCreateGroupReturn` 型は `app/types/interfaces.ts` が整備されるまで composable 内でインライン定義（既存 composable パターンと統一）

### テスト設計
- `vi.hoisted` + `vi.mock('#imports')` + `vi.mock('#supabase-client')` + composable 直接 mock の4層で Nuxt Vite transform を確実に補足する
- `clearAllMocks()` 後に `mockResolvedValue(undefined)` と `mockImplementation` を `beforeEach` で再適用する（clearAllMocks がモックの実装も消すため）
- `setFieldErrorMock` に state 反映実装 `(field) => { fieldErrorsRef.value[field] = 'mocked_message' }` を持たせることで `fieldErrors.value['name']` アサーションを通す

### 品質保証
- brace-style (1tbs): `} finally {` は同行に記載（CLAUDE.md §Coding Conventions）
- `pending` の try/finally リセットは実装担保（追加テストは最小判断で不要）
- エラーチャネルは inline (`useFormErrors`) のみ。toast / banner は使わない (REQ-109 / NFR-201)

## Refactor フェーズ改善内容（2026-06-01）

- **brace-style lint エラー修正**: `finally` ブロック前の `}` と `finally {` が別行になっていたため、`1tbs` スタイルに合わせて同行に修正
- ESLint ✅ / typecheck ✅ / テスト 47/47 通過
