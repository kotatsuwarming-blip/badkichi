<script setup lang="ts">
/**
 * 【機能概要】: video-playback ユニット手動検証用デモページ (/dev/video-playback)
 * 【位置づけ】:
 *   - video-playback は match-recording / stats-dashboard が消費する基盤ユニット。
 *     本ページは UI からユーザストーリー (user-stories.md) を手動確認するための dev 専用画面。
 *   - 本来の利用者は上位ユニットのため、ここの文言は dev 限定リテラル（locale 化しない）。
 *     VideoPlayer 内部の aria-label / エラー文言は i18n キー (videoPlayer.*) で解決される。
 * 【カバーするストーリー】:
 *   1.1 YouTube URL 再生 / 1.2 ローカル再生+再選択 / 1.3 速度変更
 *   2.1 現在時刻 ms 取得（「打った」） / 2.2 指定 ms シーク / 3.1 エラー通知
 * 【保護】: auth.global.ts により login + group 所属が前提（middleware 変更なし）。
 */

import { computed, ref, shallowRef } from 'vue'
import type { UseVideoPlayerReturn, VideoSource } from '~/types/video-playback'

// 【ソース選択状態】
const sourceType = ref<'youtube' | 'local'>('youtube')
const sourceItems = [
  { label: 'YouTube URL', value: 'youtube' },
  { label: 'ローカルファイル', value: 'local' }
]
// 埋め込み可能なサンプル（Blender Open Movie "Big Buck Bunny"）。差し替え可。
const youtubeUrl = ref('https://www.youtube.com/watch?v=aqz-KE-bpKQ')
const selectedFile = ref<File | null>(null)

// 【player インスタンス】: ソース確定時に生成し、:key 更新で VideoPlayer を再マウントする。
// VideoPlayer が onMounted で attach / onBeforeUnmount で前 player を detach する。
const player = shallowRef<UseVideoPlayerReturn | null>(null)
const playerKey = ref(0)

// 【検証パネル状態】
const capturedTimes = ref<number[]>([]) // 「打った」で取得した ms 履歴
const seekTargetMs = ref<number>(10000) // 2.2 ジャンプ先 ms

// state インスペクタ（リアクティブに追従）
const state = computed(() => player.value?.state.value ?? null)

function buildSource(): VideoSource | null {
  if (sourceType.value === 'youtube') {
    const url = youtubeUrl.value.trim()
    return url ? { type: 'youtube', url } : null
  }
  return selectedFile.value ? { type: 'local', file: selectedFile.value } : null
}

function startPlayback(): void {
  const source = buildSource()
  if (!source) return
  player.value = useVideoPlayer(source)
  capturedTimes.value = []
  playerKey.value++
}

function onFileChange(event: Event): void {
  selectedFile.value = (event.target as HTMLInputElement).files?.[0] ?? null
}

// 2.1 「打った」: 現在の再生位置を同期取得（ポーリングなし）
function capture(): void {
  const ms = player.value?.controls.getCurrentTimeMs() ?? null
  if (ms !== null) capturedTimes.value = [ms, ...capturedTimes.value].slice(0, 10)
}

// 2.2 指定 ms へジャンプ（範囲外はアダプタ側でクランプ）
function jump(): void {
  player.value?.controls.seekToMs(seekTargetMs.value)
}

// 3.1 youtube-load-failed の「別動画を指定」導線
function onRequestNewSource(): void {
  player.value = null
}

// 1.2 ローカル参照失効時の再選択導線（ユーザ操作起点で新 File を再供給）
function onReselectFile(file: File): void {
  player.value = useVideoPlayer({ type: 'local', file })
  capturedTimes.value = []
  playerKey.value++
}

// ms → mm:ss.mmm 表示
function fmt(ms: number | null): string {
  if (ms == null) return '--:--.---'
  const total = Math.floor(ms / 1000)
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  const mmm = String(ms % 1000).padStart(3, '0')
  return `${mm}:${ss}.${mmm}`
}
</script>

