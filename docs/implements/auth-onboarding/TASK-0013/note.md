# TASK-0013: middleware auth.global.ts — TDD 開発ノート

**作成日**: 2026-06-01  
**タスク ID**: TASK-0013  
**要件名**: auth-onboarding

---

## 1. 技術スタック

### フレームワーク・ライブラリ
- **Nuxt 4.4** / Vue 3 + TypeScript strict mode
- **@nuxtjs/supabase 2.x**: `useSupabaseClient<Database>()` / `useSupabaseUser()` (isomorphic)
- **Vitest**: middleware 単体テスト (ADR-012 D5)
- **defineNuxtRouteMiddleware**: Nuxt 4 ルーティング middleware base

### 参照元
- docs/tasks/auth-onboarding/TASK-0013.md
- docs/design/auth-onboarding/dataflow.md (§1 フローチャート)
- docs/design/auth-onboarding/architecture.md (§認証 middleware)
- docs/design/auth-onboarding/interfaces.ts
- docs/design/cross-cutting/error-handling.md
- docs/decisions/ADR-008.md (middleware 戦略、D1-D8)

---

## 2. 開発ルール

### middleware 基本ルール（ADR-008 D1）
- **実装ファイル**: `app/middleware/auth.global.ts`
- **形式**: `defineNuxtRouteMiddleware(async (to) => { ... })`
- **全分岐**: 1 ファイルで認証・Group 所属の全判定を集約（NFR-104 保護漏れゼロ）
- **データフロー**: docs/design/auth-onboarding/dataflow.md §1 フローチャートに厳密に従う
- **キャッシュ共有**: `useCurrentGroup` の `useAsyncData('current-group')` キーを共有（ADR-008 D4）

### path 判定ルール（dataflow.md §1）
- **PUBLIC_PATHS**: `['/login', '/confirm']` + `to.path.startsWith('/join/')` で public 判定
- **GROUP_OPTIONAL_PATHS**: `['/onboarding', '/groups/new']` — ログイン済未所属でも通す
- **public path 処理**:
  - `/login` かつ ログイン済・Group 所属 → `navigateTo('/')` (REQ-103)
  - それ以外の public → `return` で通す
- **非 public path 処理**:
  - 未認証 (`!user.value`) → `navigateTo('/login?redirect=...')` (REQ-101/108)
  - ログイン済・未所属・非許可 path → `navigateTo('/onboarding')` (REQ-102)
  - ログイン済・所属・/onboarding → `navigateTo('/')` (REQ-103)
  - ログイン済・所属・その他 → return（通す）
- **/join/** 例外**: public path だが未認証リダイレクトは middleware ではなく page 内で実装（TASK-0018）

### 状態判定ルール
- **useSupabaseUser**: `{ value: User | null }` の Ref を返す（user.sub で uid 確認）
- **useCurrentGroup**: `{ data: Ref<CurrentGroup | null>, pending, error, refresh }` 返す
  - 同一キー `'current-group'` を middleware・page で共有し 1 ナビゲーション 1 クエリ保証（NFR-002）
  - 所属済: `currentGroup.value = { group_id: ..., groups: { id, name } }`
  - 未所属: `currentGroup.value = null`
- **navigateTo**: Nuxt ナビゲーション API（middleware でリダイレクト実行）

### isomorphic 原則（ADR-008 D6）
- `useSupabaseUser` / `useCurrentGroup` / `navigateTo` **のみ使用**
- `serverSupabaseClient` / `window` / `document` 禁止（SSR/CSR 双方動作）
- 非同期処理: `await useCurrentGroup()` で pending を待つ

### テスト戦略（ADR-008 D8）
- テストファイル: `tests/unit/middleware/auth.test.ts`
- mock 対象: `defineNuxtRouteMiddleware` / `useSupabaseUser` / `useCurrentGroup` / `navigateTo`
- **defineNuxtRouteMiddleware mock**: ファクトリ関数 `(to) => { ... }` を直接 spy（Nuxt composable のため）
- ケース: 7 分岐（ADR-008 D8 表の代表ケース、8 行目「未認証 + /login」は TC2 に集約）
- 最小カバレッジ: 分岐カバレッジ（条件分岐による制御フロー網羅）

---

## 3. 関連実装

### 前提タスク実装（TASK-0009 useCurrentGroup）
- `app/composables/useCurrentGroup.ts` 既実装
- 固定キー `'current-group'` を返す → middleware で共有
- 型: `AsyncState<CurrentGroup | null>`

### Nuxt middleware の既存例
- app/middleware/ ディレクトリは新規作成（既存 middleware なし）
- ファイルベース routing に対応した `*.ts` 形式（app/pages/ と同様）

### テスト mock パターン参考
- **useLogin.test.ts**: vi.hoisted / vi.mock('#imports') / #nuxt-router エイリアス
- **useCurrentGroup.test.ts**: useAsyncData 即時実行 mock パターン
- **vitest.config.ts**: alias 設定で #nuxt-router / #supabase-client の安定化

### 既存の error.vue フォールバック
- middleware が throw → error.vue グローバルエラーハンドラ
- 本タスク: navigateTo 以外の例外は発生しない（useCurrentGroup は try-catch 不要）

---

## 4. 設計文書

### フローチャート（dataflow.md §1）
```
Start → to は public path?
  ├─ Yes → to === /login かつ Group 所属済?
  │   ├─ Yes → navigateTo '/'
  │   └─ No → 通す (return)
  └─ No → ログイン済?
      ├─ No → navigateTo '/login?redirect=...'
      └─ Yes → Group 所属?
          ├─ No → to が未所属許可 path (/onboarding or /groups/new)?
          │   ├─ Yes → 通す
          │   └─ No → navigateTo '/onboarding'
          └─ Yes → to === /onboarding?
              ├─ Yes → navigateTo '/'
              └─ No → 通す
```

### 型定義（interfaces.ts）
```typescript
// CurrentGroup: useCurrentGroup の SELECT 結果
interface CurrentGroup {
  group_id: string
  groups: { id: string, name: string } | null
}

// 利用箇所: const { data: currentGroup } = await useCurrentGroup()
//          if (!currentGroup.value) { /* 未所属 */ }
//          if (currentGroup.value) { /* 所属済 */ }
```

### 実装テンプレート（TASK-0013.md）
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

参照元: docs/design/auth-onboarding/dataflow.md §1 / docs/tasks/auth-onboarding/TASK-0013.md 実装詳細

---

## 5. テスト関連情報

### テストフレームワーク設定
- **Vitest**: tests/unit/ に集約、integration は別ファイル名 (*.integration.test.ts)
- **vitest.config.ts**: 
  - alias 設定: `#nuxt-router` → `nuxt/dist/app/composables/router.js`
  - alias 設定: `#supabase-client` → `@nuxtjs/supabase/dist/runtime/composables/useSupabaseClient.js`
  - alias 設定: `#supabase-user` → `@nuxtjs/supabase/dist/runtime/composables/useSupabaseUser.js`
  - include: `tests/unit/**/*.test.ts`
