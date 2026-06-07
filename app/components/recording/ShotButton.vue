<script setup lang="ts">
/**
 * ShotButton.vue — 「打った」ボタン。Space キーでも発火 (PC)。スマホは大ボタンをタップ。
 * 関連: TASK-0014 / REQ-005 / NFR-201 / ui-design.md
 */
import { onBeforeUnmount, onMounted } from 'vue'

const props = defineProps<{
  shotCount: number
  disabled?: boolean
}>()

const emit = defineEmits<{ shot: [] }>()

function fire() {
  if (props.disabled) return
  emit('shot')
}

function onKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
  if (e.code === 'Space' || e.key === ' ') {
    // capture + stopPropagation で、フォーカス中のボタン/セレクトに Space を奪われないようにする
    e.preventDefault()
    e.stopPropagation()
    fire()
  }
}

// capture フェーズで登録し、フォーカス対象より先に処理する
onMounted(() => window.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <div class="shot-button">
    <UButton
      block
      size="xl"
      color="primary"
      data-testid="shot-button"
      :disabled="disabled"
      @click="fire"
    >
      {{ $t('record.buttons.shot') }} (Space)
    </UButton>
    <span
      class="shot-count"
      data-testid="shot-count"
    >{{ $t('record.buttons.shotCount') }}: {{ shotCount }}</span>
  </div>
</template>

<style scoped>
.shot-button { display: flex; flex-direction: column; gap: 0.25rem; }
.shot-count { font-size: 0.875rem; color: var(--ui-text-muted); }
</style>