<template>
  <UContainer class="flex flex-col gap-6 py-8">
    <div class="flex flex-col gap-1">
      <h1 class="text-2xl font-bold">
        video-playback 手動検証 (dev)
      </h1>
      <p class="text-sm text-muted">
        VideoPlayer.client.vue + useVideoPlayer をユーザストーリー単位で確認する dev 専用ページ。
      </p>
    </div>

    <!-- ソース選択（ストーリー 1.1 / 1.2） -->
    <UCard>
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-end">
          <UFormField
            label="ソース種別"
            class="sm:w-48"
          >
            <USelect
              v-model="sourceType"
              :items="sourceItems"
            />
          </UFormField>

          <UFormField
            v-if="sourceType === 'youtube'"
            label="YouTube URL"
            class="flex-1"
          >
            <UInput
              v-model="youtubeUrl"
              placeholder="https://www.youtube.com/watch?v=..."
            />
          </UFormField>

          <UFormField
            v-else
            label="動画ファイル"
            class="flex-1"
          >
            <input
              type="file"
              accept="video/*"
              @change="onFileChange"
            >
          </UFormField>

          <UButton
            label="再生開始"
            icon="i-lucide-play"
            @click="startPlayback"
          />
        </div>
        <p class="text-xs text-muted">
          ※ 無効な YouTube URL（例: https://example.com/x）でストーリー 3.1（エラー通知）を確認できます。
        </p>
      </div>
    </UCard>

    <!-- プレーヤー本体 + 汎用スロットのデモ（ストーリー 1.3 速度 / 2.2 timeline） -->
    <UCard v-if="player">
      <VideoPlayer
        :key="playerKey"
        :player="player"
        @reselect-file="onReselectFile"
        @request-new-source="onRequestNewSource"
      >
        <!-- overlay: 再生面オーバーレイ層（slot props を受け取るだけ。ドメイン非依存 REQ-009/405） -->
        <template #overlay="{ currentTimeMs, status }">
          <div class="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-xs text-white">
            {{ status }} · {{ fmt(currentTimeMs) }}
          </div>
        </template>

        <!-- timeline: シークバー上の絶対配置層。left = ms/durationMs は「上位」が算出する -->
        <template #timeline="{ currentTimeMs, durationMs }">
          <div
            v-if="durationMs"
            class="pointer-events-none absolute top-0 h-full w-0.5 bg-primary"
            :style="{ left: `${(currentTimeMs / durationMs) * 100}%` }"
          />
        </template>
      </VideoPlayer>
    </UCard>

    <div
      v-if="player"
      class="grid gap-6 md:grid-cols-2"
    >
      <!-- 時刻インターフェース（ストーリー 2.1 / 2.2） -->
      <UCard>
        <template #header>
          <h2 class="font-semibold">
            時刻インターフェース（上位ユニット向け）
          </h2>
        </template>
        <div class="flex flex-col gap-4">
          <div class="flex items-center gap-3">
            <UButton
              label="打った（現在時刻を取得）"
              color="primary"
              icon="i-lucide-target"
              @click="capture"
            />
            <span class="text-sm text-muted">getCurrentTimeMs() を同期取得</span>
          </div>
          <ul class="flex flex-col gap-1 text-sm font-mono">
            <li
              v-for="(ms, i) in capturedTimes"
              :key="i"
            >
              #{{ capturedTimes.length - i }} → {{ ms }} ms（{{ fmt(ms) }}）
            </li>
            <li
              v-if="capturedTimes.length === 0"
              class="text-muted"
            >
              まだ取得していません
            </li>
          </ul>

          <div class="flex items-end gap-2 border-t border-default pt-4">
            <UFormField
              label="ジャンプ先 (ms)"
              class="w-40"
            >
              <UInput
                v-model.number="seekTargetMs"
                type="number"
              />
            </UFormField>
            <UButton
              label="シーク"
              icon="i-lucide-skip-forward"
              @click="jump"
            />
          </div>
        </div>
      </UCard>

      <!-- state インスペクタ -->
      <UCard>
        <template #header>
          <h2 class="font-semibold">
            state インスペクタ
          </h2>
        </template>
        <dl
          v-if="state"
          class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm font-mono"
        >
          <dt class="text-muted">
            status
          </dt>
          <dd>{{ state.status }}</dd>
          <dt class="text-muted">
            durationMs
          </dt>
          <dd>{{ state.durationMs ?? 'null' }}</dd>
          <dt class="text-muted">
            currentTimeMs
          </dt>
          <dd>{{ state.currentTimeMs }}</dd>
          <dt class="text-muted">
            rate
          </dt>
          <dd>{{ state.rate }}x</dd>
          <dt class="text-muted">
            needsReselect
          </dt>
          <dd>{{ state.needsReselect }}</dd>
          <dt class="text-muted">
            error
          </dt>
          <dd>{{ state.error?.code ?? 'null' }}</dd>
        </dl>
      </UCard>
    </div>

    <p
      v-if="!player"
      class="text-sm text-muted"
    >
      ソースを選んで「再生開始」を押すとプレーヤーが表示されます。
    </p>
  </UContainer>
</template>
