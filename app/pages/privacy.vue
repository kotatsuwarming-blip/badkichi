<script setup lang="ts">
/**
 * 【機能概要】: プライバシーポリシー (公開ページ) — Google OAuth ブランド検証で要求される法務ページ
 * 【実装方針】:
 *   - 認証前でも到達可能にするため layout: false + auth.global.ts PUBLIC_PATHS に '/privacy' を登録
 *   - 法務文書の本文は長文プロースのため、例外的に i18n を介さずテンプレートに直書きする
 *     (NFR-204 はアプリ UI 文言が対象。日英二重管理が重く改定追従もしにくい法務本文は対象外と判断)
 *     UI ラベル (ページ間リンク等) のみ i18n (legal.*) を使う
 *   - 内容は MVP/検証フェーズ向けの基本テンプレート。運営者名・連絡先・本格運用前に専門家レビュー推奨
 * 【注意】: 動画はローカル参照方式 (再生時にユーザー端末のファイルを選択) でサーバーへアップロードしない
 *           (project video-playback 仕様) — その事実を正確に反映している
 */
definePageMeta({ layout: false })

const { t } = useI18n()

useHead({ title: 'プライバシーポリシー｜バドきち' })

// 【制定日】: 改定時はここを更新
const lastUpdated = '2026年6月30日'
// 【連絡先】: OAuth 同意画面のサポートメールと揃える (要確認)
const contactEmail = 'kotatsu.warming@gmail.com'
</script>

<template>
  <div class="min-h-screen flex flex-col items-center px-4 py-10">
    <div class="w-full max-w-3xl">
      <!-- ヘッダー: ブランド (→ トップ) -->
      <NuxtLink
        to="/"
        class="text-lg font-bold tracking-tight text-primary"
      >
        {{ t('landing.brand') }}
      </NuxtLink>

      <h1 class="mt-6 text-2xl font-bold sm:text-3xl">
        プライバシーポリシー
      </h1>
      <p class="mt-2 text-sm text-muted">
        最終更新日: {{ lastUpdated }}
      </p>

      <div class="mt-8 space-y-8 leading-relaxed">
        <section class="space-y-2">
          <p>
            バドきち（以下「本サービス」といいます）は、利用者の個人情報を尊重し、その保護に努めます。
            本ポリシーは、本サービスにおける個人情報の取り扱いについて定めるものです。
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-xl font-semibold">
            1. 取得する情報
          </h2>
          <ul class="list-disc space-y-1 pl-5">
            <li>Google アカウント情報（メールアドレス、氏名、プロフィール画像）— Google ログインによる認証時に取得します。</li>
            <li>本サービス上で利用者が入力・作成したデータ（チーム・選手情報、試合およびラリーの記録など）。</li>
            <li>サービスの提供・改善・不具合調査のための利用ログや端末に関する技術情報。</li>
          </ul>
          <p class="text-sm text-muted">
            ※ 試合映像（動画）は、再生時に利用者ご自身の端末上のファイルを参照する方式であり、本サービスのサーバーへアップロード・保存されません。
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-xl font-semibold">
            2. 利用目的
          </h2>
          <ul class="list-disc space-y-1 pl-5">
            <li>本人確認・認証およびログイン状態の維持のため。</li>
            <li>試合の記録・分析・表示など、本サービスの機能を提供するため。</li>
            <li>本サービスの維持、品質向上および不具合対応のため。</li>
            <li>利用者からのお問い合わせに対応するため。</li>
          </ul>
        </section>

        <section class="space-y-2">
          <h2 class="text-xl font-semibold">
            3. 第三者提供
          </h2>
          <p>
            本サービスは、法令に基づく場合を除き、利用者の同意なく個人情報を第三者に提供しません。
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-xl font-semibold">
            4. 外部サービスの利用
          </h2>
          <p>
            本サービスは、運営にあたり以下の外部サービスを利用しており、その範囲で情報の取り扱いを委託します。
          </p>
          <ul class="list-disc space-y-1 pl-5">
            <li>Google（ログイン認証）</li>
            <li>Supabase（データベース・認証基盤）</li>
            <li>Vercel（アプリケーションのホスティング）</li>
          </ul>
          <p class="text-sm text-muted">
            各サービスにおける情報の取り扱いは、それぞれの提供事業者のプライバシーポリシーに従います。
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-xl font-semibold">
            5. データの保管と削除
          </h2>
          <p>
            取得した情報は、利用目的の達成に必要な期間保管します。利用者はアカウントの削除またはお問い合わせ窓口を通じて、
            自己に関する情報の削除を求めることができます。
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-xl font-semibold">
            6. 安全管理
          </h2>
          <p>
            本サービスは、取得した情報の漏えい、滅失またはき損の防止その他の安全管理のために必要かつ適切な措置を講じます。
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-xl font-semibold">
            7. 利用者の権利
          </h2>
          <p>
            利用者は、自己に関する個人情報の開示、訂正、追加、削除、利用停止を求めることができます。
            ご希望の際は、下記のお問い合わせ窓口までご連絡ください。
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-xl font-semibold">
            8. 本ポリシーの変更
          </h2>
          <p>
            本サービスは、必要に応じて本ポリシーを変更することがあります。変更後の内容は本ページに掲載した時点から効力を生じます。
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-xl font-semibold">
            9. お問い合わせ
          </h2>
          <p>
            本ポリシーおよび個人情報の取り扱いに関するお問い合わせは、以下までご連絡ください。
          </p>
          <p>
            <a
              :href="`mailto:${contactEmail}`"
              class="text-primary underline"
            >{{ contactEmail }}</a>
          </p>
        </section>
      </div>

      <!-- フッター: 関連ページ -->
      <div class="mt-12 flex flex-wrap gap-4 border-t border-default pt-6 text-sm">
        <NuxtLink
          to="/terms"
          class="text-primary underline"
        >
          {{ t('legal.terms') }}
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
