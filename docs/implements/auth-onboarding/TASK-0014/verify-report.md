# TASK-0014 設定確認・動作テスト

## 確認概要

- **タスクID**: TASK-0014
- **確認内容**: layouts/auth.vue + layouts/default.vue の動作確認
- **実行日時**: 2026-06-01
- **実行者**: Claude (tsumiki:direct-verify)

## 設定確認結果

### 1. 作成ファイル確認

**確認ファイル**: `app/layouts/auth.vue`, `app/layouts/default.vue`

**確認結果**:

- [x] `app/layouts/auth.vue` が存在する
- [x] `app/layouts/default.vue` が存在する

---

## コンパイル・構文チェック結果

### 1. TypeScript 型チェック

```bash
pnpm typecheck
# → EXIT_CODE:0 (エラーなし)
```

**チェック結果**:

- [x] `pnpm typecheck` 正常終了 (EXIT_CODE:0)
- [x] TypeScript 型エラー: なし

---

## 動作テスト結果

### 1. auth.vue — 中央寄せ・ロゴのみ・ヘッダーなし検証

```
app/layouts/auth.vue を目視確認
```

**確認結果**:

- [x] `UMain class="flex min-h-screen items-center justify-center"` — 縦横中央寄せ実装済み
- [x] `UHeader` は存在しない — ヘッダーなし ✅
- [x] `AppLogo` コンポーネントが配置されている — ロゴのみ ✅
- [x] `UAvatar` / ログアウトボタンは存在しない — ユーザアバター・ログアウトなし ✅
- [x] `<slot />` が `UMain` 配下に存在する
- [x] `definePageMeta({ layout: 'auth' })` の付与は TASK-0015 で行うため未着地でよい

### 2. default.vue — ヘッダー構成検証

**確認結果**:

- [x] `UHeader` が存在する — ヘッダーあり ✅
- [x] `#left` スロットに `AppLogo` (NuxtLink) を配置 — ロゴ ✅
- [x] `#right` スロットに `UAvatar` を配置 — ユーザアバター ✅
- [x] `#right` スロットに `UButton` (ログアウト) を配置 ✅
- [x] `<slot />` が `UMain` 配下に存在する

### 3. ログアウト実装の検証

```vue
const { logout, pending } = useLogin()
<!-- @click="logout()" -->
```

**確認結果**:

- [x] `useLogin().logout()` 経由でログアウトしている (REQ-406 / ADR-011 D2) ✅
- [x] `supabase.auth.signOut()` を直接呼んでいない ✅
- [x] `pending` によるローディング状態・二重送信防止が実装されている (EDGE-003) ✅

### 4. ユーザアバター表示の検証

```vue
const user = useSupabaseUser()
const userDisplayName = computed(() => {
  return user.value?.user_metadata?.full_name
    ?? user.value?.user_metadata?.name
    ?? user.value?.email
    ?? ''
})
const userAvatarUrl = computed<string | undefined>(() => {
  return user.value?.user_metadata?.avatar_url ?? undefined
})
```

**確認結果**:

- [x] `useSupabaseUser()` の Google identity から `full_name` / `name` / `email` を表示名として使用 (REQ-006 read only) ✅
- [x] `avatar_url` を `UAvatar` の `src` に渡している ✅

### 5. locales キー構造一致チェック

```bash
node -e "
const ja = require('./i18n/locales/ja.json');
const en = require('./i18n/locales/en.json');
// キー一覧抽出 + 比較
"
# → KEY STRUCTURE: MATCH
```

**確認結果**:

- [x] `layout.default.logout` — ja/en 両方に存在 ✅
- [x] `layout.default.avatar.alt` — ja/en 両方に存在 ✅
- [x] ja と en のキー構造が完全に一致 ✅

### 6. locales 経由の文言取得検証

```vue
const { t } = useI18n()
:label="t('layout.default.logout')"
:aria-label="t('layout.default.logout')"
```

**確認結果**:

- [x] ログアウトボタンのラベルが `t('layout.default.logout')` 経由 (NFR-204) ✅
- [x] アバターの alt が `t('layout.default.avatar.alt')` 経由 (NFR-204) ✅
- [x] ロゴの aria-label が `t('app.name')` 経由 ✅

---

## 品質チェック結果

- [x] ログアウトは `default.vue` ヘッダーに 1 箇所のみ集約 (ADR-011 D2 / REQ-008)
- [x] 認証後の全 page が無指定で `default.vue` を自動適用する構造
- [x] 後続 page を追加してもヘッダー + ログアウトが自動継承される (NFR-104 思想)
- [x] TypeScript strict mode 対応: `computed<string | undefined>` 等の明示型付け

---

## 全体的な確認結果

- [x] 設定作業が正しく完了している
- [x] 全ての動作テストが成功している
- [x] 品質基準を満たしている
- [x] 次のタスク (TASK-0015) に進む準備が整っている

---

## 発見された問題と解決

特になし。全検証項目が正常に通過。

---

## 推奨事項

- TASK-0015 完了後、`/login`・`/confirm` への `definePageMeta({ layout: 'auth' })` 付与と `pnpm dev` 目視確認を実施すること。
- `/join/[code]` は未ログイン着地パスだが `default.vue` を使用する設計であり、認証リダイレクトは middleware で担保される点を TASK-0020 受入検証時に確認すること。

---

## 次のステップ

- TASK-0014 完了 → TASK-0015 (`/login` + `/confirm` pages) の実装に進む

---

## CLAUDE.mdへの記録内容

既存の CLAUDE.md にテスト・ビルドコマンドが記載済みのため、追記は不要。
