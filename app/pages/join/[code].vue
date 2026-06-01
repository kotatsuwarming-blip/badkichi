<script setup lang="ts">
/**
 * 【機能概要】: 招待リンク着地ページ。/join/[code] に着地し、招待コードでグループ参加を処理する
 * 【実装方針】:
 *   - definePageMeta 指定なし → default.vue を自動継承 (ADR-011 D1)
 *   - /join/** は middleware の public path として通過させ、未ログイン判定は page 内で行う (ADR-008 D1 例外)
 *   - 未ログイン: navigateTo(buildLoginRedirect(route.fullPath)) で /login?redirect=... へ (REQ-108)
 *   - ログイン済: useJoinGroup().join(code) を実行 (REQ-005)
 *   - 成功: navigateTo('/') (REQ-005)
 *   - 失敗: notice を <UAlert> で永続表示 (REQ-105/106/107)
 *   - 処理中: pending で <USkeleton> 表示 (NFR-202)
 *   - 文言: locales 経由 (NFR-204)、Supabase 直叩き禁止 (REQ-406)
 * 🔵 REQ-005 / REQ-105 / REQ-106 / REQ-107 / REQ-108 / NFR-202 / NFR-204 / ADR-008 D1 例外 / ADR-011 D1
 */

// 【i18n 初期化】: 文言は locales/ja.json 経由。コードに文字列リテラルを直書きしない (NFR-204) 🔵
const { t } = useI18n()

// 【ルート取得】: code パラメータと fullPath を読み出すために useRoute() を使用 🔵
const route = useRoute()

// 【ユーザ認証状態取得】: Supabase を直叩きせず useSupabaseUser() のみで判定する (REQ-406) 🔵
const user = useSupabaseUser()

// 【join composable 取得】: グループ参加ロジック・識別子変換は composable に閉じる (EDGE-005 / ADR-008) 🔵
const { join, pending, notice } = useJoinGroup()

/**
 * 【機能概要】: 認証状態を監視し、確定次第 join 処理または未ログインリダイレクトを実行する
 * 【改善内容】: onMounted から watch(user, ..., { immediate: true, once: true }) パターンへ変更
 * 【設計方針】: confirm.vue と統一したリアクティブパターン。ページリロード直後などで
 *   useSupabaseUser() の値が非同期に確定するケース（Nuxt の CSR hydration タイミング）でも
 *   正しく動作する。once: true で join の二重呼び出しを防ぐ (REQ-108 / dataflow.md §4)
 *   - user が null: buildLoginRedirect で redirect URL を生成し navigateTo (EDGE-001 リダイレクトチェーン起点)
 *   - user が非 null: route.params.code を string に正規化して join を呼ぶ
 *   - join 成功: navigateTo('/') でダッシュボードへ (REQ-005)
 *   - join 失敗: notice が setNotice 済のため <UAlert> が表示される (REQ-105/106/107)
 * 【EDGE-005 への影響】: DB の 'invitation_not_found' → 'invitation_not_found_by_link' 変換は
 *   useJoinGroup 内で完結しており、page 側では notice.value を表示するだけでよい
 * 🔵 REQ-005 / REQ-108 / EDGE-001 / dataflow.md §4 sequence diagram
 */
watch(
  user,
  async (u) => {
    // 【未ログイン分岐】: user が null なら /login?redirect=... へリダイレクト (REQ-108 / ADR-008 D1 例外) 🔵
    if (!u) {
      // 【redirect URL 生成】: buildLoginRedirect でフルパスを encodeURIComponent で包んで保持する (EDGE-001) 🔵
      await navigateTo(buildLoginRedirect(route.fullPath))
      return
    }

    // 【招待コード取得】: route.params.code は string | string[] | undefined になりうるため string に正規化する 🔵
    // 動的ルート [code] は単一パラメータのため string のはずだが、型安全のため全ケースにフォールバックを入れる
    // 配列の先頭が undefined の場合・値が undefined の場合は空文字列 → DB 側で invitation_not_found 扱い
    const rawCode = route.params.code
    const code: string = Array.isArray(rawCode) ? (rawCode[0] ?? '') : (rawCode ?? '')

    // 【join 実行】: useJoinGroup().join(code) でグループ参加 RPC を呼ぶ。Supabase 直叩き禁止 (REQ-406) 🔵
    const { error } = await join(code)

    // 【成功時遷移】: エラーなしでダッシュボードへ遷移 (REQ-005)
    //   useCurrentGroup().refresh() は useJoinGroup 内で実施済。page では重複呼び出ししない 🔵
    if (!error) {
      await navigateTo('/')
    }
    // 【失敗時】: notice に App 識別子が入り <UAlert> で永続表示される (REQ-105/106/107) 🔵
    //   EDGE-005 変換済の識別子が useNoticeErrors → useErrorMessage → t() で文言化される
  },
  { immediate: true, once: true }
)
</script>

<template>
  <!-- 【ページルート】: default.vue の <slot /> に差し込まれる (layout 無指定で自動継承) -->
  <UContainer class="flex min-h-[60vh] flex-col items-center justify-center py-16">
    <div class="flex w-full max-w-sm flex-col gap-8">
      <!-- 【タイトル】: locales/ja.json join.title (NFR-204) 🔵 -->
      <h1 class="text-center text-2xl font-bold">
        {{ t('join.title') }}
      </h1>

      <!-- 【説明文】: locales/ja.json join.description (NFR-204) 🔵 -->
      <p class="text-center text-sm text-muted">
        {{ t('join.description') }}
      </p>

      <!-- 【エラー通知】: join 失敗時に useJoinGroup.notice を <UAlert> で永続表示 (REQ-105/106/107) 🔵
           notice の値は ALREADY_IN_GROUP / INVITATION_NOT_FOUND_BY_LINK / INVITATION_EXPIRED 等の
           App 識別子を useNoticeErrors + useErrorMessage + t() で文言化した文字列 -->
      <UAlert
        v-if="notice"
        color="error"
        variant="soft"
        :description="notice"
      />

      <!-- 【ローディング表示】: join 処理中は <USkeleton> を表示し二重送信を防ぐ (NFR-202) 🔵 -->
      <USkeleton
        v-if="pending"
        class="h-10 w-full rounded-md"
      />

      <!-- 【処理中テキスト】: pending 中の案内文言 (NFR-204) 🔵 -->
      <p
        v-if="pending"
        class="text-center text-sm text-muted"
      >
        {{ t('join.processing') }}
      </p>
    </div>
  </UContainer>
</template>
