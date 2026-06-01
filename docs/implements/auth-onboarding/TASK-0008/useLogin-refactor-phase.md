# Refactorフェーズ記録: useLogin

**機能名**: useLogin（Auth composable）
**タスクID**: TASK-0008
**要件名**: auth-onboarding
**フェーズ**: Refactor（品質改善）
**作成日**: 2026-06-01

---

## 改善概要

Green フェーズから引き継いだ主要改善候補:
1. pnpm 絶対パス mock のバージョン依存脆弱性 → `vitest.config.ts` の `resolve.alias` 安定化
2. ESLint `brace-style` 違反 (`useLogin.ts`) → 1tbs スタイルに修正

---

## 改善 1: vitest.config.ts の resolve.alias 追加（主要改善）

### 問題

Green フェーズでは以下のような pnpm バージョン入り絶対パスを `vi.mock()` に直接使用していた:

```typescript
// 変更前 (Green フェーズ) - バージョン番号入り絶対パス
vi.mock(
  '/Users/.../node_modules/.pnpm/nuxt@4.4.2_@babel+core@7.29.0_.../router.js',
  ...
)
vi.mock(
  '/Users/.../node_modules/.pnpm/@nuxtjs+supabase@2.0.8/.../useSupabaseClient.js',
  ...
)
```

**脆弱性**: パッケージのパッチバージョン更新でも `.pnpm` ディレクトリ内のパス（ハッシュ付き）が変わるとテストが壊れる。

### 解決策

`vitest.config.ts` に `resolve.alias` を追加し、短い安定エイリアスを定義する:

```typescript
// vitest.config.ts
const ROOT = new URL('.', import.meta.url).pathname.replace(/\/$/, '')

export default defineVitestConfig({
  resolve: {
    alias: {
      '#nuxt-router': ROOT + '/node_modules/nuxt/dist/app/composables/router.js',
      '#supabase-client': ROOT + '/node_modules/@nuxtjs/supabase/dist/runtime/composables/useSupabaseClient.js'
    }
  },
  ...
})
```

テストファイルでは短いエイリアスを使用:

```typescript
// 変更後 - 安定エイリアス
vi.mock('#supabase-client', () => ({ ... }))
vi.mock('#nuxt-router', async (importOriginal) => { ... })
```

### 設計判断 🔵

- `node:fs`/`node:path` の import は TypeScript 型エラーが発生するため避けた（`types` が空配列の tsconfig）
- `new URL('.', import.meta.url).pathname` で ESM 環境でのプロジェクトルートを取得
- `realpathSync` は不要: Vitest がシンボリックリンクを解決するため、`node_modules/nuxt` 経由のパスでも `.pnpm` の実パスと照合できる
- パッケージ更新時は `vitest.config.ts` 1 箇所のみ変更すればよい

---

## 改善 2: brace-style 修正 (useLogin.ts)

### 問題

ESLint `@stylistic/brace-style: 1tbs` ルール違反（47 / 71 / 76 行）:

```typescript
// 変更前
    }
    finally {
      ...
    }

    if (error) {
      ...
    }
    else {
      ...
    }
    }
    finally {
```

### 修正後

```typescript
    } finally {
      ...
    }

    if (error) {
      ...
    } else {
      ...
    }
    } finally {
```

---

## 最終コード (app/composables/useLogin.ts)

```typescript
/**
 * 【機能概要】: Google OAuth ログイン・ログアウトを内包する Write (Auth) composable
 * 【実装方針】: page から supabase.auth を直叩きさせず、認証フローを 1 箇所に集約する (REQ-406 / ADR-007 D9)
 * 【テスト対応】: TC1 (signInWithOAuth 呼び出し) / TC2 (logout 順序) / TC3 (Auth エラー → setNotice)
 * 🔵 interfaces.ts UseLoginReturn + TASK-0008.md 実装詳細 + note.md §2
 */

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
    } finally {
      pending.value = false
    }
  }

  async function logout(): Promise<void> {
    pending.value = true
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        setNotice(error)
      } else {
        await navigateTo('/login')
      }
    } finally {
      pending.value = false
    }
  }

  return { login, logout, pending, notice }
}
```

---

## セキュリティレビュー結果

| 観点 | 結果 |
|------|------|
| 入力値検証 | `redirect` パスは `encodeURIComponent` でエンコード済み ✅ |
| 認証情報漏洩 | supabase client の credentials はランタイム環境変数から取得、composable 内に記録なし ✅ |
| XSS | `redirectTo` は URL パスとして使用、HTML に直接出力しない ✅ |
| 認可 | OAuth フローは Supabase + Google に委譲、composable はフロー制御のみ ✅ |

---

## パフォーマンスレビュー結果

| 観点 | 結果 |
|------|------|
| 計算量 | O(1) - 文字列操作と async call のみ ✅ |
| メモリ | reactive state (pending, notice) 2 つのみ ✅ |
| 非同期処理 | try/finally で pending を確実に解放 ✅ |

---

## テスト実行結果

```
Test Files  12 passed (12)
     Tests  43 passed (43)
Duration  440ms
```

TC1 / TC2 / TC3 全て成功。既存 40 テストへの影響なし。

---

## 品質判定

✅ **高品質**
- テスト: 全 43 件成功
- セキュリティ: 重大な脆弱性なし
- パフォーマンス: 重大な性能課題なし
- リファクタ目標: 絶対パス mock 安定化・brace-style 修正 完了
- lint: クリア（対象外ファイルのエラー除く）
- typecheck: エラーなし

---

## 次フェーズ (verify-complete) への注意点

1. **全テスト実行**: `pnpm test` で全 43 テストの成功を確認する（確認済み）
2. **alias の動作確認**: `#nuxt-router` / `#supabase-client` エイリアスは useLogin.test.ts 専用。他テストへの影響なし（確認済み）
3. **実装コードのファイルサイズ**: `useLogin.ts` は 86 行で 500 行制限内
4. **UseLoginReturn 型準拠**: `login / logout / pending / notice` の 4 メンバーを返している
