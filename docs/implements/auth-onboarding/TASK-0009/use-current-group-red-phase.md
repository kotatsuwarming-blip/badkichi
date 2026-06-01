# Red フェーズ記録: useCurrentGroup

**機能名**: useCurrentGroup（現在の所属 Group 読み取り composable）
**タスク ID**: TASK-0009
**要件名**: auth-onboarding
**フェーズ**: Red（失敗するテスト作成）
**作成日**: 2026-06-01

---

## 1. 作成したテストケース一覧

| ID | テスト名 | 信頼性 | 期待される失敗理由 |
|----|---------|--------|-----------------|
| TC1 | 所属ありユーザの SELECT 結果が data.value に反映され、eq(user_id, u1) で呼ばれる | 🔵 | `useCurrentGroup` が未実装のため Cannot find module |
| TC2 | 0 行（未所属）のとき data.value が null になり例外が発生しない | 🔵 | `useCurrentGroup` が未実装のため Cannot find module |

---

## 2. テストファイルパス

`tests/unit/composables/useCurrentGroup.test.ts`

---

## 3. テスト実行結果（Red 確認）

```
FAIL  tests/unit/composables/useCurrentGroup.test.ts
Error: Cannot find module '~/composables/useCurrentGroup'
```

- 実装ファイル `app/composables/useCurrentGroup.ts` が存在しないため、モジュール解決エラーで失敗
- これは Red フェーズとして正常な失敗

---

## 4. useAsyncData mock 解決方式

`useAsyncData` は Nuxt core の auto-import（`nuxt/dist/app/composables/asyncData.js`）。
`vi.mock('#imports')` だけでは `Nuxt Vite transform` が直接パスに変換するケースに対応できないため、
useLogin.test.ts の `#nuxt-router` / `#supabase-client` と同じアプローチで以下を追加:

1. **vitest.config.ts に alias 追加**:
   - `#supabase-user` → `@nuxtjs/supabase/dist/runtime/composables/useSupabaseUser.js`
   - `#async-data` → `nuxt/dist/app/composables/asyncData.js`

2. **テストファイルで 3 つの mock を配置**:
   - `vi.mock('#imports', ...)` — 基本の差し替え
   - `vi.mock('#supabase-client', ...)` — useSupabaseClient 安定エイリアス経由
   - `vi.mock('#supabase-user', ...)` — useSupabaseUser 安定エイリアス経由
   - `vi.mock('#async-data', ...)` — useAsyncData 安定エイリアス経由

3. **useAsyncData スタブは handler 即時実行**:
   - handler を `await handler()` で即時解決し `{ data: ref(result), ... }` を返す
   - これを省くと `data.value` が常に null になり TC1 が必ず失敗する

---

## 5. Green フェーズで実装すべき内容

### 実装ファイル

`app/composables/useCurrentGroup.ts`

### 実装スケルトン

```typescript
// app/composables/useCurrentGroup.ts
import type { Database } from '~/types/supabase'

export const useCurrentGroup = () => {
  const client = useSupabaseClient<Database>()
  const user = useSupabaseUser()

  return useAsyncData('current-group', async () => {
    const uid = user.value?.sub
    if (!uid) return null

    const { data, error } = await client
      .from('group_members')
      .select('group_id, groups(id, name)')
      .eq('user_id', uid)
      .maybeSingle()

    if (error) throw error
    return data
  })
}
```

### 実装のポイント

1. **固定キー `'current-group'`** — NFR-002（重複クエリ防止）
2. **uid は `user.value?.sub`** — `user.id` ではない（memory `project_mvp_revised_scope`）
3. **`.maybeSingle()`** — 0 行は `{ data: null, error: null }` で正常値
4. **クエリエラーは `throw error`** — error.vue グローバルフォールバックに委譲
5. **`useAsyncData` の戻り値をそのまま return** — AsyncState<CurrentGroup> 型に一致

---

## 6. 品質評価

- ✅ テスト実行: 失敗確認済み（Cannot find module）
- ✅ 期待値: TC1 は data.value の同値 + eq 引数検証 / TC2 は null + error.value null
- ✅ アサーション: toEqual / toHaveBeenCalledWith / toBeNull で具体的
- ✅ 実装方針: 明確（スケルトン記載）
- ✅ 信頼性レベル: 🔵 多数、🟡 なし、🔴 なし
