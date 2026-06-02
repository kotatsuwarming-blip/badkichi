# TASK-0017: /groups/new ページ Refactor フェーズ記録

**作成日**: 2026-06-01
**タスク**: TASK-0017 — /groups/new ページ実装
**フェーズ**: Refactor 完了

---

## 1. リファクタサマリー

- **変更ファイル**: `app/pages/groups/new.vue` (1 ファイル)
- **テスト結果**: 全 69 テスト GREEN (変化なし)
- **typecheck**: ✅ エラーなし
- **ESLint**: ✅ エラーなし
- **品質判定**: ✅ 高品質

---

## 2. セキュリティレビュー

| 観点 | 結果 |
|---|---|
| XSS | `<UForm>` / `<UFormField>` の Nuxt UI v4 標準テンプレートのため問題なし |
| 入力値検証 | Zod `groupNameSchema` で送信前に trim + min/max 検証済 |
| Supabase 直アクセス | なし (composable 経由のみ、REQ-406) |
| 認証情報漏洩 | page は publishable key 範囲のみ |
| CSRF | Supabase Auth の JWT + RLS で保護 |

**判定**: 重大な脆弱性なし 🔵

---

## 3. パフォーマンスレビュー

| 観点 | 結果 |
|---|---|
| 不要なリアクティブ計算 | なし。`reactive` は最小限 (formState のみ) |
| 重複 API 呼び出し | `:disabled="pending"` で二重送信防止済 |
| SSR | page は CSR 操作のみ、サーバー副作用なし |
| バンドルサイズ | zod の import は必要最小限 |

**判定**: 重大なパフォーマンス課題なし 🔵

---

## 4. 改善内容詳細

### 改善 1: formSchema コメントの明確化 🔵

**before:**
```ts
// 【フォームスキーマ定義】: Nuxt UI v4 の <UForm> は FormSchema (object 型) を要求するため、
//   groupNameSchema を name フィールドとして包むオブジェクトスキーマを page ローカルで定義する 🔵
// groupNameSchema 自体 (TASK-0006) は composable・Zod 検証に共有流用。
```

**after:**
```ts
// 【フォームスキーマ定義】: Nuxt UI v4 の <UForm> は FormSchema<I extends object> を要求するため、
//   groupNameSchema (z.string()) を name フィールドとして包むオブジェクトスキーマを page ローカルで定義する 🔵
// groupNameSchema 自体 (TASK-0006 実装済) は composable・スキーマ層での共有を維持し、
// UI 構造 { name: string } のラッパのみ page に閉じる (過剰共有を避ける)。
```

**理由**: `FormSchema<I extends object>` という型制約と「過剰共有を避ける」という設計意図を明示。`formSchema` を `app/schemas/` に昇格させない判断根拠をコメントで担保した。

**formSchema のスキーマ層昇格の検討結果:**
- `z.object({ name: groupNameSchema })` は `/groups/new` ページの UI 構造に依存した form-specific なラッパ
- 他の page や composable がこのオブジェクトスキーマを再利用する予定なし
- 過剰な共有は凝集度を下げるため page ローカルが適切 (現状維持)

---

### 改善 2: UButton の `:loading="pending"` 削除 🔵

**before:**
```vue
<!-- - :loading で スピナー表示 (UX) -->
<UButton
  type="submit"
  :loading="pending"
  :disabled="pending"
/>
```

**after:**
```vue
<!-- - UForm.loadingAuto (デフォルト true) が submit 中に formLoading を provide し、
       UButton type="submit" は isLoading=true → disabled になるため :loading 指定は不要 🔵
     - :disabled="pending" は loadingAuto=false に設定された場合の安全網として明示残し
       (EDGE-003 / NFR-202、二重送信防止) 🟡 -->
<UButton
  type="submit"
  :disabled="pending"
/>
```

**Nuxt UI の動作分析:**
- `UForm.loadingAuto` デフォルト `true`: `onSubmitWrapper` が実行中に `loading = true` をセットし `formLoadingInjectionKey` で provide
- `UButton.isLoading = props.loading || (props.loadingAuto && (loadingAutoState || formLoading?.value && type === 'submit'))`
- `type="submit"` の `UButton` は `formLoading?.value=true` のとき `isLoading=true`
- `UButton` の DOM バインド: `:disabled="disabled || isLoading"` → submit 中は自動 disabled
- よって `:loading="pending"` は二重指定 → 削除

**`:disabled="pending"` を残した理由:**
- `loadingAuto` を `false` にオーバーライドした場合の安全網
- `useCreateGroup.pending` は Zod validate フェーズを含まず RPC 中のみ true (loadingAuto と補完関係)
- 明示的な意図表現として EDGE-003 / NFR-202 コンプライアンスを保証

---

## 5. 最終コード全文

