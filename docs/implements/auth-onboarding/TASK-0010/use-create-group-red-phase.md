# Red フェーズ記録: useCreateGroup

**機能名**: useCreateGroup（RPC）
**タスクID**: TASK-0010
**要件名**: auth-onboarding
**フェーズ**: Red（失敗テスト作成完了）
**作成日**: 2026-06-01

---

## 作成したテストケース一覧

| # | テスト名 | 主アサーション | 信頼性 |
|---|---|---|---|
| TC1 | create 成功時に RPC を正しい引数で呼び、所属状態を refresh し、group_id を返す | rpc 引数 `group_name` / refresh 1回 / setFieldError 非呼出 / `{ data:'g1', error:null }` | 🔵 |
| TC2 | create が invalid_group_name エラー時に inline フィールドエラーを載せ、refresh を呼ばない | `setFieldError('name', error)` / `fieldErrors['name']` 非 undefined / refresh 非呼出 / `{ data:null, error }` | 🔵 |

---

## テストファイルパス

`tests/unit/composables/useCreateGroup.test.ts`

---

## テスト実行結果（Red 確認）

```
FAIL  |node| tests/unit/composables/useCreateGroup.test.ts
Error: Cannot find module '~/composables/useCreateGroup'
```

- **失敗理由**: `app/composables/useCreateGroup.ts` が未実装のためモジュール解決エラー
- **期待通りの失敗**: ✅ Red フェーズとして正常

---

## mock 解決方式

useLogin.test.ts と同じ 4 層 mock 方式を採用:

1. `vi.mock('#imports')` — `ref` は vue 実物、`useSupabaseClient` / `useCurrentGroup` / `useFormErrors` を差し替え
2. `vi.mock('#supabase-client')` — Nuxt Vite transform が直接パスに変換するケースへの保険（alias: vitest.config.ts）
3. `vi.mock('~/composables/useCurrentGroup')` — composable ファイル直接 mock
4. `vi.mock('~/composables/useFormErrors')` — composable ファイル直接 mock

`fieldErrorsRef` はスタブ `{ value: {} as Record<string, string> }` で TC2 の `fieldErrors.value['name']` 検証を成立させる。

---

## Green フェーズで実装すべき内容

### 実装ファイル

`app/composables/useCreateGroup.ts`

### 必須要件

1. **戻り値**: `{ create, pending: Ref<boolean>, fieldErrors: Ref<Record<string, string>> }`（`UseCreateGroupReturn`）
2. **RPC 呼び出し**: `rpc('create_group_with_owner', { group_name: groupName })`（引数名は `group_name`、`p_group_name` は誤記）
3. **成功時**: `useCurrentGroup().refresh()` を await
4. **エラー時**: `setFieldError('name', error)` を呼ぶ（refresh は呼ばない）
5. **pending**: `try/finally` で確実に `false` にリセット（EDGE-003 二重送信防止）
6. **戻り値型**: `ActionResult<string>` = `{ data: group_id | null, error: unknown }`

### 実装スケルトン概要

```typescript
export function useCreateGroup(): UseCreateGroupReturn {
  const pending = ref(false)
  const { fieldErrors, setFieldError, clear } = useFormErrors()
  const supabase = useSupabaseClient<Database>()

  async function create(groupName: string): Promise<ActionResult<string>> {
    pending.value = true
    try {
      const { data, error } = await supabase.rpc('create_group_with_owner', { group_name: groupName })
      if (error) {
        setFieldError('name', error)
        return { data: null, error }
      }
      await useCurrentGroup().refresh()
      return { data, error: null }
    } finally {
      pending.value = false
    }
  }

  return { create, pending, fieldErrors }
}
```
