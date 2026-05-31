# ADR-008: middleware 戦略 (global / named / route-level)

## ステータス
Accepted (2026-05-27) / コード例修正 (2026-05-30、kairo-design: 未所属許可 path に `/groups/new` を追加。当初例は `/onboarding` のみ許可で Group 作成動線が機能しない不具合があった)

## 用語の前提

本 ADR で扱う **middleware** は Nuxt の概念で、「page に到達する前に実行される事前チェック関数」を指す。
データエンジニアアナロジー: dbt の `pre-hook` (モデル実行前に走る SQL) や Airflow の
pre-execute callback に近い。

Nuxt の middleware には 3 つの実装パターンがある:

| 種類 | ファイル名規約 | いつ実行されるか | データエンジニアアナロジー |
|------|--------------|---------------|--------------------------|
| **Global middleware** | `app/middleware/foo.global.ts` | すべての page navigation で自動実行 | dbt project 全体の `on-run-start` hook |
| **Named middleware** | `app/middleware/foo.ts` + page で `definePageMeta({ middleware: 'foo' })` | 明示的に指定した page だけ実行 | model 個別の `pre-hook` |
| **Inline middleware** | page ファイル内に直接書く | その page だけ実行 | model 内の `{{ config(...) }}` インライン定義 |

なお Nuxt には別途 `server/middleware/**` (Nitro server middleware) もあるが、本 ADR の射程外
(MVP で server route を作らない方針のため、ADR-010 D2 / 採用しなかった選択肢参照)。

## 背景

auth-onboarding 単位 (REQ-101〜108) で全 page の認証ガードを実装する必要がある:

| 条件 | 期待動作 | 関連 REQ |
|------|---------|----------|
| 未認証 ユーザが保護 page にアクセス | `/login?redirect={path}` へリダイレクト | REQ-101 |
| ログイン済 + Group 未所属 ユーザが保護 page にアクセス | `/onboarding` へリダイレクト | REQ-102 |
| ログイン済 + Group 所属 ユーザが `/login` / `/onboarding` にアクセス | `/` へリダイレクト | REQ-103 |
| 未認証 ユーザが `/join/[code]` にアクセス | `/login?redirect=/join/[code]` へリダイレクト | REQ-108 |
| OAuth コールバック (`/confirm`) | 認証中ページとして表示 (リダイレクト判定対象外) | REQ-002 / REQ-203 |
| 公開 page (`/login`) | 常にアクセス可 (リダイレクト判定対象外) | REQ-001 |

これらの判定ロジックをどこに置くか:

- **A 案**: モジュール内蔵リダイレクト (`@nuxtjs/supabase` の `redirectOptions`) を主体に使う
- **B 案**: 自前 middleware で全分岐を制御 ← 本 ADR の採用案
- **C 案**: 複数の middleware (auth + groupRequired + 等) に分割し、page ごとに opt-in 指定

interview-record A1 で B 案 (単一 auth middleware) を仮決定済み (memory: ADR-010 D5 と整合)。
本 ADR で正式確定し、後続単位 (player-management 以降) の middleware 設計の規範とする。

## 決定

### D1: 単一 `auth.global.ts` で全分岐を判定する

`app/middleware/auth.global.ts` 1 ファイルで以下の判定をすべて行う:

```
[1] to.path が public path (/login, /confirm, /join/[code]) か?
     ├── Yes → 認証分岐対象外として early return (ただし「ログイン済 + Group 所属」例外あり)
     └── No  → ステップ 2 へ

[2] useSupabaseUser() で auth state を取得
     ├── null (未認証) → /login?redirect={to.path} へ navigateTo
     └── user 取得済   → ステップ 3 へ

[3] useCurrentGroup() で group_members を取得
     ├── 0 件 (Group 未所属) → to.path が「未所属許可 path」以外なら /onboarding へ navigateTo
     │                          未所属許可 path = /onboarding, /groups/new
     │                          (/groups/new は「未所属ユーザが Group を作って所属する」画面のため通す)
     └── 1 件 (Group 所属)   → ステップ 4 へ

[4] to.path が /onboarding ならば / へ navigateTo (REQ-103)
     (/login で Group 所属済 → / は public path 側 [1] で処理済のためここでは扱わない)
     それ以外 → そのまま page を表示
```

