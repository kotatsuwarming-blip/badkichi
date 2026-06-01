# TASK-0014 設定作業実行

## 作業概要

- **タスクID**: TASK-0014
- **作業内容**: layouts/auth.vue + layouts/default.vue の新規作成、locales キー追加
- **実行日時**: 2026-06-01
- **タスクタイプ**: DIRECT

## 設計文書参照

- **参照文書**:
  - `docs/tasks/auth-onboarding/TASK-0014.md`
  - `docs/design/auth-onboarding/architecture.md` — §レイアウト戦略、§画面構成、§ディレクトリ構造
- **関連ADR**: ADR-011 (レイアウト戦略)、ADR-007 (composable規約)、ADR-008 (middleware)
- **関連要件**: REQ-006, REQ-008, REQ-406, NFR-104, NFR-204

## 実行した作業

### 1. ディレクトリ作成

```bash
mkdir -p app/layouts
mkdir -p docs/implements/auth-onboarding/TASK-0014
```

### 2. auth.vue の作成

**作成ファイル**: `app/layouts/auth.vue`

- 中央寄せ・ロゴのみ・ヘッダーなしの認証前レイアウト
- `UMain` + flexbox で縦横中央寄せを実現 (`min-h-screen items-center justify-center`)
- `AppLogo` コンポーネントと `<slot />` のみ配置
- ユーザアバター・ログアウトは存在しない (ADR-011 D1)
- `/login`, `/confirm` が `definePageMeta({ layout: 'auth' })` で使用 (TASK-0015 で付与)

### 3. default.vue の作成

**作成ファイル**: `app/layouts/default.vue`

- `UHeader` (ロゴ + ユーザアバター + ログアウト) + `UMain` + `<slot />` 構成
- **ログアウト**: `useLogin().logout()` 経由のみ (REQ-406 / ADR-011 D2)。`pending` で二重送信防止 (EDGE-003)
- **ユーザアバター**: `useSupabaseUser()` の Google identity から `full_name` / `name` / `email` を表示名として使用 (REQ-006 read only)。`avatar_url` を `UAvatar` の `src` に渡す
- 認証後の全ページが **無指定で自動適用** (ADR-011 D1)。後続単位で page 追加してもヘッダー + ログアウトが自動継承 (NFR-104 思想)

### 4. locales キー追加

**変更ファイル**: `i18n/locales/ja.json`, `i18n/locales/en.json`

追加キー:
```json
{
  "layout": {
    "default": {
      "logout": "ログアウト",
      "avatar": {
        "alt": "ユーザアバター"
      }
    }
  }
}
```

NFR-204 に従い、文言はすべて locales 経由で取得する。

### 5. 型チェック確認

```bash
pnpm typecheck
# → EXIT_CODE:0 (エラーなし)
```

## 作業結果

- [x] `app/layouts/auth.vue` 作成 (中央寄せ・ロゴのみ・ヘッダーなし)
- [x] `app/layouts/default.vue` 作成 (ヘッダー = ロゴ + ユーザアバター + ログアウト)
- [x] ログアウトは `default.vue` ヘッダーに 1 箇所のみ配置し `useLogin().logout()` を呼ぶ (REQ-008 / ADR-011 D2)
- [x] ユーザアバターは Google identity (表示名 / avatar_url) を表示 (REQ-006)
- [x] 文言は locales 経由で取得 (NFR-204)
- [x] `pnpm typecheck` が正常終了 (EXIT_CODE:0)

## 遭遇した問題と解決方法

特になし。

## 次のステップ

- `/tsumiki:direct-verify` を実行して設定を確認
  - `pnpm dev` 起動後、認証後 page が `default.vue` を無指定適用、`/login`・`/confirm` が `auth.vue` を適用することを目視確認
  - ただし page 側の `definePageMeta({ layout: 'auth' })` は TASK-0015 で付与するため、最終確認は TASK-0015 完了後
