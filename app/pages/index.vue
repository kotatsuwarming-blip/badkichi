<script setup lang="ts">
/**
 * 【機能概要】: 公開ランディングページ — 未ログインの初見ユーザーに「何のアプリか」を伝える入口
 * 【実装方針】:
 *   - 認証前ページのため layout: false (default レイアウトはログアウト/アバター等の認証後ヘッダーを出すため不適)
 *   - 文言は i18n (locales/ja.json landing.*) 経由。コードに文字列リテラルを直書きしない (NFR-204)
 *   - ブランド名「バドきち」+ ヒーロー + 価値3点を 1 画面に収める縦中央寄せレイアウト
 *     (UPageHero/UPageSection は縦余白が大きくスクロールを生むため、間隔を制御できる素の構成にする)
 *   - CTA は /login へ誘導。ログイン済ユーザーは auth.global.ts が本来のホームへ転送する
 * 🔵 ADR-015 (検証アプローチ: 入口に「何のアプリか」を置く) + docs/research/usability-test-01 (Phase 0 理解度テスト素材)
 */

// 【レイアウト指定】: 認証前の公開ページのため default レイアウト (認証後ヘッダー) を適用しない 🔵
definePageMeta({ layout: false })

// 【i18n 初期化】: landing.* の文言を locales/ja.json から取得 (NFR-204) 🔵
const { t } = useI18n()

// 【価値訴求 3 点】: 「誰が何を得られるか」をアイコン付きで提示 (機能の羅列ではない / ADR-015 §2)
const features = computed(() => [
  {
    icon: 'i-lucide-clipboard-list',
    title: t('landing.features.record.title'),
    description: t('landing.features.record.description')
  },
  {
    icon: 'i-lucide-bar-chart-3',
    title: t('landing.features.analyze.title'),
    description: t('landing.features.analyze.description')
  },
  {
    icon: 'i-lucide-video',
    title: t('landing.features.video.title'),
    description: t('landing.features.video.description')
  }
])
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center gap-10 px-4 py-10">
    <!-- 【ブランド】: アプリ名「バドきち」を表示 (AppLogo は現状 Nuxt 雛形ロゴのため使わずテキスト表記) 🔵 -->
    <div class="text-xl font-bold tracking-tight text-primary">
      {{ t('landing.brand') }}
    </div>

    <!-- 【ヒーロー】: 一言で何のアプリか + 誰向け/主要価値 + 始める CTA (→ /login) 🔵 -->
    <div class="flex flex-col items-center gap-5 text-center max-w-2xl">
      <h1 class="text-3xl sm:text-5xl font-bold leading-tight">
        {{ t('landing.heading') }}
      </h1>
      <p class="text-base sm:text-lg text-muted">
        {{ t('landing.subheading') }}
      </p>
      <UButton
        to="/login"
        :label="t('landing.cta')"
        icon="i-simple-icons-google"
        size="xl"
        color="primary"
        class="mt-2"
      />
    </div>

    <!-- 【価値訴求 3 点】: 記録 / 分析 / 映像振り返り。ヒーロー直下に近接配置 🔵 -->
    <div class="grid w-full max-w-4xl gap-6 sm:grid-cols-3">
      <div
        v-for="f in features"
        :key="f.title"
        class="flex flex-col items-center gap-2 text-center sm:items-start sm:text-left"
      >
        <UIcon
          :name="f.icon"
          class="size-6 text-primary"
        />
        <h3 class="font-semibold">
          {{ f.title }}
        </h3>
        <p class="text-sm text-muted">
          {{ f.description }}
        </p>
      </div>
    </div>

    <!-- 【フッター】: 法務ページへのリンク (Google OAuth ブランド検証はホームからの到達を重視) -->
    <div class="flex flex-wrap items-center justify-center gap-4 text-sm text-muted">
      <NuxtLink
        to="/privacy"
        class="underline"
      >
        {{ t('legal.privacy') }}
      </NuxtLink>
      <NuxtLink
        to="/terms"
        class="underline"
      >
        {{ t('legal.terms') }}
      </NuxtLink>
    </div>
  </div>
</template>
