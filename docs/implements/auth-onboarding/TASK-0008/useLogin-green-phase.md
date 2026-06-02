# Greenフェーズ記録: useLogin

**機能名**: useLogin（Auth composable）
**タスクID**: TASK-0008
**要件名**: auth-onboarding
**フェーズ**: Green（最小実装）
**作成日**: 2026-06-01

---

## 実装ファイル

`app/composables/useLogin.ts`（新規作成）

---

## 実装コード

```typescript
import type { Database } from '~/types/supabase'

export function useLogin() {
  const supabase = useSupabaseClient<Database>()
  const { notice, setNotice, clear } = useNoticeErrors()
  const pending = ref<boolean>(false)

  async function login(redirect?: string): Promise<void> {
    clear()
    pending.value = true
    try {
      const redirectTo = '/confirm?redirect=' + encodeURIComponent(redirect ?? '/')
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo }
      })
      if (error) {
        setNotice(error)
      }
    }
    finally {
      pending.value = false
    }
  }

  async function logout(): Promise<void> {
    pending.value = true
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        setNotice(error)
      }
      else {
        await navigateTo('/login')
      }
    }
    finally {
      pending.value = false
    }
  }

  return { login, logout, pending, notice }
}
```

---

## 実装方針と判断理由

- **UseLoginReturn 型準拠** 🔵: interfaces.ts の `login / logout / pending / notice` 4 メンバーをそのまま実装
- **login の clear() 呼び出し** 🔵: TASK-0008.md 実装サンプルに従い、前回エラー notice をクリアしてから OAuth 開始
- **finally で pending=false** 🔵: EDGE-003 二重送信防止。成功・失敗いずれも確実に false に戻す
- **logout の navigateTo 呼び出し順序** 🔵: signOut 完了後にのみ navigateTo を呼ぶ（TC2 invocationCallOrder テストが load-bearing）
- **error は setNotice にそのまま渡す** 🔵: 文言変換は useNoticeErrors 内部の useErrorMessage 責務（責務分離、note.md §3）

---

## テスト実行結果

```
Test Files  12 passed (12)
     Tests  43 passed (43)
```

TC1（signInWithOAuth 呼び出し）/ TC2（logout 順序）/ TC3（Auth エラー → setNotice）全て成功。
既存 40 テストへの影響なし。typecheck 通過。

---

## テスト側で調整した点

`tests/unit/composables/useLogin.test.ts` に以下の mock を追加:

1. **`useSupabaseClient` の直接 mock**: `vi.mock('#imports')` の中に `useSupabaseClient` を定義しても、Nuxt Vite transform が auto-import を `@nuxtjs/supabase` の直接パスに変換するため効かなかった。pnpm の実パスを直接 mock で解決。
2. **`navigateTo` の直接 mock**: 同様に Nuxt の `nuxt/dist/app/composables/router.js` を直接 mock し、`importOriginal` で他エクスポートを保持した上で `navigateTo` のみ差し替え。
3. **`useNoticeErrors` の直接 mock**: `~/composables/useNoticeErrors` を直接 mock（`useNoticeErrors.test.ts` の `useErrorMessage` 直接 mock と同アプローチ）。

---

## 課題・Refactorフェーズへの注意点

1. **pnpm 絶対パス mock の脆弱性**: `useSupabaseClient` と `navigateTo` を pnpm の node_modules 絶対パスで mock している。パッケージバージョン更新や環境変更でパスが変わるとテストが壊れる。Refactor で `vitest.config.ts` の `alias` 設定や `moduleNameMapper` を使ったより安定した mock 方法に移行すべき。
2. **`clear()` の呼び出し未検証**: login 冒頭で前回 notice をクリアしているが TC では未検証（最小カバレッジ方針）。
3. **`pending` の遷移未検証**: 最小カバレッジのため `pending` の true/false 遷移テストなし。実装は確実に finally で false に戻している。
