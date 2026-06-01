<script setup lang="ts">
/**
 * 【機能概要】: Group 未所属ユーザ向けオンボーディング静的画面 (REQ-003)
 * 【実装方針】:
 *   - 「グループを作成」ボタン → /groups/new へ遷移 (REQ-003)
 *   - 「発行者から受け取った招待 URL を直接開いてください」説明テキスト (design-interview Q2)
 *   - 手入力フォーム・コード手入力系識別子は提供しない (design-interview Q2 / error-handling.md §5.2)
 *   - composable 不要の静的画面。page から supabase を直叩きしない (REQ-406)
 *   - layout 無指定 → default.vue を自動継承 (ADR-011 D1)
 *   - 未所属専用アクセス制御は middleware (REQ-102/103) が担当
 * 🔵 REQ-003 / design-interview Q2 / architecture.md §画面構成 / ADR-011 D1 / NFR-204
 */

// 【i18n 初期化】: 文言は locales/ja.json 経由。コードに文字列リテラルを直書きしない (NFR-204) 🔵
const { t } = useI18n()
</script>

<template>
  <!-- 【ページルート】: default.vue の <slot /> に差し込まれる (layout 無指定で自動継承) -->
  <UContainer class="flex min-h-[60vh] flex-col items-center justify-center py-16">
    <div class="flex w-full max-w-sm flex-col gap-8">
      <!-- 【タイトル】: locales/ja.json onboarding.title (NFR-204) 🔵 -->
      <h1 class="text-center text-2xl font-bold">
        {{ t('onboarding.title') }}
      </h1>

      <div class="flex flex-col gap-6">
        <!-- 【グループ作成ボタン】: /groups/new へ遷移 (REQ-003) 🔵 -->
        <UButton
          to="/groups/new"
          block
          size="lg"
          :label="t('onboarding.createGroup')"
        />

        <!-- 【招待リンク説明テキスト】: 手入力フォームなし (design-interview Q2) 🔵 -->
        <p class="text-center text-sm text-muted">
          {{ t('onboarding.joinHint') }}
        </p>
      </div>
    </div>
  </UContainer>
</template>