```vue
<script setup lang="ts">
/**
 * 【機能概要】: グループ作成ページ (/groups/new)
 * 【実装方針】:
 *   - ログイン済みユーザが Group 名を入力して新しい Group を作成する画面 (REQ-004)
 *   - <UForm> + Zod オブジェクトスキーマで送信前同期検証 (NFR-201)
 *   - 送信で useCreateGroup().create(name) を呼び、成功時は navigateTo('/') (REQ-004)
 *   - RPC エラー (invalid_group_name) は fieldErrors → <UFormField> inline 表示 (REQ-109)
 *   - pending 中はボタン disabled で二重送信防止 (EDGE-003 / NFR-202)
 *   - layout 無指定 → default.vue 自動継承 (ADR-011 D1)、definePageMeta 不要
 *   - page から Supabase を直接呼ばない (REQ-406 / ADR-005 D1)
 *   - 文言は locales/ja.json 経由 (NFR-204)
 * 🔵 REQ-004 / REQ-109 / REQ-406 / EDGE-003 / NFR-201/202/204 / ADR-005/011
 */

import { z } from 'zod'

// 【型インポート】: UForm の @submit イベント型 (Nuxt UI v4) 🔵
import type { FormSubmitEvent } from '#ui/types'

// 【スキーマインポート】: Zod group-name スキーマ (TASK-0006 実装済) 🔵
import { groupNameSchema } from '~/schemas/group-name'

// 【フォームスキーマ定義】: Nuxt UI v4 の <UForm> は FormSchema<I extends object> を要求するため、
//   groupNameSchema (z.string()) を name フィールドとして包むオブジェクトスキーマを page ローカルで定義する 🔵
// groupNameSchema 自体 (TASK-0006 実装済) は composable・スキーマ層での共有を維持し、
// UI 構造 { name: string } のラッパのみ page に閉じる (過剰共有を避ける)。
const formSchema = z.object({ name: groupNameSchema })
type FormValues = z.infer<typeof formSchema>

// 【i18n 初期化】: 文言は locales/ja.json 経由。コードに文字列リテラルを直書きしない (NFR-204) 🔵
const { t } = useI18n()

// 【useCreateGroup 取得】: create / pending / fieldErrors を expose (TASK-0010 実装済) 🔵
const { create, pending, fieldErrors } = useCreateGroup()

// 【フォーム状態初期化】: <UForm :state> で管理する Group 名の初期値 🔵
const formState = reactive<FormValues>({ name: '' })

/**
 * 【機能概要】: フォーム送信ハンドラ
 * 【実装方針】:
 *   - <UForm> の @submit から FormSubmitEvent<FormValues> を受け取る
 *   - create(event.data.name) を await し、成功 (error === null) 時のみ navigateTo('/') を呼ぶ
 *   - 失敗時は遷移しない (fieldErrors を composable が設定、inline 表示は UFormField が担当)
 * 【テスト対応】: dataflow.md §3 Group 作成フロー、navigateTo 分岐は E2E (TASK-0020) で検証
 * 🔵 REQ-004 / dataflow.md §3 / error-handling.md §6.3 #2
 * @param event - FormSubmitEvent<FormValues> Zod parse 済みのフォーム値を含む
 */
async function onSubmit(event: FormSubmitEvent<FormValues>) {
  // 【create 実行】: composable 経由で create_group_with_owner RPC を呼ぶ (REQ-406) 🔵
  const { error } = await create(event.data.name)

  // 【成功時遷移】: error が null のときのみトップへ遷移 (REQ-004) 🔵
  // 失敗時は composable が fieldErrors に invalid_group_name をセット済 (REQ-109)
  if (error === null) {
    await navigateTo('/')
  }
}
</script>

<template>
  <!-- 【ページルート】: default.vue の <slot /> に差し込まれる (layout 無指定で自動継承) -->
  <UContainer class="flex min-h-[60vh] flex-col items-center justify-center py-16">
    <div class="flex w-full max-w-sm flex-col gap-8">
      <!-- 【タイトル】: locales/ja.json groups.new.title (NFR-204) 🔵 -->
      <h1 class="text-center text-2xl font-bold">
        {{ t('groups.new.title') }}
      </h1>

      <!-- 【グループ作成フォーム】: <UForm> に formSchema (object ラッパ) と state を渡し、送信前同期検証 (NFR-201) 🔵 -->
      <UForm
        :schema="formSchema"
        :state="formState"
        class="flex flex-col gap-4"
        @submit="onSubmit"
      >
        <!-- 【グループ名フィールド】:
             - name="name" で UForm の Zod エラーと fieldErrors を紐付け
             - :error で RPC エラー (invalid_group_name) を inline 表示 (REQ-109) 🔵 -->
        <UFormField
          name="name"
          :label="t('groups.new.nameLabel')"
          :error="fieldErrors['name']"
        >
          <!-- 【テキスト入力】: v-model で formState.name にバインド 🔵 -->
          <UInput
            v-model="formState.name"
            :placeholder="t('groups.new.namePlaceholder')"
          />
        </UFormField>

        <!-- 【送信ボタン】:
             - UForm.loadingAuto (デフォルト true) が submit 中に formLoading を provide し、
               UButton type="submit" は isLoading=true → disabled になるため :loading 指定は不要 🔵
             - :disabled="pending" は loadingAuto=false に設定された場合の安全網として明示残し
               (EDGE-003 / NFR-202、二重送信防止) 🟡 -->
        <UButton
          type="submit"
          block
          size="lg"
          :label="t('groups.new.submit')"
          :disabled="pending"
        />
      </UForm>
    </div>
  </UContainer>
</template>
```

---

## 6. テスト実行結果

```
pnpm test --run
 Test Files  19 passed (19)
       Tests  69 passed (69)
    Duration  773ms

pnpm typecheck: ✅ エラーなし
pnpm lint: ✅ エラーなし
```

---

## 7. 品質評価

| 項目 | 評価 |
|---|---|
| テスト結果 | ✅ 全 69 テスト継続 GREEN |
| セキュリティ | ✅ 重大な脆弱性なし |
| パフォーマンス | ✅ 重大な性能課題なし |
| リファクタ品質 | ✅ 二重制御を整理、コメント明確化 |
| コード品質 | ✅ 高品質 |
| ファイルサイズ | ✅ 109 行 (500 行制限内) |

**総合判定**: ✅ 高品質
