# TASK-0017: /groups/new ページ Green フェーズ記録

**作成日**: 2026-06-01
**タスク**: TASK-0017 — /groups/new ページ実装
**フェーズ**: Green 完了

---

## 1. 実装サマリー

- **実装ファイル**: `app/pages/groups/new.vue` (新規作成)
- **テスト結果**: 依存層 8 テスト GREEN、全体 19 ファイル 69 テスト GREEN
- **typecheck**: ✅ エラーなし
- **ESLint**: ✅ エラーなし
- **品質判定**: ✅ 高品質

---

## 2. 実装コード全文

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
 */

import { z } from 'zod'
import type { FormSubmitEvent } from '#ui/types'
import { groupNameSchema } from '~/schemas/group-name'

// Nuxt UI v4 の <UForm> は FormSchema (object 型) を要求するため page ローカルでラップ
const formSchema = z.object({ name: groupNameSchema })
type FormValues = z.infer<typeof formSchema>

const { t } = useI18n()
const { create, pending, fieldErrors } = useCreateGroup()
const formState = reactive<FormValues>({ name: '' })

async function onSubmit(event: FormSubmitEvent<FormValues>) {
  const { error } = await create(event.data.name)
  if (error === null) {
    await navigateTo('/')
  }
}
</script>

<template>
  <UContainer class="flex min-h-[60vh] flex-col items-center justify-center py-16">
    <div class="flex w-full max-w-sm flex-col gap-8">
      <h1 class="text-center text-2xl font-bold">
        {{ t('groups.new.title') }}
      </h1>

      <UForm
        :schema="formSchema"
        :state="formState"
        class="flex flex-col gap-4"
        @submit="onSubmit"
      >
        <UFormField
          name="name"
          :label="t('groups.new.nameLabel')"
          :error="fieldErrors['name']"
        >
          <UInput
            v-model="formState.name"
            :placeholder="t('groups.new.namePlaceholder')"
          />
        </UFormField>

        <UButton
          type="submit"
          block
          size="lg"
          :label="t('groups.new.submit')"
          :loading="pending"
          :disabled="pending"
        />
      </UForm>
    </div>
  </UContainer>
</template>
```

---

## 3. 実装方針と判断理由

### 主要判断: formSchema (オブジェクトラッパ) の採用

- **問題**: Nuxt UI v4 の `<UForm>` の `schema` prop は `FormSchema<I extends object>` を要求するため、`groupNameSchema` (`z.string()`) を直接渡すと型エラーになる。
- **解決**: page ローカルで `z.object({ name: groupNameSchema })` を定義してラップした。
- **理由**: `groupNameSchema` 自体は composable/スキーマ層での共有を維持し、page 固有の UI 構造 (`{ name: string }`) のラッパのみ page に閉じる。将来必要になれば `app/schemas/` に昇格できる。
- **信頼性**: 🟡 (型制約上の回避策。Nuxt UI の仕様に基づく推測)

### fieldErrors の inline 表示

- `useCreateGroup` が返す `fieldErrors` は `Ref<Record<string, string>>` 型。
- `<UFormField :error="fieldErrors['name']">` で RPC エラー文言を直接 inline 表示 (error-handling.md §6.4)。
- 🔵 (error-handling.md §6.3 #2 / dataflow.md §3 に基づく)

---

## 4. テスト実行結果

```
pnpm vitest run tests/unit/schemas/group-name.test.ts tests/unit/composables/useCreateGroup.test.ts
 Test Files  2 passed (2)
       Tests  8 passed (8)

pnpm test --run
 Test Files  19 passed (19)
       Tests  69 passed (69)
```

---

## 5. 課題・改善点（Refactor フェーズ候補）

1. `formSchema` は page ローカル定義。共有が必要になれば `app/schemas/group-name.ts` にオブジェクトスキーマも追加可能。
2. `UForm` の `loadingAuto` (デフォルト true) と `pending` の `:disabled` の関係を整理。`loadingAuto` が submit 中に全入力を disable するため、`pending` との二重制御になっている可能性。
3. `formState.name` の trim 後の値が `groupNameSchema` を通る場合、`event.data.name` は trim 済みの値。`create(event.data.name)` に trim 済み値が渡ることを Refactor フェーズで確認。
