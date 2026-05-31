# ADR-010: Supabase Client の SSR / CSR 境界規約

## ステータス
Accepted (2026-05-24)

## 背景

`@nuxtjs/supabase` モジュールは Nuxt 4 環境下で複数の client / composable を提供する:

- **isomorphic composable**: `useSupabaseClient()` / `useSupabaseUser()` / `useSupabaseSession()`
  (page / component / route middleware / domain composable から呼び出し可、SSR + CSR の双方で動作)
- **server-only function**: `serverSupabaseClient(event)` / `serverSupabaseUser(event)` /
  `serverSupabaseServiceRole(event)` (`server/api/**` / server middleware からのみ呼び出し可)
- **redirect 自動化**: `nuxt.config.ts` の `supabase.redirectOptions` 設定で
  「未認証時 `/login` リダイレクト」「OAuth callback `/confirm`」の動作をモジュールが内蔵

Nuxt 4 は SSR がデフォルトのため、同じ composable が server と client の双方で実行される。
クッキーベースのセッション共有・hydration mismatch 防止・prerender との衝突など、
誤って使うと「server で 1 つの user、client で別の user」「prerendered ページに認証ロジックが
焼き付かない」等の事故が起きやすい。

auth-onboarding 単位 (REQ-001〜REQ-110 + NFR-102/NFR-104) では `/login` / `/confirm` /
`/onboarding` / `/groups/new` / `/join/[code]` / `/groups/[id]/settings` の 6 page と
`auth.global.ts` middleware を実装する。実装着手前に **どの API をどのレイヤーで使うか / 使ってはいけないか**
を ADR として確定し、後続単位 (player-management / match-management / match-recording /
stats-dashboard) でも同一規約で進められるようにする。

本 ADR は ADR-005 §D1「page から `supabase.from(...)` 直接呼びは禁止、composable 経由」を
**前提として継承** し、その上で SSR / CSR 境界の詳細を定める。

## 決定

### D1: レイヤー別 API 選択 (使ってよい / よくない)

| レイヤー | 使用する API | 使ってはいけない API |
|---------|------------|--------------------|
| `pages/**.vue` (`<script setup>`) | composable 経由のみ (例: `useLogin()` `useCurrentGroup()`) | `useSupabaseClient().from(...)` / `.rpc(...)` 直接呼び出し (ADR-005 §D1 違反) |
| `components/**.vue` | composable 経由のみ | 同上 |
| `composables/**.ts` (domain composable) | `useSupabaseClient()` / `useSupabaseUser()` / `useSupabaseSession()` | `serverSupabaseClient` / `serverSupabaseServiceRole` (server-only)、`createClient` の手動呼び出し |
| `middleware/**.ts` (route middleware) | `useSupabaseClient()` / `useSupabaseUser()` (isomorphic 動作する) | server-only API、`navigateTo` 以外のリダイレクト方法 |
| `server/api/**.ts` (Nitro 内) | `serverSupabaseClient(event)` / `serverSupabaseUser(event)` / 必要時 `serverSupabaseServiceRole(event)` | isomorphic composable (Nitro context に存在しない) |
| `server/middleware/**.ts` | 同上 | 同上 |
| `tests/**` (Vitest / Playwright setup) | `@supabase/supabase-js` の `createClient` で **明示的に** service_role client を作成 (data-foundation TASK-0013 既存) | `serverSupabaseServiceRole` (Nitro event がない)、isomorphic composable |

### D2: service_role client は MVP では「test setup でのみ」

`sb_secret_*` (service_role) キーは RLS を bypass する。NFR-102 でクライアントバンドルへの
混入を禁止しており、本 ADR では **MVP の本番コードでは使用しない** ことを確定する。

- **使用箇所 (MVP)**: `tests/setup/create-test-users.ts` (data-foundation TASK-0013 で実装済) のみ
- **将来の使用検討**: Phase 2 で「招待リンクから join 前に Group メタ情報を anon でプレビュー」
  「管理者専用 server route」等が必要になったら、その時点で `serverSupabaseServiceRole(event)` の
  利用を ADR 改訂で許可。本 ADR の MVP スコープでは server route 自体を作らない方針
  (data-foundation/architecture.md §RPC 設計に従い、全てのデータ操作は RLS + RPC 経由で完結)

### D3: SSR / CSR isomorphic 原則

composable / middleware / page は **原則 isomorphic に書く** (server / client 両方で同じ結果を返す)。
`import.meta.client` / `import.meta.server` の分岐は以下の場合に限り許可:

