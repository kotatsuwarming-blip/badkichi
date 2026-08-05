/**
 * video-playback 型定義
 *
 * 作成日: 2026-06-01
 * 関連設計: docs/design/video-playback/architecture.md / dataflow.md
 * 関連要件: docs/spec/video-playback/requirements.md
 * 型定義ソース: docs/design/video-playback/interfaces.ts
 *
 * スタイル: セミコロンなし / no comma dangle（CLAUDE.md ESLint 規約）
 */

import type { Ref } from 'vue'

// ========================================
// 基本型
// ========================================

/** 動画ソース種別（data-foundation matches.video_source_type と整合） 🔵 data-foundation schema / REQ-001 */
export type VideoSourceType = 'youtube' | 'local'

/**
 * 統一再生状態（YouTube/HTML5 を吸収した統一値）
 * 🔵 REQ-007
 * - unstarted: 未ロード/未再生
 * - buffering: バッファ中（EDGE-004）
 * - playing / paused / ended
 */
export type PlayerStatus = 'unstarted' | 'buffering' | 'playing' | 'paused' | 'ended'

/** 再生速度プリセット（バランス型 6 段階） 🔵 REQ-006 ユーザ決定 2026-06-01 */
export type PlaybackRate = 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2

/** 速度プリセット一覧（UI のセレクタ用） 🔵 REQ-006 */
export const PLAYBACK_RATES: readonly PlaybackRate[] = [0.5, 0.75, 1, 1.25, 1.5, 2]

// ========================================
// 動画ソース記述子（discriminated union）
// ========================================

/** YouTube ソース 🔵 REQ-101 */
export interface YouTubeSource {
  type: 'youtube'
  /** matches.video_source_url の YouTube URL */
  url: string
}

/** ローカルソース 🔵 REQ-102 / REQ-103（File は再選択で都度渡す。永続化しない） */
export interface LocalSource {
  type: 'local'
  /** ユーザーが選択した File。再読み込み後は再選択で再供給される */
  file: File
}

/** 動画ソース 🔵 REQ-001 */
export type VideoSource = YouTubeSource | LocalSource

// ========================================
// エラー（cross-cutting/error-handling カテゴリ D）
// ========================================

/** プレーヤーエラーコード（識別子は const 集約・生文字列比較禁止） 🔵 error-handling 原則3 */
export type VideoPlayerErrorCode
  = | 'youtube-invalid-url' // ID 抽出不可 🔵 EDGE-002
    | 'youtube-load-failed' // 埋め込み無効/削除/非公開（IFrame onError 2/5/100/101/150） 🔵 EDGE-001
    | 'local-decode-failed' // 未対応コーデック/破損（HTMLVideoElement error） 🔵 EDGE-003
    | 'local-reselect-needed' // ローカル参照失効 → 再選択が必要 🔵 REQ-103

/**
 * エラーコード const 集約（生文字列比較禁止・原則3）
 * 🔵 error-handling 原則3
 */
export const VIDEO_PLAYER_ERROR_CODE = {
  youtubeInvalidUrl: 'youtube-invalid-url',
  youtubeLoadFailed: 'youtube-load-failed',
  localDecodeFailed: 'local-decode-failed',
  localReselectNeeded: 'local-reselect-needed'
} as const satisfies Record<string, VideoPlayerErrorCode>

/** プレーヤーエラー 🔵 error-handling 原則5（文言は locale JSON、コードに文字列を埋めない） */
export interface VideoPlayerError {
  code: VideoPlayerErrorCode
  /** locale JSON 解決用キー（例: 'videoPlayer.error.youtubeLoadFailed'） */
  messageKey: string
}

// ========================================
// 制御インターフェース（命令的 API）
// ========================================

/**
 * 統一プレーヤー制御契約。YouTubeAdapter / Html5Adapter が実装し、composable が公開する。
 * 🔵 REQ-002 / REQ-003 / REQ-004 / REQ-005
 */
export interface VideoPlayerControls {
  /** 再生 🔵 REQ-003 */
  play(): void
  /** 一時停止 🔵 REQ-003 */
  pause(): void
  /** ms 指定でシーク。範囲外は [0, duration] にクランプ（負値→0 / 超過→duration） 🔵 REQ-005 / REQ-104 */
  seekToMs(ms: number): void
  /** 再生速度変更 🔵 REQ-006 */
  setPlaybackRate(rate: PlaybackRate): void
  /**
   * 現在位置を ms 整数で即時取得（ポーリング不要・同期）。
   * 未ロード時は null を返す（NaN・負値を返さない）。「打った」ボタンの記録経路で使用。
   * 🔵 REQ-004 / REQ-202 / REQ-201 / NFR-001
   */
  getCurrentTimeMs(): number | null
}

// ========================================
// リアクティブ状態（composable が ref で公開）
// ========================================

/** プレーヤーのリアクティブ状態 🔵 REQ-007 / REQ-103 */
export interface VideoPlayerState {
  /** 統一再生状態 🔵 REQ-007 */
  status: PlayerStatus
  /** 総再生時間(ms)。未取得時 null 🔵 REQ-007 / EDGE-102 */
  durationMs: number | null
  /** UI 進捗表示用の現在位置(ms)。requestAnimationFrame で更新（記録経路とは分離） 🔵 NFR-001 */
  currentTimeMs: number
  /** 現在の再生速度 🔵 REQ-006 */
  rate: PlaybackRate
  /** ローカル参照失効で再選択が必要 🔵 REQ-103 */
  needsReselect: boolean
  /** 直近のエラー（なければ null） 🔵 EDGE-001..003 */
  error: VideoPlayerError | null
}

