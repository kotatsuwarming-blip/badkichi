<script setup lang="ts">
/**
 * 【機能概要】: 種別パス (キーボード専用) の入力パネル。全ショットパスと同じステップ&
 *             ループ方式で、種別キー (+Shift=バック) → 打者 (1/2) を入力して前進する
 *             (ドッグフーディング 2026-08-03 再設計)。
 * TASK-0011 / REQ-103 / REQ-104 / REQ-109 (キーボードは page が捕捉し inputType へ委譲)
 */
import type { UseTypePassReturn } from '~/composables/useTypePass'
import type { ShotType } from '~/types/shot-annotation'
import { SERVE_KEY_BINDINGS, TYPE_KEY_BINDINGS } from '~/utils/annotation/taxonomy'

const props = defineProps<{
  typePass: UseTypePassReturn
}>()

/** hand トグル・構造操作・ショットジャンプ (動画駆動を伴う) は親へ委譲 */
const emit = defineEmits<{
  'toggle-hand': [value: boolean]
  'insert-shot': []
  'delete-shot': []
  'jump-shot': [shotId: string]
}>()

const { t } = useI18n()

function isReceiveKey(type: ShotType): boolean {
  return type.startsWith('receive_')
}
</script>

<template>
  <div class="space-y-3">
    <div
      v-if="props.typePass.isDone.value"
      class="text-sm text-neutral-500"
    >
      {{ t('annotation.modeDone') }}
    </div>

    <template v-else>
      <div class="flex items-center justify-between gap-2">
        <USwitch
          :model-value="props.typePass.recordHand.value"
          :label="t('annotation.type.recordHand')"
          @update:model-value="emit('toggle-hand', $event === true)"
        />
        <span
          v-if="props.typePass.recordHand.value"
          class="text-xs text-neutral-500"
        >
          {{ t('annotation.type.handHint') }}
        </span>
      </div>

      <!-- ラリー内のショットチップ (何打目を入力中か + 押下でそのショットへ)。
           現在ショットの記録済み hand も併記 -->
      <div class="flex flex-wrap items-center gap-1">
        <UButton
          v-for="shotItem in props.typePass.currentShots.value"
          :key="shotItem.id"
          :color="shotItem.id === props.typePass.currentShot.value?.id
            ? 'primary'
            : (shotItem.shotType !== null ? 'success' : 'neutral')"
          :variant="shotItem.id === props.typePass.currentShot.value?.id
            ? 'solid'
            : (shotItem.shotType !== null ? 'subtle' : 'outline')"
          size="xs"
          @click="emit('jump-shot', shotItem.id)"
        >
          #{{ shotItem.shotNumber }}{{ shotItem.shotType ? ` ${t(`annotation.shotType.${shotItem.shotType}`)}` : '' }}
        </UButton>
        <UBadge
          v-if="props.typePass.currentShot.value?.hand"
          color="info"
          variant="subtle"
          size="sm"
        >
          {{ t(`annotation.hand.${props.typePass.currentShot.value.hand}`) }}
        </UBadge>
      </div>

      <!-- 打者の二択 (3打目以降、種別入力後。1/2 キーでも選択可) -->
      <div
        v-if="props.typePass.awaitingHitter.value"
        class="space-y-1"
      >
        <p class="text-sm font-medium">
          {{ t('annotation.position.hitterPrompt') }}
        </p>
        <div class="flex gap-2">
          <UButton
            v-for="(candidate, i) in props.typePass.hitterCandidates.value"
            :key="candidate.playerId"
            :variant="candidate.playerId === props.typePass.currentShot.value?.hitPlayerId ? 'solid' : 'soft'"
            color="primary"
            @click="props.typePass.selectHitter(candidate.playerId)"
          >
            <UKbd>{{ i + 1 }}</UKbd>
            {{ candidate.name }}
          </UButton>
        </div>
      </div>

      <!-- 種別パレット (固定キー。レシーブ文脈では QWE をハイライト、REQ-103) -->
      <template v-else>
        <!-- サーブ三択 (1打目のみ、REQ-109) -->
        <div
          v-if="props.typePass.currentShot.value?.shotNumber === 1"
          class="space-y-1"
        >
          <p class="text-xs text-neutral-500">
            {{ t('annotation.type.serveHint') }}
          </p>
          <div class="flex flex-col gap-2 lg:max-w-xs">
            <UButton
              v-for="[key, type] in SERVE_KEY_BINDINGS"
              :key="key"
              variant="soft"
              color="primary"
              class="justify-start"
              @click="props.typePass.inputType(key)"
            >
              <UKbd>{{ key }}</UKbd>
              {{ t(`annotation.shotType.${type}`) }}
            </UButton>
          </div>
        </div>

        <!-- 通常パレット。PC は縦一列でキー対応を明示、スマホは3列グリッド -->
        <div
          v-else
          class="grid grid-cols-3 gap-1.5 lg:grid-cols-1 lg:max-w-xs"
        >
          <UButton
            v-for="[key, type] in TYPE_KEY_BINDINGS"
            :key="key"
            :variant="props.typePass.receiveHighlight.value && isReceiveKey(type) ? 'solid' : 'soft'"
            :color="props.typePass.receiveHighlight.value && isReceiveKey(type) ? 'primary' : 'neutral'"
            size="xs"
            class="lg:justify-start"
            block
            @click="props.typePass.inputType(key)"
          >
            <UKbd size="sm">
              {{ key }}
            </UKbd>
            {{ t(`annotation.shotType.${type}`) }}
          </UButton>
        </div>
      </template>

      <div class="flex flex-wrap items-center gap-2">
        <UButton
          variant="ghost"
          size="sm"
          @click="props.typePass.skipShot()"
        >
          {{ t('annotation.position.skip') }}
        </UButton>
        <!-- ショット行の補正 (ライブ記録の押し損ね/押しすぎ) -->
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
          v-if="props.typePass.currentShot.value"
          variant="ghost"
          color="error"
          size="sm"
          icon="i-lucide-minus"
          @click="emit('delete-shot')"
        >
          {{ t('annotation.type.deleteShot') }}
        </UButton>
      </div>

      <!-- ループ再生の説明は最下部の注釈に -->
      <p
        v-if="props.typePass.loopWindow.value"
        class="text-xs text-neutral-500"
      >
        {{ t('annotation.type.loopHint') }}
      </p>
    </template>
  </div>
</template>
