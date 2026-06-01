# TASK-0013: auth.global.ts middleware — Red フェーズ記録

**作成日**: 2026-06-01  
**タスク ID**: TASK-0013  
**要件名**: auth-onboarding  
**フェーズ**: Red（失敗テスト作成完了）

---

## 1. 作成テストケース一覧

| TC | テスト名 | 期待 | 実行結果 |
|---|---|---|---|
| TC1 | 未認証で保護 page にアクセスすると redirect クエリ付きで /login へリダイレクトする | `navigateTo('/login?redirect=/')` 呼出 | ❌ 失敗（実装なし） |
| TC2 | 未認証で /login にアクセスすると通過する（リダイレクトなし） | `navigateTo` 非呼出 | ✅ 通過（スタブが何もしないため） |
| TC3 | ログイン済未所属で保護 page にアクセスするとオンボーディングへリダイレクトする | `navigateTo('/onboarding')` 呼出 | ❌ 失敗（実装なし） |
| TC4 | ログイン済未所属で /groups/new にアクセスすると通過する（未所属許可 path） | `navigateTo` 非呼出 | ✅ 通過（スタブが何もしないため） |
| TC5 | ログイン済所属で /login にアクセスするとトップへリダイレクトする（public 分岐側で処理） | `navigateTo('/')` 呼出 | ❌ 失敗（実装なし） |
| TC6 | ログイン済所属で /onboarding にアクセスするとトップへリダイレクトする | `navigateTo('/')` 呼出 | ❌ 失敗（実装なし） |
| TC7 | ログイン済所属で保護 page にアクセスすると通過する（通常利用の正常系） | `navigateTo` 非呼出 | ✅ 通過（スタブが何もしないため） |

**失敗数**: 4 / 7（TC1/TC3/TC5/TC6）  
**通過数**: 3 / 7（TC2/TC4/TC7 — スタブが何もしないため通過系テストは偶然通過）

---

## 2. テストファイルパス

```
tests/unit/middleware/auth.test.ts
```

---

## 3. mock 解決方式

### defineNuxtRouteMiddleware
- `vi.mock('#imports')` + `vi.mock('#nuxt-router')` で恒等関数 `(fn) => fn` として mock
- これにより `import middleware from '~/middleware/auth.global'` の default export が「`to` を引数に取る async 関数」そのものになり、テストで直接 `await middleware(to)` 呼び出しが可能

### useSupabaseUser
- `vi.mock('#imports')` + `vi.mock('#supabase-user')` で `userRef`（`{ value: null | userX }`）を返す mock
- 1 段ネスト `{ value }` に注意

### useCurrentGroup
- `vi.mock('~/composables/useCurrentGroup')` で `useCurrentGroupMock`（即時解決 Promise）に差し替え
- `currentGroupRef = { value: null | groupG }` を各 TC 冒頭で設定
- 2 段ネスト `{ data: { value } }` に注意（useSupabaseUser との混同厳禁）

### navigateTo
- `vi.hoisted` で `navigateToMock = vi.fn()` 定義
- `vi.mock('#imports')` + `vi.mock('#nuxt-router')` 両方に登録し、どちらの変換経路でも同一スパイが使われる

---

## 4. 実装未存在による失敗確認

```
Tests  4 failed | 3 passed (7)
```

- **失敗したケース（TC1/TC3/TC5/TC6）**: navigateTo が期待通りに呼ばれなかった（スタブが未実装のため）
- **通過したケース（TC2/TC4/TC7）**: 「navigateTo が呼ばれないこと」を検証するため、未実装スタブが何もしない動作と一致

---

## 5. Green フェーズで実装すべき内容

`app/middleware/auth.global.ts` に以下のロジックを実装する（note.md §4 実装テンプレート参照）：

```typescript
export default defineNuxtRouteMiddleware(async (to) => {
  const PUBLIC_PATHS = ['/login', '/confirm']
  const isPublicPath = PUBLIC_PATHS.includes(to.path) || to.path.startsWith('/join/')
  const GROUP_OPTIONAL_PATHS = ['/onboarding', '/groups/new']

  const user = useSupabaseUser()

  if (isPublicPath) {
    if (to.path === '/login' && user.value) {
      const { data: currentGroup } = await useCurrentGroup()
      if (currentGroup.value) return navigateTo('/')
    }
    return
  }

  if (!user.value) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }

  const { data: currentGroup } = await useCurrentGroup()
  if (!currentGroup.value && !GROUP_OPTIONAL_PATHS.includes(to.path)) {
    return navigateTo('/onboarding')
  }
  if (currentGroup.value && to.path === '/onboarding') {
    return navigateTo('/')
  }
})
```

---

## 6. 品質判定

✅ **高品質**

- **テスト実行**: 7 ケース実行済み、4 失敗（実装なし）・3 通過（通過系）を確認
- **期待値**: 各 TC の navigateTo 引数または未呼び出しが一意に確定
- **アサーション**: `toHaveBeenCalledWith` / `not.toHaveBeenCalled` / `toHaveBeenCalledTimes` を適切に使用
- **信頼性レベル**: 🔵 100%（全 TC が ADR-008 D8 / REQ-101〜103/108 / dataflow.md §1 に直接対応）
