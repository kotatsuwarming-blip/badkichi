# Green フェーズ記録: useCreateGroup

**機能名**: useCreateGroup（RPC）
**タスクID**: TASK-0010
**要件名**: auth-onboarding
**フェーズ**: Green（最小実装完了）
**実施日**: 2026-06-01

---

## 実装ファイル

`app/composables/useCreateGroup.ts`

---

## 実装コード

```typescript
import type { Database } from '~/types/supabase'
import type { Ref } from 'vue'

interface ActionResult<T> {
  data: T | null
  error: unknown
}

interface UseCreateGroupReturn {
  create: (groupName: string) => Promise<ActionResult<string>>
  pending: Ref<boolean>
  fieldErrors: Ref<Record<string, string>>
}

export function useCreateGroup(): UseCreateGroupReturn {
  const pending = ref(false)
  const { fieldErrors, setFieldError, clear } = useFormErrors()
  const supabase = useSupabaseClient<Database>()

  async function create(groupName: string): Promise<ActionResult<string>> {
    clear()
    pending.value = true

    try {
      const { data, error } = await supabase.rpc('create_group_with_owner', { group_name: groupName })

      if (error) {
        setFieldError('name', error)
        return { data: null, error }
      }

      await useCurrentGroup().refresh()

      return { data, error: null }
    }
    finally {
      pending.value = false
    }
  }

  return { create, pending, fieldErrors }
}
```

---

## 実装方針と判断理由

| 判断項目 | 採用内容 | 理由 |
|---|---|---|
| 型定義の配置 | composable 内インライン定義 | `app/types/interfaces.ts` が未作成のため。既存 useLogin.ts / useCurrentGroup.ts も同パターン |
| `clear()` 呼び出し順序 | `pending=true` の前 | dataflow.md §3 D5-1「前回エラーをクリアしてから pending を立てる」の順序を厳守 |
| `refresh()` 呼び出し条件 | 成功時のみ `await` | エラー時は所属状態が変化しないため refresh は不要（TASK-0010.md §実装詳細 確定） |
| `setFieldError` 第2引数 | `error` そのまま渡す | 文言変換は `useFormErrors → useErrorMessage` の責務（責務分離） |
| `pending` リセット | `try/finally` で確実に実行 | EDGE-003 二重送信防止。成功・エラー双方で false にリセットが必須 |

---

## テスト実行結果

```
 Test Files  14 passed (14)
      Tests  47 passed (47)
   Start at  18:08:09
   Duration  559ms (transform 628ms, setup 198ms, import 976ms, tests 256ms, environment 4ms)
```

`pnpm typecheck` も通過。

---

## 課題・改善点（Refactor フェーズで対応）

1. **型定義の配置**: `ActionResult<T>` / `UseCreateGroupReturn` が composable 内にインライン定義されている。`app/types/interfaces.ts` が整備された際は import に移行することでプロジェクト全体の型統一度が高まる。
2. **現時点の評価**: 既存 composable（useLogin.ts 等）も同様にインライン定義のパターンのため、リファクタの必要性は低い。
