# Redフェーズ記録: useLogin

**機能名**: useLogin（Auth composable）
**タスクID**: TASK-0008
**要件名**: auth-onboarding
**フェーズ**: Red（失敗するテスト作成）
**作成日**: 2026-06-01

---

## 作成したテストケース一覧

| # | テスト名 | 信頼性 | 対応要件 |
|---|---|---|---|
| TC1 | login が Google OAuth を `/confirm?redirect=` 付き redirectTo で開始する | 🔵 | REQ-001 / A2 |
| TC2 | logout が signOut 成功後に `/login` へ遷移する（呼び出し順序保証） | 🔵 | REQ-008 |
| TC3 | login の Auth エラー時に setNotice され、リダイレクトは発生しない（EDGE-002） | 🔵 | EDGE-002 |

全 3 件・信頼性 🔵 100%

---

## テストコードファイル

`tests/unit/composables/useLogin.test.ts`

---

## テスト実行結果（Red確認）

```
FAIL  |node| tests/unit/composables/useLogin.test.ts [ tests/unit/composables/useLogin.test.ts ]
Error: Cannot find module '~/composables/useLogin' imported from ...
```

**失敗理由**: `app/composables/useLogin.ts` が未実装のため `Cannot find module '~/composables/useLogin'` で suite 全体が失敗。
これは意図した Red フェーズの状態（実装未存在による失敗）。

---

## mock 構成

```typescript
// vi.hoisted で TDZ 回避
const { signInWithOAuthMock, signOutMock, navigateToMock, setNoticeMock, noticeRef } = vi.hoisted(...)

// vi.mock('#imports') で Nuxt auto-import を差し替え
// - ref: importOriginal 経由の vue 実物
// - useSupabaseClient: auth.signInWithOAuth / auth.signOut を mock に
// - navigateTo: navigateToMock に
// - useNoticeErrors: notice(noticeRef) / setNotice(setNoticeMock) に
vi.mock('#imports', async (importOriginal) => { ... })

// beforeEach で vi.clearAllMocks() + noticeRef.value = null
```

---

## Greenフェーズで実装すべき内容

### 実装ファイル
`app/composables/useLogin.ts`

### 実装すべき内容

1. **`useLogin()` composable のエクスポート**
   - `UseLoginReturn` 型（`interfaces.ts`）に準拠した戻り値

2. **`login(redirect?: string): Promise<void>`**
   - `useSupabaseClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '/confirm?redirect=' + encodeURIComponent(redirect ?? '/') } })` を呼ぶ
   - `error` が返った場合は `setNotice(error)` を呼ぶ（`navigateTo` は呼ばない）
   - `pending` を try 前に `true`、finally で `false` にする

3. **`logout(): Promise<void>`**
   - `useSupabaseClient().auth.signOut()` を呼んだ**後に** `navigateTo('/login')` を呼ぶ（順序重要）
   - `pending` を try 前に `true`、finally で `false` にする

4. **`pending: Ref<boolean>`**
   - 初期値 `false`、login/logout 実行中は `true`

5. **`notice: Ref<string | null>`**
   - `useNoticeErrors()` から取得した `notice` をそのまま expose

### 依存関係
- `useNoticeErrors` (TASK-0007 実装済) → `setNotice` でエラーを notice チャネルへ
- `useSupabaseClient` → Nuxt/Supabase auto-import
- `navigateTo` → Nuxt auto-import
