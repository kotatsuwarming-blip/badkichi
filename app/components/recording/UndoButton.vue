<script setup lang="ts">
/**
 * UndoButton.vue — 統一「取り消し」ボタン。Backspace キーでも発火 (PC)。
 * labelKey (文脈ラベル) を翻訳して表示。取り消し対象が無い (labelKey=null) と disabled。
 * 関連: TASK-0014 / REQ-110 / ui-design.md
 */
import { computed, onBeforeUnmount, onMounted } from 'vue'

const props = defineProps<{
  labelKey: string | null
}>()

const emit = defineEmits<{ undo: [] }>()

const disabled = computed(() => props.labelKey === null)

function fire() {
  if (disabled.value) return
  emit('undo')
}

function onKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
  if (e.key === 'Backspace') {
    e.preventDefault()
    e.stopPropagation()
    fire()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <UButton
    variant="soft"
    color="neutral"
    icon="i-lucide-undo-2"
    data-testid="undo-button"
    :disabled="disabled"
    @click="fire"
  >
    {{ labelKey ? $t(labelKey) : $t('record.undo.none') }}
  </UButton>
</template>
