<script setup lang="ts">
/**
 * 【機能概要】: 打点パスの入力パネル。ローカル: 候補フレームへのジャンプ + フレーム確定 (校正) +
 *             コート図タップ。YouTube: スローループ案内 + コート図タップ (REQ-009〜012 / REQ-101)。
 * 【実装方針】: フレーム抽出の canvas 化 (ThumbStrip) は D6 の試用後改善項目。v1 は
 *             候補時刻ボタンでプレーヤーをシークし、表示フレームを目視確認して確定する。
 * TASK-0011 / ui-design.md モード3
 */
import type { UsePositionPassReturn } from '~/composables/usePositionPass'

const props = defineProps<{
  positionPass: UsePositionPassReturn
  /** 候補フレーム時刻へのシーク (page が player.controls.seekToMs + pause を実行) */
  seekTo: (ms: number) => void
  /** 現在のプレーヤー時刻 (フレーム確定用)。未ロードは null */
  currentTimeMs: () => number | null
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
      <UAlert
        v-if="props.positionPass.isCalibrating.value"
        color="info"
        variant="subtle"
        icon="i-lucide-crosshair"
        :title="t('annotation.position.calibrating')"
      />
      <UAlert
        v-if="props.positionPass.loopWindow.value"
        color="neutral"
        variant="subtle"
        icon="i-lucide-repeat"
        :title="t('annotation.position.loopHint')"
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

      <!-- 打者の二択 (3打目以降のみ、REQ-012) -->
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
            variant="soft"
            color="primary"
            @click="props.positionPass.selectHitter(candidate.playerId)"
          >
            {{ candidate.name }}
          </UButton>
        </div>
      </div>

      <!-- 打点タップ (REQ-009/014) -->
      <template v-else>
        <p class="text-sm font-medium">
          {{ t('annotation.position.tapPrompt') }}
        </p>
        <AnnotationCourtDiagramInput
          :marker="props.positionPass.currentShot.value && props.positionPass.currentShot.value.hitX !== null
            ? { x: props.positionPass.currentShot.value.hitX, y: props.positionPass.currentShot.value.hitY ?? 0 }
            : null"
          @select="props.positionPass.setPosition($event)"
        />
      </template>

      <UButton
        variant="ghost"
        size="sm"
        @click="props.positionPass.skipShot()"
      >
        {{ t('annotation.position.skip') }}
      </UButton>
    </template>
  </div>
</template>