- **許可ケース**:
  - `window.navigator.clipboard.writeText(...)` 等のブラウザ専用 API
    (REQ-007 招待リンクコピーボタン)
  - `supabase.auth.onAuthStateChange` の購読 (EDGE-004 セッション期限切れ検知、
    `onMounted` 内で client 限定登録)
- **禁止ケース**:
  - 認証状態の取得 (`useSupabaseUser()` / `useSupabaseSession()` は両環境で同値を返す)
  - リダイレクト判定 (`navigateTo()` は両環境で動作する)

`<ClientOnly>` は **最後の手段**。CLS 影響・SEO 不利益・ローディング UI の二重管理が発生する
ため、SSR で評価できない要素 (ブラウザ専用 API に依存する UI) のみに限定。

### D4: Hydration mismatch 防止

- `useSupabaseUser()` / `useSupabaseSession()` はモジュールが cookie ベースで SSR / CSR
  双方に同じ値を提供する。これに依存する分岐 (`v-if="user"`) は hydration safe
- `Date.now()` / `Math.random()` / `useRequestURL()` 等の **server / client で値が変わるもの**
  を render 内で評価しない。必要なら `useState` で固定するか、`onMounted` で client 側で
  上書きする (REQ-408 招待リンク URL の `useRequestURL().origin` 取得は SSR では request URL から、
  CSR では window.location から取得され同値になる前提 → 念のため SSR で評価し `useState` でキャッシュ)
- middleware 内で `await useSupabaseUser()` 値を読む場合、moduleが SSR 中に cookie から
  hydrate 済であることを前提とする (auth.global.ts は server hook で実行されるため値は確定済)

### D5: `redirectOptions` (モジュール内蔵リダイレクト) は **使わない**

`nuxt.config.ts` の `supabase.redirectOptions` で `login` / `callback` を指定しているが、
本 ADR では **モジュール内蔵の自動リダイレクトに頼らず、`auth.global.ts` middleware で
明示的に全分岐を制御する** 方針を確定する。

**理由**:
- モジュール内蔵リダイレクトは「未認証 → /login」のみで、「ログイン済 + Group 未所属 → /onboarding」
  「ログイン済 + Group 所属 → /」(REQ-101〜103) を扱えない → middleware で書き換えが必要 → 二重ロジック化
- 本 ADR では「auth + group_members の有無」を 1 middleware (ADR-008 候補で詳細化) で
  一元判定する方針 (interview-record A1 と整合)
- ただし `redirectOptions.callback: '/confirm'` の **設定値自体は維持** する (auth-onboarding が
  /confirm を OAuth callback URL として使う前提のため。モジュールはこの設定を
  `signInWithOAuth({ options: { redirectTo: ... }})` のデフォルト値 / Supabase Dashboard 登録 URL
  の整合確認に使う)

実装方針:
```ts
// nuxt.config.ts (現状維持、本 ADR で確定)
supabase: {
  redirectOptions: {
    login: '/login',
    callback: '/confirm',
    exclude: ['/login', '/confirm', '/join/**']
    // exclude を全画面分網羅するのは保守困難 → 結局 middleware が必要 → モジュール内蔵に頼らず middleware 一本化
  }
}
```

→ `redirectOptions.exclude` を「全画面網羅で全部 exclude」するか、`redirect: false` に近い扱いで
事実上無効化する設定は ADR-008 (middleware 戦略) で確定する。本 ADR の射程は「**頼らない方針** を
合意すること」までとする。

### D6: prerender / SSG と認証の整合

`nuxt.config.ts` の `routeRules` で `'/': { prerender: true }` が現状設定されている。
prerender されたページは **静的 HTML として build 時に生成され、middleware が実行されない**。
auth-onboarding の REQ-101 (`/` は保護ページで未認証 → `/login` リダイレクト) と矛盾する。

**決定**: `/` の prerender 設定を **削除する**。MVP の全 page は SSR 動的レンダリング前提とする。

**実装影響**:
- `nuxt.config.ts` から `routeRules: { '/': { prerender: true } }` を削除 (auth-onboarding 実装時)
- 将来 prerender したい public page (LP / 利用規約 / プライバシーポリシー等) が出てきたら、
  `/legal/**` 等の認証不要 path を切り、その path に限定して `prerender: true` を付ける

### D7: composable のデータ取得とキャッシュ

