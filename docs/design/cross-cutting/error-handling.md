# エラーハンドリング戦略 (実装規約)

> 判断記録は [ADR-005](../../decisions/005-error-handling-strategy.md) を参照。
> 本書は実装者が「どう書くか」を確認する一次資料。

---

## 1. 全体像: 5 層モデル

```
[1] 発生源    どこで生まれたか (Supabase / $fetch / Auth / Validation / Vue render)
   ↓
[2] 識別      どのエラーか確定する (識別子・SQLSTATE・HTTP code・型)
   ↓
[3] 変換      ユーザー向け文言に翻訳する (辞書 / i18n)
   ↓
[4] 提示      どのチャネルで出すか (toast / inline / banner / full-page)
   ↓
[5] 復帰      何で戻るか (再試行 / リダイレクト / キャンセル)
```

各論点と層の対応:

| ADR-005 の論点 | 対応する層 | 本書の章 |
|---|---|---|
| D1 伝搬パターン | 層 1↔2 境界 | §4, §5.5 |
| D2 識別子集約 | 層 2 | §4 |
| D3 変換位置 | 層 3 | §5 |
| D4 UI チャネル | 層 4 | §6 |
| D5 i18n | 層 3 の運用 | §7 |
| D6 ロギング | 層 1〜5 横断 | §8 |

---

## 2. MVP のエラー発生源カタログ

| カテゴリ | 例 | 発生する単位 | 性質 |
|---|---|---|---|
| A. Supabase DB / RPC | RLS 拒否、UNIQUE/CHECK/FK 違反、`RAISE EXCEPTION` | 全単位 | `{data, error}` |
| B. Supabase Auth | ログイン失敗、トークン期限切れ、OAuth | auth-onboarding | `{data, error}` |
| C. フォーム入力検証 | 必須未入力、文字数超過 (Zod) | auth-onboarding 以降 | クライアント同期検出 |
| D. 外部 API / SDK | YouTube IFrame ロード失敗、HTML5 video エラー | video-playback, match-recording | コールバック/イベント |
| E. ドメインロジック例外 | rule-engine 想定外状態 | match-recording 等 | 純 TS の throw |
| F. ネットワーク全般 | オフライン、タイムアウト | 全単位 | Supabase が吸収する場合多し |
| G. プログラミングバグ | undefined.foo、Hydration mismatch | 全単位 | Vue が `vue:error` で拾う |

主役: **A + B + C + D**。E/F/G は基本ガード or `error.vue` フォールバック。

---

## 3. 設計原則 (9 項目、勝手に逸脱しない)

1. **page から Supabase 直接呼びは禁止** — 必ず composable 経由
2. **composable は `{data, error}` 形を維持** — Supabase native をなるべく素直に
3. **識別子は const 集約、生文字列の比較禁止** — タイポ防止、grep 容易化
4. **App 識別子は 1:1 マッピング、PG SQLSTATE のみ context** — context 認知負荷を domain composable に閉じる
5. **文言は locale JSON に集約** — i18n 前提、TS コードに文字列リテラル禁止
6. **ライブラリ追加は最小限** — neverthrow 等は不採用、既存エコシステムに乗る
7. **エラー UI は決定木で判断、文書のマトリクスは網羅しない** — 新発生源は決定木で吸収、文書更新不要
8. **チャネル別 composable で型強制** — `useFormErrors` / `useNoticeErrors` / `useToastErrors` の 3 種で判断ミス削減
9. **Vue/Nuxt エコシステムに乗る** — `error.vue` / `showError()` / `<NuxtErrorBoundary>` / `useToast()` 等は throw 前提のまま使う

---

## 4. 識別子の集約 (D2)

### 4.1 ファイル: `app/types/error-codes.ts`