- **@nuxt/test-utils**: defineVitestConfig で auto-import / SSR 対応

### middleware 単体テストの構成
```
tests/unit/middleware/
  └── auth.test.ts (TASK-0013 ファイル)
```
- ファイル新規作成（middleware 用テストディレクトリは初）

### defineNuxtRouteMiddleware の mock 方式
- **問題**: defineNuxtRouteMiddleware は Nuxt 内部の higher-order function
- **戦略**: 実装を `(to) => { ... }` の async 関数として直接 spy（ラッパーではなく関数体をテスト）
- **参考**: useLogin.test.ts での navigateTo mock と同じアプローチ
- **サンプル**: TASK-0013.md の「単体テスト要件」§mock 戦略 参照

### mock パターン
1. **vi.hoisted**: useSupabaseUser / useCurrentGroup / navigateTo spy 生成
2. **vi.mock('#imports')**: Nuxt auto-import (#imports) を差し替え
3. **vi.mock('#nuxt-router')**: defineNuxtRouteMiddleware / navigateTo を差し替え
4. **vi.mock('#supabase-user')**: useSupabaseUser を差し替え
5. **beforeEach**: vi.clearAllMocks() で テスト間隔離

### テストケース（ADR-008 D8、7 分岐）
1. **TC1**: 未認証で保護 page → /login?redirect=...
2. **TC2**: 未認証で /login (public) → 通す
3. **TC3**: ログイン済未所属で保護 page → /onboarding
4. **TC4**: ログイン済未所属で /groups/new (許可) → 通す
5. **TC5**: ログイン済所属で /login → /
6. **TC6**: ログイン済所属で /onboarding → /
7. **TC7**: ログイン済所属で保護 page → 通す

参照元:
- docs/tasks/auth-onboarding/TASK-0013.md §単体テスト要件
- docs/decisions/ADR-008.md D8（7 × 3 分岐表）
- vitest.config.ts
- tests/unit/composables/useLogin.test.ts (mock パターン参考)
- tests/unit/composables/useCurrentGroup.test.ts (useAsyncData mock 参考)

---

## 6. 注意事項

### 🔵 確定事項（実装時自信あり）
1. **public path の定義**: `['/login', '/confirm']` + `/join/**` のみ（dataflow.md §1）
2. **未所属許可 path**: `['/onboarding', '/groups/new']` のみ（REQ-102 / ADR-008 D1）
3. **uid は user.sub**: `useSupabaseUser().value?.sub` を使う（memory project_mvp_revised_scope）
4. **useAsyncData キー**: 固定文字列 `'current-group'` を middleware・page で共有（ADR-008 D4）
5. **/login での所属済分岐**: public path 側（図上部）で処理（dataflow.md §1 PubLogin ノード）
6. **/onboarding での所属済分岐**: 認証済ブランチ（非 public 側）でのみ処理
7. **isomorphic 原則**: window / document / serverSupabaseClient 禁止（SSR/CSR 双方動作）
8. **/join/** は page 内で未認証リダイレクト**: middleware では public 通す（ADR-008 D1 例外、TASK-0018）

### 🟡 実装時に確認（確定待ち）
1. **app/middleware/ ディレクトリの存在**: 新規作成必要か確認
2. **useCurrentGroup の pending 待機**: async/await で pending.value をポーリングする必要はないか確認
   - 期待: useAsyncData モックが handler を即時実行し data を返す（TC で検証）

### ⚠️ よくある罠
- `/login` での所属済→`/` の判定は **public path 側**で（non-public ブランチではない）
- `useCurrentGroup` は `{ data: Ref, pending: Ref, error: Ref, refresh }` を返す（`data.value` で アクセス）
- 2 回呼ぶ (public 分岐と非 public 分岐) 場合も **同一キー 'current-group'** で cache 共有（クエリ 1 回のみ）
- redirect クエリは `encodeURIComponent` で URL エンコード（複数パラメータ対応）
- middleware で `try-catch` は不要（エラーは error.vue フォールバック）

---

## 7. 次フェーズへの注意点

### requirements フェーズ（tsumiki:tdd-requirements）
- **dataflow.md §1 フローチャートの解読**: 7 分岐の完全性を確認
- **ADR-008 D1 の理解**: 1 ファイル・全分岐集約の意図確認
- **REQ-101/102/103/108 の読み込み**: 各リダイレクト条件の根拠

### testcases フェーズ（tsumiki:tdd-testcases）
- **7 ケースの分岐カバレッジ**: 条件判定の OR / AND の網羅を確認
- **TC の Given/When/Then**: path / user / currentGroup の各組み合わせを明示
- **mock 戻り値の設計**: useSupabaseUser と useCurrentGroup の返し値型を正確に

### red / green フェーズ
- **defineNuxtRouteMiddleware のテスト実行可能性**: 関数体の呼び出しが可能か確認
- **navigateTo spy**: mockReturnValue で呼び出し検証可能か確認
- **to オブジェクト**: `{ path, fullPath }` で十分か（Nuxt RouteLocationNormalized との差）

### refactor / verify-complete フェーズ
- **定数の抽出**: PUBLIC_PATHS / GROUP_OPTIONAL_PATHS は const 分離OK
- **isomorphic 原則**: window / document がないことを grep で確認
- **エラーハンドリング**: throw / error.vue の関係を確認

---

## 参照ファイル一覧

| ファイル | 用途 |
|---------|------|
| docs/tasks/auth-onboarding/TASK-0013.md | タスク定義（完了条件・実装詳細・テスト要件） |
| docs/design/auth-onboarding/dataflow.md | フローチャート§1（分岐フロー） |
| docs/design/auth-onboarding/architecture.md | アーキテクチャ・middleware セクション |
| docs/design/auth-onboarding/interfaces.ts | 型定義（CurrentGroup / AsyncState） |
| docs/design/cross-cutting/error-handling.md | エラーハンドリング戦略（参考） |
| docs/decisions/ADR-008.md | middleware 戦略 D1-D8（設計決定） |
| docs/tasks/auth-onboarding/TASK-0009.md | 前提タスク useCurrentGroup |
| app/composables/useCurrentGroup.ts | 共有 composable（useAsyncData 'current-group' キー） |
| app/types/supabase.ts | 生成型（CurrentGroup 型確認） |
| vitest.config.ts | Vitest 設定・alias 定義 |
| tests/unit/composables/useLogin.test.ts | mock パターン参考（vi.hoisted / vi.mock） |
| tests/unit/composables/useCurrentGroup.test.ts | useAsyncData mock 参考 |

---

## 🎯 要点まとめ

**実装**: `defineNuxtRouteMiddleware(async (to) => { ... })` で 7 分岐を 1 ファイルに集約

**判定フロー**: dataflow.md §1 フローチャート（public → /login+所属？→ 認証 → Group → 許可 path?）

**キャッシュ共有**: `useCurrentGroup` の固定キー `'current-group'` を middleware・page で共有（1 ナビゲーション 1 クエリ）

**公開 path**: `/login` / `/confirm` / `/join/**`（未認証通す、只し /login で所属済→/）

**未所属許可**: `/onboarding` / `/groups/new`（ログイン済なら通す）

**リダイレクト**: 未認証→/login?redirect=... / 未所属→/onboarding / 所属+/onboarding→/

**テスト**: 7 ケース分岐カバレッジ（ADR-008 D8 表）

**注意**: window/document 禁止（isomorphic）、/login での所属済は public 分岐側、/join/** は page で未認証 catch
