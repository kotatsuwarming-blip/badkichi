# TASK-0017: /groups/new ページ TDD コンテキストノート

**作成日**: 2026-06-01  
**タスク**: TASK-0017 — /groups/new ページ実装 (TDD)  
**推定工数**: 6時間 / **フェーズ**: Phase 3 - UI層  

---

## 1. 技術スタック

### フロントエンド基盤
- **Nuxt 4.4** (Vue 3 + TypeScript strict mode)、SSR デフォルト
- **Nuxt UI v4.5** (`<UForm>` / `<UFormField>` / `<UButton>` 等、v4.3+ で `<UFormGroup>` → `<UFormField>` に改称済)
- **バリデーション**: Zod 4.x (`app/schemas/group-name.ts` 既存)
- **i18n**: `@nuxtjs/i18n` (ja のみ本体、en はハコ、`?locale=en` で dev 切替)
- **ルーティング**: ファイルベースルーティング (`app/pages/`)

### レイアウト・デザイン
- **適用レイアウト**: `default.vue` (無指定で自動継承、REQ-008 ログアウトボタン付きヘッダー)
  - 参照元: `app/layouts/default.vue` (TASK-0014 実装済、ヘッダー・ロゴ・ユーザアバター・ログアウト統合)
- **参考パターン**: `app/layouts/auth.vue` (認証前レイアウト、中央寄せ・ロゴのみ)
- **関連 ADR**: ADR-011 レイアウト戦略 (2026-05-30 Accepted)

### データアクセス・認証
- **Client**: `@nuxtjs/supabase` isomorphic composable (`useSupabaseClient<Database>()`)
- **キー**: publishable key (`sb_publishable_*`) のみ、service_role 不使用 (NFR-102)
- **認証 middleware**: `app/middleware/auth.global.ts` (TASK-0013 実装済)
  - 未認証→`/login?redirect=...`、未所属かつ非許可 path→`/onboarding` (ただし `/groups/new` は未所属許可)

---

## 2. 開発ルール

### コーディング規約
- **Vue SFC**: `<script setup lang="ts">` (Composition API のみ)
- **型安全**: TypeScript strict mode、あらゆる `any` は避ける
- **ESLint**: 1tbs brace style、no comma dangle (CLAUDE.md)
- **識別子 const 集約**: エラーコードはフラット化せず `app/types/error-codes.ts` から import (ADR-005 D2、error-handling.md §4)
- **composable から直接呼び出さない**: page から Supabase を直接叩かない (REQ-406、ADR-005 D1)
- **文言**: `locales/ja.json` キーから取得、TS コードに直書きしない (NFR-204)

### エラーハンドリング
- **チャネル決定木** (error-handling.md §6.2):
  - フォーム検証 Zod / RPC `invalid_group_name` → `useFormErrors` → `<UFormField>` inline
  - フィールド原因明確なため context 文字列は composable 内に閉じる (error-handling.md §5.5)
  - App 識別子は 1:1 マッピング (context 不要、§5.2)
- **識別子確認**: `INVALID_GROUP_NAME: 'invalid_group_name'` は既に `app/types/error-codes.ts` に定義済
- **locale マッピング**: `errors.invalid_group_name` は `locales/ja.json` 既存

### 二重送信防止
- **EDGE-003**: 送信中 `useCreateGroup.pending` で送信ボタンを disabled に
- **pending 型**: `Ref<boolean>` (TASK-0010 `useCreateGroup` 既存返却)

### i18n・アクセシビリティ
- **文言キー参照**: `<UFormField>` label / error / button label は `useI18n().t()` 経由
- **Aria 標準**: `<UForm>` / `<UFormField>` の Nuxt UI v4 デフォルト aria に従う (信頼性 🟡)

---

## 3. 関連実装

### 前提タスク (実装済)
- **TASK-0006** (Zod group-name スキーマ)
  - 参照元: `app/schemas/group-name.ts` (1〜50 文字、trim 後空白不可)
  - 検証: min/max boundary EDGE-101〜105 は Zod 側で完結
- **TASK-0010** (useCreateGroup composable)
  - 参照元: `app/composables/useCreateGroup.ts` (成功時 refresh 呼び出し、fieldErrors 返却)
  - 戻り値型: `{ create: (name: string) => Promise<ActionResult<string>>, pending: Ref<boolean>, fieldErrors: Ref<Record<string, string>> }`
  - エラー対応: `invalid_group_name` → `setFieldError('name', error)` で inline チャネルに渡す (dataflow.md §3 D5-1〜4)
  - 注記: RPC 側検証のみ (同名重複なし、UNIQUE 制約なし、architecture.md §既存 API マッピング 注1)
- **TASK-0014** (default/auth layouts)
  - 参照元: `app/layouts/default.vue`, `app/layouts/auth.vue` (無指定で default 自動継承)
  - デフォルトヘッダー（ロゴ・アバター・ログアウト）付き