```ts
// App 側ドメインエラー (DB 側 RAISE EXCEPTION のメッセージと 1:1)
export const APP_ERROR_CODES = {
  NOT_AUTHENTICATED: 'not_authenticated',
  NOT_A_MEMBER: 'not_a_member',
  INVALID_GROUP_NAME: 'invalid_group_name',
  // MVP: URL 直リンク着地のみ。将来手入力フォームを追加する場合は _BY_CODE を別識別子として定義
  INVITATION_NOT_FOUND_BY_LINK: 'invitation_not_found_by_link',
  INVITATION_EXPIRED: 'invitation_expired',
  INVITATION_CODE_COLLISION_AFTER_RETRY: 'invitation_code_collision_after_retry',
} as const

export type AppErrorCode = typeof APP_ERROR_CODES[keyof typeof APP_ERROR_CODES]

// PostgreSQL SQLSTATE (PG 標準コード、変わらない)
export const PG_ERROR_CODES = {
  UNIQUE_VIOLATION: '23505',
  FK_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  RLS_REJECTED: '42501',
} as const

export type PgErrorCode = typeof PG_ERROR_CODES[keyof typeof PG_ERROR_CODES]

// PG エラーで context による出し分けが必要な場合に使う
// App 識別子は 1:1 マッピングのため context を使わない
export type ErrorContext = 'join_group' | 'create_group' | 'generic'

export function isAppError(error: unknown, code: AppErrorCode): boolean {
  return typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof (error as { message: unknown }).message === 'string'
    && (error as { message: string }).message.includes(code)
}

export function isPgError(error: unknown, code: PgErrorCode): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code: unknown }).code === code
}
```

### 4.2 識別子追加手順

1. DB 側で `RAISE EXCEPTION 'new_error_code'` を追加
2. `APP_ERROR_CODES` に 1 行追加: `NEW_ERROR_CODE: 'new_error_code'`
3. `useErrorMessage` の switch に分岐追加 (§5.1 参照)
4. `locales/ja.json` の `errors.new_error_code` に文言追加

---

## 5. 変換レイヤー (D3 X2 + X4)

### 5.1 `useErrorMessage` 実装

```ts
// app/composables/useErrorMessage.ts
import * as Sentry from '@sentry/nuxt'
import {
  APP_ERROR_CODES,
  PG_ERROR_CODES,
  isAppError,
  isPgError,
  type ErrorContext,
} from '~/types/error-codes'

export function useErrorMessage() {
  const { t, te } = useI18n()

  // PG SQLSTATE 用: context キーがなければ generic にフォールバック
  function tWithContext(base: string, ctx: ErrorContext): string {
    const ctxKey = `${base}.${ctx}`
    return t(te(ctxKey) ? ctxKey : `${base}.generic`)
  }

  function errorToMessage(
    error: unknown,
    pgContext: ErrorContext = 'generic',
  ): string {
    // App 識別子 (1:1、context 不要)
    if (isAppError(error, APP_ERROR_CODES.NOT_AUTHENTICATED))
      return t('errors.not_authenticated')
    if (isAppError(error, APP_ERROR_CODES.NOT_A_MEMBER))
      return t('errors.not_a_member')
    if (isAppError(error, APP_ERROR_CODES.INVALID_GROUP_NAME))
      return t('errors.invalid_group_name')
    if (isAppError(error, APP_ERROR_CODES.INVITATION_NOT_FOUND_BY_LINK))
      return t('errors.invitation_not_found_by_link')
    if (isAppError(error, APP_ERROR_CODES.INVITATION_EXPIRED))
      return t('errors.invitation_expired')
    if (isAppError(error, APP_ERROR_CODES.INVITATION_CODE_COLLISION_AFTER_RETRY))
      return t('errors.invitation_code_collision_after_retry')

    // PG SQLSTATE (context で出し分け)
    if (isPgError(error, PG_ERROR_CODES.UNIQUE_VIOLATION))
      return tWithContext('errors.unique_violation', pgContext)
    if (isPgError(error, PG_ERROR_CODES.FK_VIOLATION))
      return tWithContext('errors.fk_violation', pgContext)
    if (isPgError(error, PG_ERROR_CODES.CHECK_VIOLATION))
      return tWithContext('errors.check_violation', pgContext)
    if (isPgError(error, PG_ERROR_CODES.RLS_REJECTED))
      return t('errors.rls_rejected')

    // fallthrough: 識別子定義漏れの可能性 → Sentry 報告 (D6)
    Sentry.captureException(error, {
      tags: { reason: 'unmapped_error_code' },
    })
    return t('errors.generic')
  }

  return { errorToMessage }
}
```

### 5.2 App 識別子の 1:1 ルール

文脈で文言が変わるなら **識別子を細分化** する。context で済まそうとしない。

