<script setup lang="ts">
/**
 * StatsVideoPane.vue — stats 用の埋め込み動画再生面
 *
 * source から useVideoPlayer を生成し VideoPlayer.client.vue をラップ。timeline スロットに
 * ラリー区切り（rallyMarkersMs）を重ねる。seekToMs を親へ公開し、ラリー行選択時に該当 ms へシーク。
 * Group 横断のソース切替は親が source を変えて :key 再生成する（REQ-104）。
 * local URL 失効時の再選択は VideoPlayer が UI を持ち、reselectFile を親へ転送する（REQ-102）。
 *
 * 関連設計: docs/design/stats-dashboard/{interfaces.ts,dataflow.md} / video-playback VideoPlayer
 * 関連要件: REQ-007 / REQ-011 / REQ-102 / REQ-104
 */
import { computed, watch } from 'vue'
import { useVideoPlayer } from '~/composables/useVideoPlayer'
import type { StatsVideoPaneProps } from '~/types/stats-dashboard'

const props = defineProps<StatsVideoPaneProps>()

const emit = defineEmits<{
  reselectFile: [file: File]
  requestNewSource: []
}>()

const player = useVideoPlayer(props.source)

const markers = computed(() => props.rallyMarkersMs)

// duration に対する左位置 (%)。未取得時は描画しない。
function markerLeft(ms: number, durationMs: number | null): string | null {
  if (!durationMs || durationMs <= 0) return null
  const ratio = Math.min(1, Math.max(0, ms / durationMs))
  return `${ratio * 100}%`
}

// 親（ページ）がラリー選択時に呼ぶ
function seekToMs(ms: number): void {
  player.controls.seekToMs(ms)
}

// autoSeekMs: 値変更 or 動画メタ準備完了（durationMs 取得）で 1 回シーク。
// Group 横断のソース切替（:key 再生成）後に、ロード完了を待ってから該当 ms へ飛ぶ。
let lastSeeked: number | null = null
watch(
  () => [props.autoSeekMs, player.state.value.durationMs] as const,
  ([ms, duration]) => {
    if (ms === null || ms === undefined || duration === null) return
    if (lastSeeked === ms) return
    lastSeeked = ms
    player.controls.seekToMs(ms)
  },
  { immediate: true }
)

defineExpose({ seekToMs, state: player.state })
</script>

<template>
  <div
    class="stats-video-pane"
    data-testid="stats-video-pane"
  >
    <VideoPlayer
      :player="player"
      @reselect-file="emit('reselectFile', $event)"
      @request-new-source="emit('requestNewSource')"
    >
      <template #timeline="{ durationMs }">
        <div
          class="rally-markers"
          data-testid="rally-markers"
        >
          <span
            v-for="(ms, i) in markers"
            :key="i"
            class="rally-marker"
            :style="markerLeft(ms, durationMs) ? { left: markerLeft(ms, durationMs) as string } : { display: 'none' }"
            data-testid="rally-marker"
          />
        </div>
      </template>
    </VideoPlayer>
  </div>
</template>

<style scoped>
.stats-video-pane { width: 100%; }
.rally-markers { position: absolute; top: 0; left: 0; right: 0; height: 0.5rem; pointer-events: none; }
.rally-marker {
  position: absolute;
  top: 0;
  width: 2px;
  height: 0.5rem;
  background: #38bdf8;
  border-radius: 1px;
}
</style>
