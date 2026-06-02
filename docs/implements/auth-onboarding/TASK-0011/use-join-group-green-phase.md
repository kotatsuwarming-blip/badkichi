# Green フェーズ記録: useJoinGroup

**機能名**: useJoinGroup  
**タスクID**: TASK-0011  
**要件名**: auth-onboarding  
**作成日**: 2026-06-01  
**フェーズ**: Green (最小実装完了)

---

## 実装ファイル

`app/composables/useJoinGroup.ts`

---

## 実装方針

1. **useCreateGroup.ts パターン踏襲**: BaaS 直結 + useNoticeErrors チャネルの同型構成
2. **EDGE-005 明示変換**: DB `'invitation_not_found'` → App `APP_ERROR_CODES.INVITATION_NOT_FOUND_BY_LINK` への詰め替えを実装
3. **戻り値の元エラー保持**: `return { data, error }` の error は詰め替え前の元エラー（TC2 の契約）
4. **try/finally で pending リセット**: 成功・エラーを問わず確実に `pending.value = false`（EDGE-003）

---

## 実装コード全文

```ts
import { APP_ERROR_CODES } from '~/types/error-codes'
import type { Database } from '~/types/supabase'
import type { Ref } from 'vue'

interface ActionResult<T> {
  data: T | null
  error: unknown
}

interface UseJoinGroupReturn {
  join: (inviteCode: string) => Promise<ActionResult<string>>
  pending: Ref<boolean>
  notice: Ref<string | null>
}

export function useJoinGroup(): UseJoinGroupReturn {
  const pending = ref(false)
  const { notice, setNotice, clear } = useNoticeErrors()
  const supabase = useSupabaseClient<Database>()

  async function join(inviteCode: string): Promise<ActionResult<string>> {
    clear()
    pending.value = true

    try {
      const { data, error } = await supabase.rpc('join_group_with_code', { invite_code: inviteCode })

      if (error) {
        const msg = (error as { message?: string }).message ?? ''
        const mapped = msg.includes('invitation_not_found') && !msg.includes('invitation_not_found_by_link')
          ? { ...error, message: APP_ERROR_CODES.INVITATION_NOT_FOUND_BY_LINK }
          : error
        setNotice(mapped)
        return { data: null, error }
      }

      await useCurrentGroup().refresh()
      return { data, error: null }
    } finally {
      pending.value = false
    }
  }

  return { join, pending, notice }
}
```

---

## テスト実行結果

```
Test Files  15 passed (15)
     Tests  51 passed (51)
  Duration  585ms
```

- **useJoinGroup.test.ts**: TC1〜TC4 全て通過（4/4）
- **全スイート**: 15 ファイル・51 テスト全通過（既存テスト継続通過）
- **typecheck**: 通過（エラーなし）

---

## 品質判定

✅ **高品質**

| 基準 | 状態 |
|---|---|
| テスト結果 | 全 51 テスト成功 |
| 実装品質 | シンプル・理解しやすい |
| リファクタ箇所 | 明確に特定可能 |
| 機能的問題 | なし |
| コンパイルエラー | なし |
| ファイルサイズ | 91 行（800 行制限内） |
| モック使用 | 実装コードに含まれていない |

---

## Refactor フェーズへの注意点

1. **型定義の重複解消**: `ActionResult<T>` と `UseJoinGroupReturn` が `useCreateGroup.ts` と重複定義されている。`docs/design/auth-onboarding/interfaces.ts` を参照して共通 interfaces.ts への集約を検討
2. **import 整理**: `type Ref` は vue から import しているが、auto-import 対象か確認（`useCreateGroup.ts` と同様の扱いでよいか）
3. **EDGE-005 ロジックのコメント保持**: 明示変換ロジックは一見奇妙に見えるため、詳細コメントを Refactor 後も維持すること