### 関連 cross-cutting composable (TASK-0007 実装済)
- **useErrorMessage** (`app/composables/useErrorMessage.ts`)
  - 機能: App 識別子 → i18n 文言変換 + Sentry fallthrough (error-handling.md §5.1)
  - 参照元: `tests/unit/composables/useErrorMessage.test.ts` (テスト実装パターン参考)
- **useFormErrors** (`app/composables/useFormErrors.ts`)
  - 機能: `<UFormField>` inline チャネル (fieldErrors / setFieldError / clear)
  - 利用例: `useCreateGroup` 内で `const { fieldErrors, setFieldError, clear } = useFormErrors()` で取得

### UI コンポーネント参考
- **Nuxt UI フォーム構成**:
  ```vue
  <UForm :schema="groupNameSchema" @submit="onSubmit">
    <UFormField name="name" :label="t('form.group-name.label')">
      <UInput v-model="form.name" />
    </UFormField>
    <UButton type="submit" :loading="pending" :disabled="pending">
      {{ t('form.group-name.submit') }}
    </UButton>
  </UForm>
  ```
- **Nuxt UI v4 要素**: `<UForm>`, `<UFormField>`, `<UInput>`, `<UButton>` (全て v4 で同名存続)

### エラーハンドリング参考パターン
- **dataflow.md §3** (Group 作成フロー)
  - Zod parse → RPC 実行 → 成功: refresh + navigateTo('/')、エラー: setFieldError('name', error)
- **error-handling.md §6.3 #2** (フィールド原因明確 / RPC)
  - `invalid_group_name` → `<UFormField>` inline チャネル (REQ-109)

---

## 4. 設計文書

### 要件定義・仕様
- **要件**: `docs/spec/auth-onboarding/requirements.md`
  - REQ-004: Group 名フォーム表示 + `create_group_with_owner` RPC 実行
  - REQ-109: `invalid_group_name` を `<UFormField>` inline error で表示
  - EDGE-003: 送信中はボタン disabled (pending 利用)
  - EDGE-101〜105: 境界値検証 (Zod スキーマで完結)
  - NFR-201: フォームバリデーション inline error (Zod)
  - NFR-202: 処理中 disabled (pending)
  - NFR-204: 文言は locales 経由

### 技術設計・アーキテクチャ
- **アーキテクチャ**: `docs/design/auth-onboarding/architecture.md`
  - レイアウト戦略 §レイアウト戦略 (ADR-011、page は無指定で default.vue 継承)
  - 画面構成 §画面構成 (TASK-0017 = `/groups/new`, default layout, ログイン済, useCreateGroup 使用)
  - 既存 API マッピング §既存 API の利用マッピング (create_group_with_owner RPC 、引数 group_name、エラー invalid_group_name のみ)
  - 注1: UNIQUE 制約なし、「同名重複」エラー存在しない
- **データフロー**: `docs/design/auth-onboarding/dataflow.md`
  - §3 Group 作成フロー (§REQ-004、Zod parse → create RPC → refresh/navigate or fieldError)
- **エラー実装規約**: `docs/design/cross-cutting/error-handling.md`
  - §4 識別子集約 (error-codes.ts、INVALID_GROUP_NAME 既存)
  - §5.1 useErrorMessage 実装 (i18n + Sentry fallthrough)
  - §5.2 App 識別子 1:1 ルール (context 細分化、URL 直リンク着地など)
  - §5.5 domain composable で context 閉じる (page に文言のみ返す)
  - §6.2 UI チャネル決定木 (フォーム検証→inline)
  - §6.3 #2 代表例 (RPC invalid_group_name → `<UFormField>` inline)
  - §6.4 チャネル別 composable (useFormErrors)
  - §6.5 domain composable 使い分け例 (useCreateGroup での useFormErrors 活用)
  - §7 i18n セットアップ (@nuxtjs/i18n、ja のみ本体)
  - §8 Sentry 報告ポイント (error.vue + unmapped 識別子)

### ADR・意思決定記録
- **ADR-005** エラーハンドリング戦略 (error-handling.md の judgment)
- **ADR-007** composable 命名規約 (自然な英語、use* 平置き、D4 戻り値統合)
- **ADR-008** middleware 戦略 (auth.global.ts 一本化、D1 未所属許可 path)
- **ADR-011** レイアウト戦略 (2026-05-30 Accepted、page 無指定で default 継承)
- **ADR-012** テスト戦略 (mock unit + integration 二層)

---

## 5. テスト関連情報

### テスト層分け (ADR-012 D5)
- **mock unit** (pre-commit + CI): Zod / composable / middleware テスト (`tests/unit/`)
  - 本タスク page は結線のみ、unit テスト原則なし (NFR-301)
  - 検証: Zod (TASK-0006)、composable (TASK-0010) のテスト緑を前提
- **integration** (CI 専用): RPC + RLS 通し検証 (data-foundation 側で完結)
  - 本タスク単位での integration なし

