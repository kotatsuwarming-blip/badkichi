<script setup lang="ts">
/**
 * 【機能概要】: 種別パスの入力パネル。固定キーパレット・handトグル・ラリー内進捗チップ・
 *             レシーブハイライト (REQ-007 / REQ-103 / REQ-104 / REQ-109)。
 * TASK-0011 / ui-design.md モード2 (キーボードは page が捕捉し handleKey へ委譲)
 */
import type { UseTypePassReturn } from '~/composables/useTypePass'
import type { ShotType } from '~/types/shot-annotation'

const props = defineProps<{
  typePass: UseTypePassReturn
}>()

/** hand トグルと構造操作は prop を直接変異させず親へ委譲 (vue/no-mutating-props) */
const emit = defineEmits<{
  'toggle-hand': [value: boolean]
  'insert-shot': []
  'delete-shot': []
}>()

const { t } = useI18n()

/** 固定キー割当 (ui-design.md。ハイライトしても割当は変えない) */
const NORMAL_KEYS: Array<[string, ShotType]> = [
  ['1', 'clear'], ['2', 'smash'], ['3', 'cut'], ['4', 'reverse_cut'], ['5', 'drop'],
  ['6', 'drive'], ['7', 'push'], ['8', 'half'], ['9', 'hairpin'], ['0', 'lob'],
  ['Q', 'receive_long'], ['W', 'receive_drive'], ['E', 'receive_short']
]
const SERVE_KEYS: Array<[string, ShotType]> = [
  ['S', 'serve_short'], ['L', 'serve_long'], ['D', 'serve_drive']
]

function isReceiveKey(type: ShotType): boolean {
  return type.startsWith('receive_')
}
</script>

<template>
  <div class="space-y-3">
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

    <UAlert
      v-if="props.typePass.overflowWarning.value"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="t('annotation.type.overflow')"
    />

    <div
      v-if="props.typePass.isDone.value"
      class="text-sm text-neutral-500"
    >
      {{ t('annotation.modeDone') }}
    </div>

    <template v-else>
      <!-- ラリー内のショットチップ (入力済み = 種別ラベル / 未入力 = 番号) -->
      <div class="flex flex-wrap gap-1">
        <UBadge
          v-for="shotItem in props.typePass.currentShots.value"
          :key="shotItem.id"
          :color="shotItem.shotType ? 'success' : (shotItem.id === props.typePass.expectedShot.value?.id ? 'primary' : 'neutral')"
          :variant="shotItem.shotType ? 'subtle' : 'outline'"
          size="sm"
        >
          {{ shotItem.shotType ? t(`annotation.shotType.${shotItem.shotType}`) : `#${shotItem.shotNumber}` }}
        </UBadge>
      </div>

      <!-- サーブ三択 (1打目のみ、REQ-109) -->
      <div
        v-if="props.typePass.expectedShot.value?.shotNumber === 1"
        class="space-y-1"
      >
        <p class="text-xs text-neutral-500">
          {{ t('annotation.type.serveHint') }}
        </p>
        <div class="flex flex-col gap-2 lg:max-w-xs">
          <UButton
            v-for="[key, type] in SERVE_KEYS"
            :key="key"
            variant="soft"
            color="primary"
            class="justify-start"
            @click="props.typePass.handleKey(key)"
          >
            <UKbd>{{ key }}</UKbd>
            {{ t(`annotation.shotType.${type}`) }}
          </UButton>
        </div>
      </div>

      <!-- 通常パレット (固定キー。レシーブ文脈では QWE をハイライト、REQ-103)。
           PC は縦一列でキー対応を明示、スマホは3列グリッド -->
      <div
        v-else
        class="grid grid-cols-3 gap-1.5 lg:grid-cols-1 lg:max-w-xs"
      >
        <UButton
          v-for="[key, type] in NORMAL_KEYS"
          :key="key"
          :variant="props.typePass.receiveHighlight.value && isReceiveKey(type) ? 'solid' : 'soft'"
          :color="props.typePass.receiveHighlight.value && isReceiveKey(type) ? 'primary' : 'neutral'"
          size="xs"
          class="lg:justify-start"
          block
          @click="props.typePass.handleKey(key)"
        >
          <UKbd size="sm">
            {{ key }}
          </UKbd>
          {{ t(`annotation.shotType.${type}`) }}
        </UButton>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <!-- 未入力が残っていても次へ進める (押し損ね/押しすぎの現実に合わせる) -->
        <UButton
          :color="props.typePass.rallyComplete.value ? 'primary' : 'neutral'"
          :variant="props.typePass.rallyComplete.value ? 'solid' : 'soft'"
          size="sm"
          icon="i-lucide-chevron-right"
          @click="props.typePass.advanceRally()"
        >
          {{ t('annotation.type.nextRally') }}
        </UButton>
        <span
          v-if="props.typePass.rallyComplete.value"
          class="text-xs text-neutral-500"
        >
          {{ t('annotation.type.rallyDone') }}
        </span>
        <UButton
          variant="ghost"
          size="sm"
          icon="i-lucide-rotate-ccw"
          @click="props.typePass.redoRally()"
        >
          {{ t('annotation.type.redo') }}
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
          v-if="props.typePass.expectedShot.value"
          variant="ghost"
          color="error"
          size="sm"
          icon="i-lucide-minus"
          @click="emit('delete-shot')"
        >
          {{ t('annotation.type.deleteShot') }}
        </UButton>
      </div>
    </template>
  </div>
</template>