例: 招待コードが見つからないケース
- ❌ `INVITATION_NOT_FOUND` 1 つで context 出し分け
- ✅ MVP は `INVITATION_NOT_FOUND_BY_LINK` (URL 直リンク着地) のみ定義。将来手入力フォームを追加する場合は `_BY_CODE` を別識別子として定義

理由: page から context 文字列を完全に排除。grep で識別子→文言の使用箇所を一発追跡可能。
DB 側の `RAISE EXCEPTION` も同じ識別子を出す。

### 5.3 PG SQLSTATE の context 出し分け

PG SQLSTATE は構造上 context 不可避 (`23505` は name にも email にも複数 constraint で発生)。
識別子細分化が不可能なため、context で出し分けるしかない。

```jsonc
{
  "errors": {
    "unique_violation": {
      "generic": "既に存在します",
      "join_group": "すでに参加済みです",
      "create_group": "同じ名前のグループがすでに存在します"
    }
  }
}
```

### 5.4 locale JSON 構造

- **App 識別子はフラット**: `errors.invitation_not_found_by_link`
- **PG SQLSTATE はツリー**: `errors.unique_violation.{generic, join_group, create_group}`

```jsonc
// locales/ja.json (抜粋)
{
  "errors": {
    "generic": "予期しないエラーが発生しました",
    "not_authenticated": "ログインが必要です",
    "not_a_member": "このグループのメンバーではありません",
    "invalid_group_name": "グループ名は 1〜50 文字で入力してください",
    "invitation_not_found_by_link": "招待リンクが無効です。発行者にご確認ください",
    "invitation_expired": "招待コードの有効期限が切れています",
    "invitation_code_collision_after_retry": "招待コードの生成に失敗しました。再度お試しください",
    "rls_rejected": "操作する権限がありません",
    "unique_violation": {
      "generic": "既に存在します",
      "join_group": "すでに参加済みです",
      "create_group": "同じ名前のグループがすでに存在します"
    },
    "fk_violation": {
      "generic": "関連するデータが見つかりません"
    },
    "check_violation": {
      "generic": "入力値が不正です"
    }
  }
}
```

### 5.5 domain composable で context を閉じる (X4)

context 文字列は **domain composable 内に閉じる**。page には素の文言だけ返す。

```ts
// app/composables/useJoinGroup.ts
export function useJoinGroup() {
  const supabase = useSupabaseClient()
  const { errorToMessage } = useErrorMessage()
  const errorMessage = ref<string | null>(null)

  async function join(code: string) {
    errorMessage.value = null
    const { data, error } = await supabase.rpc('join_group_with_code', {
      invite_code: code,
    })
    if (error) {
      errorMessage.value = errorToMessage(error, 'join_group')
      return { data: null, error }
    }
    return { data, error: null }
  }

  return { join, errorMessage }
}
```

```vue
<!-- app/pages/join/[code].vue (招待リンク着地ページ、実パスは auth-onboarding 単位で確定、page 側は context 文字列ゼロ) -->
<script setup lang="ts">
const { join, errorMessage } = useJoinGroup()
</script>
```

---

## 6. UI チャネル決定木 (D4 M2)

### 6.1 Nuxt UI チャネル一覧

| # | チャネル | 表示位置 | 自動消滅 | 使い所 |
|---|---|---|---|---|
| 1 | `<UFormGroup>` inline error | フォームのフィールド直下 | ❌ (再入力でクリア) | フィールド単位の入力検証/サーバエラー |
| 2 | `useToast()` | 画面右上 (デフォルト) | ✅ (数秒) | 一過性の通知 |
| 3 | `<UAlert>` | ページ内任意 (普通は上部) | ❌ (明示クリアまで) | 永続的な状態通知 |
| 4 | `<NuxtErrorBoundary>` | 子要素の場所 (catch 時に fallback で置換) | — | セクション単位 catch |
| 5 | `error.vue` | ページ全体を置換 | — (`clearError()` まで) | 想定外例外の最終フォールバック |
| 6 | `navigateTo()` / `showError()` | 補助 (経路操作) | — | リダイレクト / fullpage 強制 |

### 6.2 決定木フローチャート