### テストフレームワーク・設定
- **Unit**: Vitest + Vue Test Utils
  - 設定: `vitest.config.ts` (定義済)
  - ディレクトリ: `tests/unit/` (composable / middleware / schemas)
  - ファイル命名: `*.test.ts` (integration は `*.integration.test.ts`)
  - Alias: `#nuxt-router`, `#supabase-client`, `#supabase-user`, `#async-data` (vitest.config 既設定、provider/inject パターン対応)
- **Integration**: 別 config (テスト実行時に特定ファイル対象)
  - 共有 DB: `fileParallelism: false` 必須 (cross-file beforeAll/afterAll 干渉対策)

### テスト実装パターン
- **composable unit テスト参考**:
  - 参照元: `tests/unit/composables/useErrorMessage.test.ts`
  - パターン: vi.hoisted → vi.mock (vuex-i18n, @sentry/nuxt) → test code
  - mock 戦略: vi.fn() スパイ、beforeEach で clearAllMocks
  - 注意: vue-i18n mock は vi.mock('#imports') ではなく直接 mock する

### 既存テストディレクトリ構成
```
tests/
├── unit/
│   ├── composables/
│   │   └── useErrorMessage.test.ts
│   ├── middleware/
│   │   └── auth.test.ts
│   └── schemas/
│       └── group-name.test.ts
└── integration/
    ├── rpc.integration.test.ts
    ├── rls.integration.test.ts
    └── setup/create-test-users.integration.test.ts
```

---

## 6. 実装詳細

### Page 構成概要
- **ファイル**: `app/pages/groups/new.vue`
- **機能**:
  1. Group 名フォーム (`<UForm>` + Zod `group-name`)
  2. 送信→ `useCreateGroup().create(name)`
  3. 成功→ `navigateTo('/')`、エラー→ `fieldErrors` inline 表示
  4. 送信中→ `pending` で submit ボタン disabled

### フロー (dataflow.md §3 引用)
```
User Input → Zod parse
  ├─ Fail → fieldErrors display (<UFormField>)
  ├─ Success → create(name) pending=true
    ├─ RPC Success → refresh() → navigateTo('/')
    ├─ RPC invalid_group_name → setFieldError → pending=false
  └─ finally pending=false
```

### 注意点
- **レイアウト**: 無指定で default.vue 自動継承 (definePageMeta 不要、ADR-011 D1)
- **middleware**: auth.global.ts が未所属→`/onboarding` へリダイレクト **しない** (未所属許可 path、ADR-008 2026-05-30 修正)
- **context 文字列**: page 内に含めない (error-handling.md §5.5、composable 内で context 閉じる)
- **同名重複チェック**: DB に UNIQUE 制約なし、「同名重複」エラー存在しない (architecture.md 注1、EDGE-005 参考)
- **RPC 引数**: `group_name` (要件定義の `p_group_name` は誤記、architecture.md 注)

---

## 7. 開発手順 (TDD 6 ステップ)

1. **tdd-requirements** (REQ-004/109 + EDGE-003 + NFR-201/202 整理)
   - フォーム → create → 遷移 / inline error / disabled の契約明確化
2. **tdd-testcases** (Zod / composable テスト緑を前提、本 page unit なし)
   - TASK-0006/0010 テスト緑確認
3. **tdd-red** (依存層不足なければスキップ)
4. **tdd-green** (page 実装)
   - `app/pages/groups/new.vue` 作成
   - `<UForm>` + Zod + `useCreateGroup` 結線
5. **tdd-refactor** (文言 locales 化、context 文字列漏れ確認)
6. **tdd-verify-complete** (typecheck / lint / 依存テスト緑確認)

---

## 参照元ファイル一覧

### 要件・設計
- `docs/spec/auth-onboarding/requirements.md` (REQ-004/109, EDGE-003, NFR-201/202/204)
- `docs/design/auth-onboarding/architecture.md` (レイアウト / 既存 API マッピング / ADR 参照)
- `docs/design/auth-onboarding/dataflow.md` (§3 Group 作成フロー)
- `docs/design/cross-cutting/error-handling.md` (§4-6 エラーハンドリング / i18n)
- `docs/tasks/auth-onboarding/TASK-0017.md` (タスク定義)

### 依存実装
- `app/schemas/group-name.ts` (Zod group-name スキーマ)
- `app/composables/useCreateGroup.ts` (Group 作成 composable、pending / fieldErrors 返却)
- `app/composables/useFormErrors.ts` (inline チャネル composable)
- `app/composables/useErrorMessage.ts` (識別子 → 文言変換)
- `app/types/error-codes.ts` (INVALID_GROUP_NAME 定義)
- `app/layouts/default.vue` (デフォルトレイアウト、無指定継承)
- `app/middleware/auth.global.ts` (認証分岐)

### テスト
- `vitest.config.ts` (Vitest 設定、alias 定義)
- `tests/unit/composables/useErrorMessage.test.ts` (mock パターン参考)
- `tests/unit/schemas/group-name.test.ts` (Zod テスト参考)

### i18n・設定
- `locales/ja.json` (errors.invalid_group_name キー)
- `nuxt.config.ts` (i18n / Sentry 設定)

---

**作成完了**: 2026-06-01
