<script setup lang="ts">
/**
 * 【機能概要】: 全ショットパス (打点+種別+打者) の入力パネル。ローカル: 候補フレームへの
 *             ジャンプ + フレーム確定 (校正) + コート図タップ。YouTube: スローループ +
 *             コート図タップ (REQ-009〜012 / REQ-101)。
 * 【実装方針】: コート図をスクロールなしで届く位置に置くため、種別パレットは図の下・
 *             ループ説明は最下部の注釈に配置 (ドッグフーディング 2026-08-03 レイアウト再構成)。
 *             フレーム抽出の canvas 化 (ThumbStrip) は D6 の試用後改善項目。
 * TASK-0011 / ui-design.md モード3
 */
import type { UsePositionPassReturn } from '~/composables/usePositionPass'
import { SERVE_KEY_BINDINGS, TYPE_KEY_BINDINGS } from '~/utils/annotation/taxonomy'

const props = defineProps<{
  positionPass: UsePositionPassReturn
  /** 候補フレーム時刻へのシーク (page が player.controls.seekToMs + pause を実行) */
  seekTo: (ms: number) => void
  /** 現在のプレーヤー時刻 (フレーム確定用)。未ロードは null */
  currentTimeMs: () => number | null
}>()

/** ショット行の構造操作・hand トグル・ショットジャンプ (動画駆動を伴う) は親へ委譲 */
const emit = defineEmits<{
  'insert-shot': []
  'delete-shot': []
  'toggle-hand': [value: boolean]
  'jump-shot': [shotId: string]
}>()

const { t } = useI18n()

function confirmCurrentFrame() {
  const ms = props.currentTimeMs()
  if (ms !== null) props.positionPass.confirmFrame(ms)
}
</script>