```
エラーが発生
  │
  ├─ フォーム内?
  │    │
  │    ├─ Yes → フィールド原因が特定可能?
  │    │         ├─ Yes → ① <UFormGroup> inline
  │    │         └─ No  → ② <UAlert> (フォーム上部)
  │    │
  │    └─ No  → 永続的に表示すべき (offline / メンテ等)?
  │              ├─ Yes → ③ <UAlert> (画面上部)
  │              └─ No  → ④ useToast()
  │
  ├─ 認証必須/セッション切れ?
  │    └─ ⑤ navigateTo('/login') + useToast()
  │
  ├─ 特定 widget を局所的に落としたい (Phase 2+)?
  │    └─ ⑥ <NuxtErrorBoundary>
  │
  └─ 想定外バグ (undefined.foo / Hydration)?
       └─ ⑦ error.vue + Sentry (§8)
```

### 6.3 代表例 7 行 (網羅でなく決定木の使い方の例示)

| # | 決定木の分岐 | 発生源 | 推奨チャネル |
|---|---|---|---|
| 1 | inline (フィールド原因明確 / Zod) | グループ名 1〜50 文字 / 必須 | `<UFormGroup>` |
| 2 | inline (フィールド原因明確 / RPC) | グループ作成 UNIQUE 違反 | `<UFormGroup>` |
| 3 | `<UAlert>` ページ上部 (招待リンク着地、フィールド特定不能) | 招待リンク `INVITATION_NOT_FOUND_BY_LINK` / `INVITATION_EXPIRED` | `<UAlert>` |
| 4 | 認証必須/セッション切れリダイレクト | `NOT_AUTHENTICATED` / セッション期限切れ | `navigateTo('/login')` + `useToast()` |
| 5 | `useToast()` (フォーム外、一過性) | 権限エラー (`NOT_A_MEMBER` / `RLS_REJECTED`) / Rate limit | `useToast()` |
| 6 | `<UAlert>` 画面上部 (永続通知) | offline 検出 | `<UAlert>` |
| 7 | `error.vue` (想定外フォールバック) | `undefined.foo` / Hydration mismatch | `error.vue` + Sentry (§8) |

### 6.4 チャネル別 composable

ユーザが能動的にエラーをセットするチャネル (3 種) ごとに専用 composable を提供。
**型でチャネルを強制** することで決定木の判断ミスを防ぐ。

```ts
// app/composables/useFormErrors.ts (<UFormGroup> inline 用)
import type { ErrorContext } from '~/types/error-codes'

export function useFormErrors() {
  const fieldErrors = ref<Record<string, string>>({})
  const { errorToMessage } = useErrorMessage()

  function setFieldError(field: string, error: unknown, pgContext?: ErrorContext) {
    fieldErrors.value[field] = errorToMessage(error, pgContext)
  }

  function clear(field?: string) {
    if (field) delete fieldErrors.value[field]
    else fieldErrors.value = {}
  }

  return { fieldErrors, setFieldError, clear }
}
```

```ts
// app/composables/useNoticeErrors.ts (<UAlert> 用、フォーム上部 / 画面上部 共通)
import type { ErrorContext } from '~/types/error-codes'

export function useNoticeErrors() {
  const notice = ref<string | null>(null)
  const { errorToMessage } = useErrorMessage()

  function setNotice(error: unknown, pgContext?: ErrorContext) {
    notice.value = errorToMessage(error, pgContext)
  }

  function clear() {
    notice.value = null
  }

  return { notice, setNotice, clear }
}
```

```ts
// app/composables/useToastErrors.ts (useToast 用、一過性)
import type { ErrorContext } from '~/types/error-codes'

export function useToastErrors() {
  const toast = useToast()
  const { errorToMessage } = useErrorMessage()

  function showError(error: unknown, pgContext?: ErrorContext) {
    toast.add({
      title: errorToMessage(error, pgContext),
      color: 'red',
    })
  }

  return { showError }
}
```

`<NuxtErrorBoundary>` / `error.vue` / `navigateTo()` は Vue/Nuxt 側仕組み or
補助のため composable 不要。

### 6.5 domain composable での使い分け例 3 種

```ts
// useJoinGroup.ts (代表例 #3 → useNoticeErrors)
export function useJoinGroup() {
  const supabase = useSupabaseClient()
  const { notice, setNotice, clear } = useNoticeErrors()

  async function join(code: string) {
    clear()
    const { data, error } = await supabase.rpc('join_group_with_code', {
      invite_code: code,
    })
    if (error) setNotice(error, 'join_group')
    return { data, error }
  }

  return { join, notice }
}
```