`/join/[code]` は **public path として early return** するが、page 内で `useSupabaseUser()` を見て
未認証なら `/login?redirect=/join/[code]` に redirect する処理を page 側で持つ
(REQ-108、page level の責務とする)。

### D2: named middleware / inline middleware は MVP では使わない

理由:
- auth-onboarding の判定ロジックは「auth state + group state」の組み合わせ判定で、
  page 個別の追加判定は MVP では存在しない
- named middleware を導入すると、新規 page を追加した時に「middleware を指定し忘れて保護漏れ」が起きる
  → global で全 page を強制的にカバーするほうが事故が少ない (NFR-104)
- page 側の `definePageMeta` には `middleware` を書かない (省略時 global のみ実行される)

Phase 2 以降で必要が出たら本 ADR を改訂する。具体的には:
- 「管理者専用 page」(role check が必要) → `admin.ts` named middleware
- 「特定 Group のメンバーのみアクセス可」(複数 Group 対応時) → `groupMember.ts` named middleware

### D3: `@nuxtjs/supabase` の内蔵リダイレクトは無効化する

ADR-010 D5 と整合。`nuxt.config.ts` の `supabase.redirect` を `false` に設定し、
モジュールが提供する自動リダイレクト middleware を完全に無効化する。

```ts
// nuxt.config.ts
supabase: {
  redirect: false,           // ← モジュール内蔵 middleware を無効化
  redirectOptions: {
    login: '/login',         // 設定値は維持 (signInWithOAuth の redirectTo デフォルト等で参照される)
    callback: '/confirm',
    exclude: []              // 無効化するため意味を持たないが、明示的に空配列
  },
  types: '~/types/supabase.ts'
}
```

**理由**:
- D1 の `auth.global.ts` と内蔵 middleware が二重実行されると、両者の発火順序・分岐が分かりにくくバグの温床
- 内蔵 middleware は「未認証 → /login」しか扱えず、Group 未所属判定 (REQ-102) を表現できない
- 「`exclude` で全画面網羅」はメンテ不能 (新規 page 追加時に exclude 漏れ → 保護漏れ事故)

### D4: middleware 内のデータ取得は ADR-010 D7 のキャッシュ機構を使う

middleware 内で `useSupabaseUser()` / `useCurrentGroup()` を呼んでも、`useAsyncData` /
`useState` のキャッシュにより **1 回のナビゲーションで 1 回しか DB クエリしない** ことを保証する
(NFR-002 と整合)。

```ts
// useCurrentGroup.ts の実装イメージ
export const useCurrentGroup = () => {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()

  return useAsyncData('current-group', async () => {
    if (!user.value) return null
    const { data, error } = await supabase
      .from('group_members')
      .select('group_id, groups(id, name)')
      .eq('user_id', user.value.id)
      .maybeSingle()
    if (error) throw error
    return data
  })
}
```

middleware と page の両方が同じキー (`'current-group'`) で呼ぶことで、middleware で取得した結果が
page でそのまま再利用される (SSR キャッシュ → CSR hydration の流れ)。

### D5: リダイレクトは `navigateTo` を使う

middleware 内のリダイレクトは Nuxt 標準の `navigateTo(path, { redirectCode: 302 })` を使用。
古い書き方の `return '/login'` (文字列 return) や手動 `throw createError(...)` は使わない。

