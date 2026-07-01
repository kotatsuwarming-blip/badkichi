<script setup lang="ts">
/**
 * 【機能概要】: 利用規約 (公開ページ) — Google OAuth ブランド検証で要求される法務ページ
 * 【実装方針】:
 *   - 認証前でも到達可能にするため layout: false + auth.global.ts PUBLIC_PATHS に '/terms' を登録
 *   - 法務文書の本文は長文プロースのため、例外的に i18n を介さずテンプレートに直書きする
 *     (NFR-204 はアプリ UI 文言が対象。privacy.vue と同じ判断)
 *   - 内容は MVP/検証フェーズ向けの基本テンプレート。本格運用 (課金導入等) 前に専門家レビュー推奨
 */
definePageMeta({ layout: false })

const { t } = useI18n()

useHead({ title: '利用規約｜バドきち' })

const lastUpdated = '2026年6月30日'
const contactEmail = 'kotatsu.warming@gmail.com'
</script>

<template>
  <div class="min-h-screen flex flex-col items-center px-4 py-10">
    <div class="w-full max-w-3xl">
      <NuxtLink
        to="/"
        class="text-lg font-bold tracking-tight text-primary"
      >
        {{ t('landing.brand') }}
      </NuxtLink>

      <h1 class="mt-6 text-2xl font-bold sm:text-3xl">
        利用規約
      </h1>
      <p class="mt-2 text-sm text-muted">
        最終更新日: {{ lastUpdated }}
      </p>

      <div class="mt-8 space-y-8 leading-relaxed">
        <section class="space-y-2">
          <p>
            本利用規約（以下「本規約」といいます）は、バドきち（以下「本サービス」といいます）の利用条件を定めるものです。
            利用者は、本規約に同意のうえ本サービスを利用するものとします。
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-xl font-semibold">
            1. 適用
          </h2>
          <p>
            本規約は、本サービスの提供条件および本サービスの利用に関する運営者と利用者との間の権利義務関係に適用されます。
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-xl font-semibold">
            2. アカウント
          </h2>
          <p>
            利用者は、Google アカウントによる認証を通じて本サービスを利用します。利用者は、自己の責任においてアカウントを管理するものとします。
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-xl font-semibold">
            3. 禁止事項
          </h2>
          <p>利用者は、本サービスの利用にあたり、以下の行為を行ってはなりません。</p>
          <ul class="list-disc space-y-1 pl-5">
            <li>法令または公序良俗に違反する行為。</li>
            <li>他の利用者または第三者の権利・利益を侵害する行為。</li>
            <li>本サービスの運営を妨害し、またはそのおそれのある行為。</li>
            <li>不正アクセスその他本サービスの安全性を損なう行為。</li>
          </ul>
        </section>

        <section class="space-y-2">
          <h2 class="text-xl font-semibold">
            4. 利用者のデータ
          </h2>
          <p>
            利用者が本サービス上で入力・作成したデータの権利は利用者に帰属します。本サービスは、サービスの提供に必要な範囲でこれらのデータを利用します。
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-xl font-semibold">
            5. サービスの提供の停止・変更
          </h2>
          <p>
            本サービスは、保守、不具合、その他運営上の理由により、利用者への事前の通知なく本サービスの全部または一部の提供を停止・変更することがあります。
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-xl font-semibold">
            6. 免責事項
          </h2>
          <p>
            本サービスは現状有姿で提供され、その完全性、正確性、有用性等についていかなる保証も行いません。
            本サービスの利用または利用不能により利用者に生じた損害について、運営者は法令で認められる範囲で責任を負いません。
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-xl font-semibold">
            7. 本規約の変更
          </h2>
          <p>
            本サービスは、必要に応じて本規約を変更することがあります。変更後の内容は本ページに掲載した時点から効力を生じます。
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-xl font-semibold">
            8. 準拠法・裁判管轄
          </h2>
          <p>
            本規約の解釈には日本法を準拠法とし、本サービスに関して紛争が生じた場合には、運営者の所在地を管轄する裁判所を専属的合意管轄とします。
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-xl font-semibold">
            9. お問い合わせ
          </h2>
          <p>
            本規約に関するお問い合わせは、以下までご連絡ください。
          </p>
          <p>
            <a
              :href="`mailto:${contactEmail}`"
              class="text-primary underline"
            >{{ contactEmail }}</a>
          </p>
        </section>
      </div>

      <div class="mt-12 flex flex-wrap gap-4 border-t border-default pt-6 text-sm">
        <NuxtLink
          to="/privacy"
          class="text-primary underline"
        >
          {{ t('legal.privacy') }}
        </NuxtLink>
        <NuxtLink
          to="/"
          class="text-muted underline"
        >
          {{ t('legal.backToHome') }}
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