NFR-002「`useCurrentGroup()` は middleware から 1 リクエスト/ナビゲーションでのみ呼び出され、
SSR レンダリング中にキャッシュされる」を実現するため、以下の規約を定める:

- **データ取得 composable は `useAsyncData` または `useState` を内部で使う**
  - 例: `useCurrentGroup` は `useAsyncData('current-group', () => supabase.from('group_members')...)` で
    SSR/CSR 両対応 + 自動キャッシュ
- **page から composable を 2 回呼んでも 1 回しかクエリしない** ことを composable 側で保証する
- middleware で取得した結果を page で再利用するため、`useState('currentGroup')` の参照で
  middleware → page のデータ受け渡しを行う (Nuxt SSR キャッシュの透過利用)
- ただし「同一 page 内で fresh データが必要」(招待リンク発行直後に再取得など) は
  composable に `refresh()` を expose して明示再取得する

### D8: 型整合

- `app/types/supabase.ts` は `supabase gen types` で自動生成 (data-foundation TASK-0009 で確立)
- `useSupabaseClient<Database>()` で型を効かせる
- `composables/**` 内で `SupabaseClient<Database>` を引数に取るヘルパーは
  `app/types/supabase.ts` の `Database` 型を import して使用

## 理由

1. **SSR + CSR の事故予防**:
   `useSupabaseClient` と `serverSupabaseClient` の混同は実装中に頻繁に起きる典型エラー。
   レイヤー別表 (D1) で明示的に禁止 / 許可を分け、レビュー時の checklist として機能させる
2. **service_role の表面積最小化** (D2):
   MVP では server route を作らない設計のため、service_role が必要な箇所は test setup のみ。
   将来の拡張余地を残しつつ、現時点でのバンドル混入リスクをゼロに保つ
3. **hydration mismatch を「設計の問題」として扱う** (D3 D4):
   毎回事故が起きてから対処するのではなく、`import.meta.client` 分岐の許可ケースを ADR で
   絞り込むことで、コードレビュー時の判断基準を統一する
4. **モジュール内蔵リダイレクトの「使わない」明示** (D5):
   `redirectOptions` の自動リダイレクトと自前 middleware の二重ロジック化は典型的な
   保守不能パターン (どちらが先に発火するか分かりにくく、デバッグ困難)。ADR で
   「middleware 一本化」を確定し、ADR-008 でその middleware の詳細を詰める
5. **prerender と認証の整合** (D6):
   現状の `'/': { prerender: true }` は data-foundation 完了時点の暫定設定。
   auth-onboarding 着手で必ず矛盾するため、本 ADR で削除方針を確定して
   実装漏れ・後追い対応を防ぐ
6. **キャッシュは Nuxt 標準機構で透過利用** (D7):
   Pinia / 独自 store を導入せず、`useState` + `useAsyncData` で middleware → page の
   データ受け渡しを行う。MVP のスコープでは独自 state 層は過剰で、Nuxt の SSR キャッシュで
   十分対応可能

### データエンジニアのアナロジー

- **isomorphic composable (D1)** = dbt の `models/`: 環境 (dev/prd) や実行モード (full/incremental) に
  関わらず同じ結果を返すべきユニット。`import.meta.client` 分岐は最小に
- **server-only API (D1)** = Snowflake の stored procedure: 特定の実行コンテキスト
  (Nitro / server runtime) に閉じる。クライアント (BI tool) からは呼べない
- **service_role (D2)** = `OWNER` / `SECURITYADMIN` ロール: RLS bypass の強権限。
  使用箇所は最小限に絞り、本番コードに漏らさない
- **`useAsyncData` キャッシュ (D7)** = dbt の `materialized: incremental`: 同一実行内で
  再計算を避け、必要時のみ refresh する。
- **prerender (D6)** = `materialized: table` の build-time 実行: ビルド時に snapshot を作るため、
  runtime の動的判定 (認証状態) は表現できない。動的なものは `materialized: view` (= SSR) にする

## 影響

### auth-onboarding 単位への影響

