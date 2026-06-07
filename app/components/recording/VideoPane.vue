<script setup lang="ts">
/**
 * VideoPane.vue — 録画用の動画再生面。VideoPlayer.client.vue をラップし、
 * timeline スロットに「打った」痕跡マーカーを重ねる (NFR-202)。
 * 関連: TASK-0013 / REQ-004 / video-playback REQ-009 (overlay slot)
 * 方針: 再生制御は VideoPlayer/useVideoPlayer に委譲 (依存方向は match-recording → video-playback)。
 */
import { computed } from 'vue'
import type { UseVideoPlayerReturn } from '~/types/video-playback'

const props = defineProps<{
  player: UseVideoPlayerReturn
  shotMarkers: number[] // 各ショットの video_timestamp_ms
}>()

// durationMs に対する痕跡の左位置 (%)。未取得時は描画しない。
function markerLeft(ms: number, durationMs: number | null): string | null {
  if (!durationMs || durationMs <= 0) return null
  const ratio = Math.min(1, Math.max(0, ms / durationMs))
  return `${ratio * 100}%`
}

const markers = computed(() => props.shotMarkers)
</script>

<template>
  <div
    class="video-pane"
    data-testid="video-pane"
  >
    <VideoPlayer :player="player">
      <template #timeline="{ durationMs }">
        <div
          class="shot-markers"
          data-testid="shot-markers"
        >
          <span
            v-for="(ms, i) in markers"
            :key="i"
            class="shot-marker"
            :style="markerLeft(ms, durationMs) ? { left: markerLeft(ms, durationMs) as string } : { display: 'none' }"
            data-testid="shot-marker"
          />
        </div>
      </template>
    </VideoPlayer>
  </div>
</template>

<style scoped>
.video-pane { width: 100%; }
/* シークバー上端 (timeline の padding-top 領域) に痕跡マーカーを並べる */
.shot-markers { position: absolute; top: 0; left: 0; right: 0; height: 0.5rem; pointer-events: none; }
.shot-marker {
  position: absolute;
  top: 0;
  width: 3px;
  height: 0.5rem;
  background: #ffce3a;
  border-radius: 1px;
  transform: translateX(-1.5px);
  box-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
}
</style>
