<script setup lang="ts">
/**
 * 【機能概要】: アプリのロゴ — マーク(線画シャトル + 棒×折れ線のコンボチャート) + ワードマーク「バドきち」
 * 【実装方針】:
 *   - 文言は i18n `app.name` (NFR-204)。ヘッダー (default.vue) / 認証画面 (auth.vue) で共用
 *   - マークの意味: 線画のシャトル(羽根+コルク)= currentColor、根元から立ち上がる
 *     棒グラフ(分析)= var(--ui-primary)、棒の中腹を通る折れ線(独立した推移)= currentColor
 *   - マーク高さは文字サイズに連動 (em)。呼び出し側の h-* / w-auto クラスは外側 span にマージされる
 */
const { t } = useI18n()
</script>

<template>
  <span class="inline-flex items-center gap-1.5 whitespace-nowrap text-2xl font-bold leading-none tracking-tight select-none">
    <svg
      viewBox="0 0 32 32"
      class="h-[1.2em] w-auto shrink-0"
      fill="none"
      aria-hidden="true"
    >
      <!-- シャトル(線画): 羽根の外縁・先端スカラップ・分割線・コルク (currentColor) -->
      <g
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M10 17 L6 6" />
        <path d="M16 17 L20 6" />
        <path d="M6 6 Q7.75 3 9.5 6 Q11.25 3 13 6 Q14.75 3 16.5 6 Q18.25 3 20 6" />
        <path d="M11.5 17 L9 6" />
        <path d="M13 17 L13 6" />
        <path d="M14.5 17 L17 6" />
        <path d="M10 17 L10 21 Q10 23.5 13 23.5 Q16 23.5 16 21 L16 17" />
        <path d="M10 19.3 L16 19.3" />
      </g>
      <!-- 分析の棒グラフ (var(--ui-primary)) -->
      <g fill="var(--ui-primary)">
        <rect
          x="17"
          y="21"
          width="2.4"
          height="6"
          rx="0.8"
        />
        <rect
          x="20.7"
          y="18"
          width="2.4"
          height="9"
          rx="0.8"
        />
        <rect
          x="24.4"
          y="15"
          width="2.4"
          height="12"
          rx="0.8"
        />
      </g>
      <!-- 折れ線(棒の中腹を通る独立した推移)+ ノード点 (currentColor) -->
      <polyline
        points="15.5,23 18.2,22 21.9,24 25.6,20 28,21"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <g fill="currentColor">
        <circle
          cx="18.2"
          cy="22"
          r="1.1"
        />
        <circle
          cx="21.9"
          cy="24"
          r="1.1"
        />
        <circle
          cx="25.6"
          cy="20"
          r="1.1"
        />
      </g>
    </svg>
    {{ t('app.name') }}
  </span>
</template>