```ts
// app/middleware/auth.global.ts (実装イメージ)
export default defineNuxtRouteMiddleware(async (to) => {
  const PUBLIC_PATHS = ['/login', '/confirm']
  const isPublicPath = PUBLIC_PATHS.includes(to.path) || to.path.startsWith('/join/')

  // ログイン済だが Group 未所属でも到達してよい path
  // (/onboarding = 動線の起点、/groups/new = ここで Group を作って所属する)
  const GROUP_OPTIONAL_PATHS = ['/onboarding', '/groups/new']

  const user = useSupabaseUser()

  if (isPublicPath) {
    // ログイン済 + Group 所属ユーザが /login にいる場合のみ / へ
    if (to.path === '/login' && user.value) {
      const { data: currentGroup } = await useCurrentGroup()
      if (currentGroup.value) return navigateTo('/')
    }
    return // 通常は public として通す
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

(上記はあくまで設計イメージ、最終実装は kairo-design で確定)

### D6: SSR / CSR 双方で動作することを前提とする

middleware は ADR-010 D1 の表で「isomorphic」レイヤーに位置し、SSR (初回ロード時の server 実行) と
CSR (`<NuxtLink>` 経由のクライアント navigation) の双方で同じコードが動く:

- 使ってよい API: `useSupabaseUser()` / `useSupabaseClient()` / `useAsyncData` / `navigateTo`
- 使ってはいけない API: `serverSupabaseClient(event)` (Nitro 専用、middleware には event がない)、
  `window.*` / `document.*` (SSR 時に存在しない)

ADR-010 D3 の isomorphic 原則を遵守する。

### D7: エラーハンドリング

middleware 内で例外が発生した場合の挙動:

- `useCurrentGroup` の Supabase クエリエラー → throw されると Nuxt の `error.vue` にフォールバック
- `error.vue` から `Sentry.captureException` で報告 (ADR-005 §D6)
- middleware 内で意図的に `try-catch` を書く必要はない (Supabase クエリのエラーは domain composable
  内で `{data, error}` 形に正規化される ADR-005 §D1。middleware は data のみ参照する想定)

### D8: テスト方針

middleware の分岐ロジックは Vitest で unit test する (NFR-301、ADR-012 で詳細化予定):

| テストケース | 入力 | 期待動作 |
|------------|------|---------|
| 未認証 + 保護 page アクセス | `user=null, to.path='/'` | `navigateTo('/login?redirect=/')` |
| ログイン済 + Group 未所属 + 保護 page | `user=X, currentGroup=null, to.path='/'` | `navigateTo('/onboarding')` |
| ログイン済 + Group 未所属 + /onboarding | `user=X, currentGroup=null, to.path='/onboarding'` | 通過 (未所属許可 path) |
| ログイン済 + Group 未所属 + /groups/new | `user=X, currentGroup=null, to.path='/groups/new'` | 通過 (未所属許可 path、Group 作成動線) |
| ログイン済 + Group 所属 + 保護 page | `user=X, currentGroup=G, to.path='/'` | 通過 (return なし) |
| ログイン済 + Group 所属 + /login | `user=X, currentGroup=G, to.path='/login'` | `navigateTo('/')` |
| ログイン済 + Group 所属 + /onboarding | `user=X, currentGroup=G, to.path='/onboarding'` | `navigateTo('/')` |
| 未認証 + /login | `user=null, to.path='/login'` | 通過 |
| 未認証 + /join/abc123 | `user=null, to.path='/join/abc123'` | 通過 (page 側で redirect 担当) |

`useSupabaseUser` / `useCurrentGroup` は mock する。境界値・分岐カバレッジのみで冗長ケースは書かない
(memory: feedback_test_coverage)。

## 理由

1. **「保護漏れゼロ」を構造的に保証** (D1 D2):
   global middleware で全 page を強制カバーする方式は、新規 page 追加時に「middleware 指定漏れで
   保護漏れ」が起きない。named middleware の opt-in 方式は柔軟だが事故リスクが高く、
   MVP の規模では global 一本のほうが安全 (NFR-104)
2. **二重ロジック排除** (D3):
   モジュール内蔵リダイレクトと自前 middleware の併用は「どっちが先に発火するか分からない」
   典型的なバグ温床。`supabase.redirect: false` で内蔵を切り、middleware に一本化することで
   挙動を予測可能にする
3. **重複クエリ防止** (D4):
   middleware で取得した auth + group state を page で再利用するには `useAsyncData` キャッシュが
   最もシンプル。Pinia 等の独自 state 層を入れずに Nuxt 標準機構で完結する (ADR-010 D7 と整合)
4. **後続単位への拡張余地** (D2 Phase 2 段落):
   現時点では single global で十分だが、将来「管理者専用 page」「複数 Group 対応時の active Group 判定」
   等で named middleware が必要になる可能性を明示。本 ADR は MVP 範囲の確定に留め、Phase 2 で改訂

### データエンジニアのアナロジー

- **global middleware** (D1) = dbt project 全体の `on-run-start`:
  すべての run で必ず実行される事前処理
- **named middleware** (D2、不採用) = model 個別の `pre-hook`:
  特定の model だけに付与する事前処理。柔軟だが「指定漏れ」リスクあり
- **`supabase.redirect: false`** (D3) = dbt の `config(enabled=false)`:
  モジュール内蔵機能の無効化を明示
- **`useAsyncData` キャッシュ** (D4) = dbt の同一 run 内でのモデル参照キャッシュ:
  同じ ref を複数モデルが参照しても再計算は 1 回
- **分岐カバレッジテスト** (D8) = dbt の `accepted_values` test:
  境界値と分岐の網羅、冗長な値の repeat は書かない

## 影響

### auth-onboarding 単位への影響

| 項目 | 影響 |
|------|------|
| `nuxt.config.ts` | `supabase.redirect: false` 追加 (新規)、`redirectOptions.exclude: []` に変更 |
| `app/middleware/auth.global.ts` (新規) | 本 ADR の D1 / D5 ロジックを実装 |
| `app/composables/useCurrentGroup.ts` (新規) | D4 の `useAsyncData('current-group', ...)` 形で実装 |
| `app/pages/join/[code].vue` (新規) | 未認証時の `/login?redirect=...` リダイレクトを page 側で実装 (D1 の例外扱い) |
| `tests/unit/middleware/auth.spec.ts` (新規) | D8 の分岐カバレッジテスト |

### 後続 UI 単位への影響

`player-management` / `match-management` / `match-recording` / `stats-dashboard` の page 追加時、
**middleware 設定を一切書かなくても auth.global.ts が自動でカバー** する。
特殊な権限制御 (例: Group 管理者のみアクセス可) が必要な page は本 ADR を改訂し、
named middleware を追加する。

### data-foundation への影響

なし (DB 側の変更はない)。

### `@nuxtjs/supabase` モジュール設定への影響

`supabase.redirect: false` の追加は本 ADR の決定事項。本 ADR の承認と同時に
`nuxt.config.ts` を変更する (auth-onboarding 実装着手前に反映)。

## 採用しなかった選択肢

| 案 | 却下理由 |
|---|---|
| A. モジュール内蔵リダイレクトを主、middleware を補助に | 「未認証 → /login」しか扱えず Group 未所属判定不可、二重ロジック化、デバッグ困難 (ADR-010 D5 と整合) |
| C. 複数 named middleware (auth + groupRequired) を分割 | 新規 page 追加時の指定漏れ → 保護漏れ事故リスク大。MVP の規模では global 一本で十分 |
| D. middleware を使わず page 内 `onMounted` でリダイレクト判定 | SSR で page 本体がレンダリングされてしまう (CSR hydration まで保護未適用)、SEO / セキュリティ NG |
| E. server middleware (`server/middleware/`) で判定 | Nitro レベルの middleware は Vue ルーティング前に走るが、`useSupabaseUser` 等の isomorphic composable が使えず実装複雑化。MVP では不要 |
| F. middleware で session refresh 等の副作用を起こす | middleware は「判定とリダイレクト」に責務限定。session 操作は `useLogin` 等の domain composable に閉じる |
| G. middleware を非同期で書かない (`await useCurrentGroup` しない) | Group 未所属判定が遅延 → 保護 page が一瞬表示される。SSR で同期的に待つのが正解 |

## 関連メモリ

- `[[project-adr-candidates-pre-kairo-design]]`: 本 ADR は候補リストの「優先度 高 / ADR-008」を確定するもの
- `[[feedback-test-coverage]]`: D8 のテスト方針 (境界値 + 分岐カバレッジ、冗長なし)

## 参考

- `@nuxtjs/supabase` 公式 docs (`redirect` / `redirectOptions` 設定): https://supabase.nuxtjs.org/
- Nuxt 公式 docs (Route Middleware): https://nuxt.com/docs/guide/directory-structure/middleware
- ADR-005 (エラーハンドリング戦略) §D1 §D6: composable 経由原則、Sentry 報告方針を継承
- ADR-006 (1 ユーザー = 1 Group 制約): D1 の「Group 所属 = 0 or 1 件」前提
- ADR-010 (Supabase SSR/CSR 境界規約) D5 D7: 内蔵リダイレクト不採用、`useAsyncData` キャッシュ方針を継承
- `docs/spec/auth-onboarding/requirements.md` REQ-101〜108, NFR-002, NFR-104
- `docs/spec/auth-onboarding/interview-record.md` Claude 主導仮決定 A1 (単一 auth middleware 兼用)