```ts
// useCreateGroup.ts (代表例 #2 → useFormErrors)
export function useCreateGroup() {
  const supabase = useSupabaseClient()
  const { fieldErrors, setFieldError, clear } = useFormErrors()

  async function create(name: string) {
    clear()
    const { data, error } = await supabase.from('groups').insert({ name })
    if (error) setFieldError('name', error, 'create_group')
    return { data, error }
  }

  return { create, fieldErrors }
}
```

```ts
// useSwitchGroup.ts (代表例 #5 → useToastErrors)
export function useSwitchGroup() {
  const supabase = useSupabaseClient()
  const { showError } = useToastErrors()

  async function switchTo(groupId: string) {
    const { data, error } = await supabase.rpc('switch_group', {
      group_id: groupId,
    })
    if (error) showError(error)
    return { data, error }
  }

  return { switchTo }
}
```

### 6.6 新発生源を追加するとき

1. 決定木に従って使う composable (`useFormErrors` / `useNoticeErrors` / `useToastErrors`) を選ぶ
2. domain composable で呼ぶ
3. **本書の文書更新は不要**

例 (将来 Storage アップロード失敗が出てきたら):
- 「フォーム内?」→ 通常 No
- 「永続表示すべき?」→ アップロード再開フォーム上で永続表示したい → `<UAlert>`
- → 結論: `useNoticeErrors` を使う、コードに書くだけ

---

## 7. i18n セットアップ (D5)

### 7.1 導入

```bash
pnpm add @nuxtjs/i18n
```

### 7.2 `nuxt.config.ts`

```ts
export default defineNuxtConfig({
  modules: ['@nuxtjs/i18n'],
  i18n: {
    locales: [
      { code: 'ja', file: 'ja.json', name: '日本語' },
      { code: 'en', file: 'en.json', name: 'English' },  // ハコだけ用意
    ],
    defaultLocale: 'ja',
    strategy: 'no_prefix',           // URL に locale prefix 付けない (社内ツール)
    detectBrowserLanguage: false,    // 常に ja で起動 (en は dev 専用)
    langDir: 'locales/',
  },
})
```

### 7.3 `locales/ja.json` と `locales/en.json`

`ja.json` を主軸に書く。`en.json` は **キー構造だけコピー** して値は空文字
(`""`) または `[en]` プレースホルダ (将来翻訳の作業しやすさ優先)。

```jsonc
// locales/en.json (ハコ)
{
  "errors": {
    "generic": "[en] An unexpected error occurred",
    "not_authenticated": "",
    "not_a_member": "",
    "invalid_group_name": "",
    "invitation_not_found_by_link": "",
    "invitation_expired": "",
    "invitation_code_collision_after_retry": "",
    "rls_rejected": "",
    "unique_violation": {
      "generic": "",
      "join_group": "",
      "create_group": ""
    }
  }
}
```

### 7.4 dev での en 切替

- URL クエリ: `?locale=en`
- Vue DevTools コンソールから: `useI18n().setLocale('en')`

prd では切替 UI を提供しない (社内ツール 1 言語固定)。

### 7.5 Nuxt UI v3 統合

Nuxt UI v3 は `@nuxtjs/i18n` と統合済 (`ui.locale.messages.ja` 等)。
別途設定不要だが、実装時に `@nuxt/ui` 公式ドキュメントで再確認すること。

---

## 8. ロギング・観測 (D6)

### 8.1 導入

```bash
pnpm add @sentry/nuxt
```

### 8.2 `nuxt.config.ts`

```ts
export default defineNuxtConfig({
  modules: ['@sentry/nuxt/module'],
  sentry: {
    dsn: process.env.NUXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NUXT_PUBLIC_ENV ?? 'development',
    tracesSampleRate: 0,           // Performance: Phase 2 で有効化
    replaysSessionSampleRate: 0,   // Session Replay: Phase 2 で有効化
    replaysOnErrorSampleRate: 0,
  },
})
```

### 8.3 環境変数

`.env`:
```
NUXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/yyy
NUXT_PUBLIC_ENV=development
```