| 項目 | 影響 |
|------|------|
| `nuxt.config.ts` | `routeRules: { '/': { prerender: true } }` 削除、`supabase.redirectOptions` は維持 |
| `app/middleware/auth.global.ts` (新規) | `useSupabaseUser()` + `useCurrentGroup()` で 3 分岐 (ADR-008 で詳細化) |
| `app/composables/useLogin.ts` (新規) | `useSupabaseClient().auth.signInWithOAuth(...)` を内包、page からの直接呼びを禁止 (ADR-007 で詳細化) |
| `app/composables/useCurrentGroup.ts` (新規) | `useAsyncData('current-group', ...)` で SSR/CSR 統合キャッシュ |
| `app/composables/useCreateGroup.ts` / `useJoinGroup.ts` / `useInvitation.ts` (新規) | `useSupabaseClient().rpc(...)` を内包 |
| `app/pages/index.vue` 既存 | `/` 保護ページ化に伴いテンプレート差し替え (auth-onboarding 単位で実施) |

### 後続 UI 単位への影響

`player-management` / `match-management` / `match-recording` / `stats-dashboard` の全 composable は
本 ADR の D1 表に従って実装する。server route を新規追加する場合は本 ADR の改訂が必要
(service_role 使用 / SSR データフェッチ等)。

### data-foundation への影響

- 修正なし (data-foundation は DB 側のみで、Nuxt 側は touch しないため)
- `app/types/supabase.ts` 自動生成パイプライン (TASK-0009) は本 ADR の D8 で前提として継承

### テストへの影響

- `tests/setup/create-test-users.ts` (TASK-0013 既存) で service_role client を明示的に
  `createClient(url, secret)` する方式は本 ADR D2 で正式化
- 後続の component / composable テストでは isomorphic composable を mock する規約を
  ADR-012 (テスト戦略の正式化) で詳細化

### 環境変数 / セキュリティ

- `NUXT_SUPABASE_SERVICE_KEY` (`sb_secret_*`) は **本番ビルドの環境変数として設定しない**
  (project_supabase_new_keys / feedback_strict_secret_policy)
- test 実行時のみシェル env / CI Secrets として注入

## 採用しなかった選択肢

| 案 | 却下理由 |
|---|---|
| Pinia + localStorage で auth state を独自管理 | `@nuxtjs/supabase` が cookie で同等機能を提供済、独自 store は二重実装。SSR/CSR 整合も module 側で吸収される |
| `redirectOptions` のモジュール内蔵リダイレクトを主、middleware を補助に使う | 「未認証 → /login」しか扱えず、3 分岐 (REQ-101〜103) を表現できない。結局 middleware で書き換えが必要 → 二重ロジック化、デバッグ困難 |
| `serverSupabaseServiceRole` を server route で本番利用 | MVP では server route 自体を作らない方針 (RPC + RLS で完結)。service_role の表面積拡大はセキュリティリスク増。Phase 2 で必要が出たら ADR 改訂 |
| `<ClientOnly>` を全 page にラップして hydration mismatch 回避 | CLS / SEO / ローディング UI 二重管理のデメリット大。Nuxt SSR の利点が消える |
| `import.meta.client` で全分岐を制御 (server / client 別実装) | コードが二系統に分岐、保守不能。isomorphic 原則 (D3) で書けば不要 |
| 全画面 prerender + クライアント側で auth 判定 | prerender 静的 HTML に「未認証ユーザに見せていい中身」が焼き付くリスク。SSR + middleware の保護が本来の正解 |

## 関連メモリ

- `[[project-supabase-new-keys]]`: 新 API キー (`sb_publishable_*` / `sb_secret_*`) の採用
- `[[feedback-strict-secret-policy]]`: secret はシェル env / CI Secrets のみで渡す
- `[[user-role]]`: user は data engineer、SSR / hydration 概念に不慣れ → 本 ADR で
  アナロジー説明・禁止ケースを明示
- `[[project-adr-candidates-pre-kairo-design]]`: 本 ADR は候補リストの「優先度 中 / ADR-010」を確定するもの

## 参考

- `@nuxtjs/supabase` 公式 docs: https://supabase.nuxtjs.org/
  - `useSupabaseClient` / `useSupabaseUser` / `serverSupabaseClient` / `serverSupabaseServiceRole` API
- ADR-001 (Nuxt + Nuxt UI 採用): Nuxt SSR デフォルトを前提として継承
- ADR-005 (エラーハンドリング戦略) §D1: composable 経由原則を継承
- ADR-006 (1 ユーザー = 1 Group 制約): `useCurrentGroup` 単一 composable で済む前提
- `docs/design/data-foundation/architecture.md` §Auth フロー: /confirm callback の Supabase 仕様
- `docs/spec/auth-onboarding/requirements.md` REQ-101〜108, NFR-102, NFR-104, NFR-002