<template>
  <div class="space-y-3">
    <div
      v-if="props.positionPass.isDone.value"
      class="text-sm text-neutral-500"
    >
      {{ t('annotation.modeDone') }}
    </div>

    <template v-else>
      <!-- hand トグル (種別同時入力に付随、2026-08-03。Shift+キー = バックハンド) -->
      <div class="flex items-center justify-between gap-2">
        <USwitch
          :model-value="props.positionPass.recordHand.value"
          :label="t('annotation.type.recordHand')"
          @update:model-value="emit('toggle-hand', $event === true)"
        />
        <span
          v-if="props.positionPass.recordHand.value"
          class="text-xs text-neutral-500"
        >
          {{ t('annotation.type.handHint') }}
        </span>
      </div>

      <!-- ラリー内のショットチップ (何打目を入力中か + 押下でそのショットへ、2026-08-03)。
           現在ショットの記録済み hand (フォア/バック) も併記 -->
      <div class="flex flex-wrap items-center gap-1">
        <UButton
          v-for="shotItem in props.positionPass.currentShots.value"
          :key="shotItem.id"
          :color="shotItem.id === props.positionPass.currentShot.value?.id
            ? 'primary'
            : (shotItem.hitX !== null ? 'success' : 'neutral')"
          :variant="shotItem.id === props.positionPass.currentShot.value?.id
            ? 'solid'
            : (shotItem.hitX !== null ? 'subtle' : 'outline')"
          size="xs"
          @click="emit('jump-shot', shotItem.id)"
        >
          #{{ shotItem.shotNumber }}{{ shotItem.shotType ? ` ${t(`annotation.shotType.${shotItem.shotType}`)}` : '' }}
        </UButton>
        <UBadge
          v-if="props.positionPass.currentShot.value?.hand"
          color="info"
          variant="subtle"
          size="sm"
        >
          {{ t(`annotation.hand.${props.positionPass.currentShot.value.hand}`) }}
        </UBadge>
      </div>

      <UAlert
        v-if="props.positionPass.isCalibrating.value"
        color="info"
        variant="subtle"
        icon="i-lucide-crosshair"
        :title="t('annotation.position.calibrating')"
      />

      <!-- ローカル: 候補フレーム (±0.5s の5点) へジャンプ → 確定 (REQ-010/011) -->
      <div
        v-if="props.positionPass.stripTimesMs.value"
        class="space-y-1"
      >
        <p class="text-xs text-neutral-500">
          {{ t('annotation.position.frameJump') }}
        </p>
        <div class="flex flex-wrap items-center gap-1.5">
          <UButton
            v-for="ms in props.positionPass.stripTimesMs.value"
            :key="ms"
            variant="soft"
            color="neutral"
            size="xs"
            @click="props.seekTo(ms)"
          >
            {{ ((ms - (props.positionPass.anchorMs.value ?? 0)) / 1000).toFixed(1) }}s
          </UButton>
          <UButton
            color="primary"
            size="xs"
            icon="i-lucide-check"
            @click="confirmCurrentFrame()"
          >
            {{ t('annotation.position.confirmFrame') }}
          </UButton>
        </div>
      </div>

      <!-- 打者の二択 (3打目以降、REQ-012)。入力済みの再訪は現値をハイライト -->
      <div
        v-if="props.positionPass.awaitingHitter.value"
        class="space-y-1"
      >
        <p class="text-sm font-medium">
          {{ t('annotation.position.hitterPrompt') }}
        </p>
        <div class="flex gap-2">
          <UButton
            v-for="candidate in props.positionPass.hitterCandidates.value"
            :key="candidate.playerId"
            :variant="candidate.playerId === props.positionPass.currentShot.value?.hitPlayerId ? 'solid' : 'soft'"
            color="primary"
            @click="props.positionPass.selectHitter(candidate.playerId)"
          >
            {{ candidate.name }}
          </UButton>
        </div>
      </div>

      <!-- 打点タップ (REQ-009/014)。スクロールなしで届くようパネル上部に配置 (2026-08-03) -->
      <template v-else>
        <p class="text-sm font-medium">
          {{ t('annotation.position.tapPrompt') }}
        </p>
        <!-- max-w-60: 動画横のパネルでスクロールなしに全面が収まるサイズ (2026-08-03) -->
        <AnnotationCourtDiagramInput
          class="max-w-60"
          :marker="props.positionPass.currentShot.value && props.positionPass.currentShot.value.hitX !== null
            ? { x: props.positionPass.currentShot.value.hitX, y: props.positionPass.currentShot.value.hitY ?? 0 }
            : null"
          @select="props.positionPass.setPosition($event)"
        />
      </template>

      <!-- 種別の同時入力 (ステップ&ループ方式なら成立。特に YouTube 向け、2026-08-02) -->
      <div class="space-y-1">
        <p class="text-xs text-neutral-500">
          {{ t('annotation.position.typeHint') }}
        </p>
        <div
          v-if="props.positionPass.currentShot.value?.shotNumber === 1"
          class="flex flex-wrap gap-1.5"
        >
          <UButton
            v-for="[key, type] in SERVE_KEY_BINDINGS"
            :key="key"
            variant="soft"
            color="primary"
            size="xs"
            @click="props.positionPass.setType(key)"
          >
            <UKbd size="sm">
              {{ key }}
            </UKbd>
            {{ t(`annotation.shotType.${type}`) }}
          </UButton>
        </div>
        <div
          v-else
          class="grid grid-cols-3 gap-1"
        >
          <UButton
            v-for="[key, type] in TYPE_KEY_BINDINGS"
            :key="key"
            variant="soft"
            color="neutral"
            size="xs"
            block
            @click="props.positionPass.setType(key)"
          >
            <UKbd size="sm">
              {{ key }}
            </UKbd>
            {{ t(`annotation.shotType.${type}`) }}
          </UButton>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <UButton
          variant="ghost"
          size="sm"
          @click="props.positionPass.skipShot()"
        >
          {{ t('annotation.position.skip') }}
        </UButton>
        <!-- ショット行の補正 (種別パスと同じ、押し損ね/押しすぎ) -->
        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          icon="i-lucide-plus"
          @click="emit('insert-shot')"
        >
          {{ t('annotation.type.insertShot') }}
        </UButton>
        <UButton
          v-if="props.positionPass.currentShot.value"
          variant="ghost"
          color="error"
          size="sm"
          icon="i-lucide-minus"
          @click="emit('delete-shot')"
        >
          {{ t('annotation.type.deleteShot') }}
        </UButton>
      </div>

      <!-- ループ再生の説明は最下部の注釈に (上部の Alert はコート図を押し下げて邪魔、2026-08-03) -->
      <p
        v-if="props.positionPass.loopWindow.value"
        class="text-xs text-neutral-500"
      >
        {{ t('annotation.position.loopHint') }}
      </p>
    </template>
  </div>
</template>