`.env.example` (git 管理):
```
NUXT_PUBLIC_SENTRY_DSN=
NUXT_PUBLIC_ENV=development
```

prd デプロイ環境では `NUXT_PUBLIC_ENV=production` を設定する。

### 8.4 報告ポイント

#### `error.vue` (グローバルフォールバック)

```vue
<!-- app/error.vue -->
<script setup lang="ts">
import * as Sentry from '@sentry/nuxt'
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

onMounted(() => {
  Sentry.captureException(props.error)
})
</script>
```

#### `useErrorMessage` の fallthrough (識別子定義漏れ早期検知)

§5.1 のコード参照。`tags: { reason: 'unmapped_error_code' }` を付ける。

#### `<NuxtErrorBoundary>` (Phase 2 以降)

```vue
<NuxtErrorBoundary @error="onError">
  <SomeWidget />
  <template #error="{ error }">
    <UAlert>このセクションでエラーが発生しました</UAlert>
  </template>
</NuxtErrorBoundary>

<script setup lang="ts">
import * as Sentry from '@sentry/nuxt'
function onError(error: unknown) {
  Sentry.captureException(error)
}
</script>
```

### 8.5 dev も送信、environment タグで分離

dev からも Sentry に送信する (本番出る前の事故を検知するため)。
Sentry Dashboard 側で `environment:development` を filter してメインビューから外す運用。

完全に dev 送信を止めたい場合は:
```ts
dsn: process.env.NODE_ENV === 'production'
  ? process.env.NUXT_PUBLIC_SENTRY_DSN
  : undefined,
```
本プロジェクトは「dev も送信」を採用したため上記設定は **不要**。

### 8.6 Source map upload

`@sentry/nuxt` がビルド時に自動アップロード。CI に `SENTRY_AUTH_TOKEN` を渡す
(デプロイ環境構築時に設定)。

---

## 9. 拡張時のチェックリスト (新エラー発生時の手順)

新しいエラー発生源・識別子を追加するときの手順。

1. **識別子定数を追加** (§4)
   - DB 側: `RAISE EXCEPTION 'new_error_code'`
   - TS 側: `APP_ERROR_CODES.NEW_ERROR_CODE: 'new_error_code'` を 1 行追加
2. **発生源用 composable** を作って `{data, error}` 形に正規化 (§3 原則 2)
3. **`locales/ja.json` の `errors.new_error_code`** に文言追加 (§5.4)
   - App 識別子はフラット、PG SQLSTATE はツリー
4. **UI チャネルを決定木で判断** (§6.2)、`useFormErrors` / `useNoticeErrors` / `useToastErrors` のいずれかを domain composable で呼ぶ
5. **page / component は変更不要**

→ 改修コストが線形 (O(N)) に保たれる。

---

## 10. ファイル配置リファレンス

| ファイル | 役割 | 章 |
|---|---|---|
| `app/types/error-codes.ts` | 識別子定数 + 型 + ガード | §4 |
| `app/composables/useErrorMessage.ts` | 識別子 → 文言変換 (i18n + Sentry fallthrough) | §5.1 |
| `app/composables/useFormErrors.ts` | `<UFormGroup>` inline 用 | §6.4 |
| `app/composables/useNoticeErrors.ts` | `<UAlert>` 用 | §6.4 |
| `app/composables/useToastErrors.ts` | `useToast` 用 | §6.4 |
| `app/composables/use{Domain}.ts` | 各 domain composable (chain 別 composable を内部で呼ぶ) | §5.5, §6.5 |
| `app/error.vue` | グローバルフォールバック (Sentry 報告) | §8.4 |
| `locales/ja.json` | 文言 (主軸) | §5.4 |
| `locales/en.json` | 文言 (ハコ) | §7.3 |
| `nuxt.config.ts` | i18n / Sentry 設定 | §7.2, §8.2 |
| `.env` / `.env.example` | DSN / environment | §8.3 |

---

## 11. 関連文書

- [ADR-005 エラーハンドリング戦略 (判断記録)](../../decisions/005-error-handling-strategy.md)
- [data-foundation アーキテクチャ](../data-foundation/architecture.md)
- [data-foundation API エンドポイント (RPC のエラー仕様)](../data-foundation/api-endpoints.md)