// ========================================
// アダプタ（内部実装契約）
// ========================================

/** アダプタが発火するイベント 🟡 実装で必要十分な最小集合（妥当な推測） */
export type PlayerEvent = 'statuschange' | 'durationchange' | 'error' | 'ended'

/**
 * プレーヤーアダプタ内部契約。YouTubeAdapter / Html5Adapter が実装。
 * VideoPlayer.client.vue が mount/destroy のライフサイクルを管理する。
 * 🔵 architecture.md アダプタパターン / ADR-010
 */
export interface VideoPlayerAdapter extends VideoPlayerControls {
  /** DOM 要素にプレーヤーを束ねて初期化（client-only, onMounted 内） 🔵 ADR-010 D3 */
  mount(el: HTMLElement): Promise<void>
  /** リソース解放（iframe/SDK/オブジェクト URL の破棄） 🔵 */
  destroy(): void
  /** 総再生時間(ms)。未取得時 null 🔵 REQ-007 */
  getDurationMs(): number | null
  /** 現在の統一再生状態 🔵 REQ-007 */
  getStatus(): PlayerStatus
  /** 状態変化等の購読（composable が state へ反映） 🔵 */
  on(event: PlayerEvent, handler: () => void): void
}

// ========================================
// composable 戻り値
// ========================================

/**
 * useVideoPlayer(source) の戻り値。
 * state はリアクティブ（読み取り専用）、controls は命令的 API。
 * attach/detach は VideoPlayer.client.vue が内部的に呼ぶ（上位は通常使わない）。
 * 🔵 ADR-007 / architecture.md
 */
export interface UseVideoPlayerReturn {
  /** リアクティブ状態（読み取り専用） 🔵 */
  state: Readonly<Ref<VideoPlayerState>>
  /** 制御メソッド 🔵 */
  controls: VideoPlayerControls
  /** DOM 要素へアダプタを束ねる（コンポーネント onMounted から） 🔵 */
  attach(el: HTMLElement): Promise<void>
  /** リソース解放（コンポーネント onBeforeUnmount から） 🔵 */
  detach(): void
}

// ========================================
// VideoPlayer.client.vue コンポーネント契約
// ========================================

/**
 * VideoPlayer コンポーネントの props。
 * 親（match-recording 等）が useVideoPlayer で作った player を渡し、
 * コンポーネントは onMounted で player.attach(el) を呼ぶ薄い描画層。
 * 🔵 REQ-008 / architecture.md D2
 */
export interface VideoPlayerProps {
  /** 親が useVideoPlayer(source) で生成したインスタンス 🔵 */
  player: UseVideoPlayerReturn
  /**
   * J/L の ±10 秒スキップを有効にするか (既定 true)。
   * アノテーションの種別/打点モードは L がサーブ入力キーと衝突するため false を渡す
   * (ドッグフーディング 2026-08-03)。
   */
  skipKeys?: boolean
}

/**
 * オーバーレイスロットへ渡すプロパティ。
 * 上位はこれを使ってマーカー位置を left = ms / durationMs で算出する。
 * video-playback は中身（ショット/ラリー）を知らない（REQ-405）。
 * 🔵 REQ-009 / ユーザヒアリング 2026-06-01
 */
export interface VideoPlayerSlotProps {
  /** 総再生時間(ms)。未取得時 null 🔵 REQ-007 */
  durationMs: number | null
  /** UI 進捗用の現在位置(ms) 🔵 REQ-007 */
  currentTimeMs: number
  /** 統一再生状態 🔵 REQ-007 */
  status: PlayerStatus
}

/**
 * VideoPlayer が公開するスロット（汎用・ドメイン非依存）。
 * 🔵 REQ-009
 * - `timeline`: シークバー上に絶対配置されるオーバーレイ層。
 *   match-recording はショットマーカー、stats-dashboard はラリー区切りを描画。
 * - `overlay`: 再生面上のオーバーレイ層。
 *   match-recording は「記録しました」フラッシュ（REQ-406 の表示はここに置ける）。
 * いずれも VideoPlayerSlotProps を受け取る。
 */
export interface VideoPlayerSlots {
  timeline?: (props: VideoPlayerSlotProps) => unknown
  overlay?: (props: VideoPlayerSlotProps) => unknown
}

// ========================================
// 純関数ヘルパー（実装は TASK-0002 / TASK-0003 で app/utils/video-playback/ に配置）
// ========================================
//
// extractYouTubeId(url: string): string | null
//   YouTube URL から動画 ID を抽出。抽出不可なら null。
//   🔵 EDGE-002（再生前検証）
//
// clampMs(ms: number, durationMs: number | null): number
//   ms を有効範囲 [0, durationMs] にクランプ（負値→0 / 超過→durationMs）。
//   durationMs が null の場合は 0 以上に丸めるのみ（上限なし）。
//   🔵 REQ-104 / EDGE-101
