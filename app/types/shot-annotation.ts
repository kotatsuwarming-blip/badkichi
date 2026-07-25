/**
 * shot-annotation 型定義
 *
 * 関連: TASK-0002 / docs/design/shot-annotation/interfaces.ts / ADR-017 §5〜§7
 * 方針: ドメイン型は camelCase。DB I/O 時に snake_case へマッピング（既存 composable 準拠）。
 *       語彙 (ShotType / EndReason 等) は migration の CHECK 制約と一致させる
 *       (単一ソース: ここの const 配列から union 型を導出する)。
 */
import type { Team, PlayerId } from '~/utils/rule-engine/types'

// ========================================
// 語彙（ADR-017 §6 / §7 の確定値 = CHECK 制約と一致）
// ========================================

/** ショット種別 16種 (ADR-017 §6) */
export const SHOT_TYPES = [
  'serve_short', 'serve_long', 'serve_drive',
  'clear', 'smash', 'cut', 'reverse_cut', 'drop',
  'hairpin', 'lob', 'push', 'half',
  'drive',
  'receive_long', 'receive_drive', 'receive_short'
] as const

export type ShotType = typeof SHOT_TYPES[number]

/** UI 表示グループ（パレットの並びのみ。キー割当は固定） */
export type ShotTypeGroup = 'serve' | 'rear' | 'front' | 'flat' | 'receive'

/** ラリー決着 7値 (ADR-017 §7) */
export const END_REASONS = [
  'in', 'out', 'net', 'not_over', 'body', 'service_fault', 'unknown'
] as const

export type EndReason = typeof END_REASONS[number]

/** out 細分（落下点未入力時のフォールバック保存値、REQ-005） */
export type OutDirection = 'side' | 'back' | 'both'

/** フォア/バック。null = 未判定（hand トグル OFF のパス、REQ-104） */
export type Hand = 'forehand' | 'backhand'

/** 注釈の入力元。MVP は 'human' 固定（REQ-301） */
export type AnnotationSource = 'human' | 'ai'

// ========================================
// 座標（REQ-014: 絶対正規化座標・範囲外値許容）
// ========================================

/**
 * コート正規化座標。x: 0-1 = コート幅、y: 0-1 = 全長
 * (y=0 = チームA側バックバウンダリー)。ライン外は <0 / >1 を許容。
 */
export interface CourtPoint {
  x: number
  y: number
}

/** コート図の描画領域（ラインの内側矩形）。DOMRect 互換の部分集合 */
export interface CourtRect {
  left: number
  top: number
  width: number
  height: number
}

// ========================================
// 注釈値（UPDATE ペイロード）
// ========================================

/** shots への注釈更新（列単位の部分更新、REQ-002） */
export interface ShotAnnotationPatch {
  shotType?: ShotType | null
  hand?: Hand | null
  hitPlayerId?: PlayerId | null
  hitX?: number | null
  hitY?: number | null
  /** ローカル動画のみ（REQ-010）。押下時刻 videoTimestampMs は不変 */
  annotatedTimestampMs?: number | null
}

/** rallies への決着更新（REQ-002 / REQ-005） */
export interface RallyEndPatch {
  endReason?: EndReason | null
  landX?: number | null
  landY?: number | null
  /** 落下点スキップ時のみ */
  outDirection?: OutDirection | null
}

// ========================================
// セッション・モード
// ========================================

export type AnnotationMode = 'quick' | 'type' | 'position'

/** 巡回位置。レットラリーは列挙から除外済み（REQ-106） */
export interface AnnotationCursor {
  setId: string
  rallyId: string
  /** quick モードでは null（ラリー単位巡回） */
  shotId: string | null
}

/** モード別進捗（null 有無から導出、REQ-013） */
export interface AnnotationProgress {
  mode: AnnotationMode
  done: number
  /** レット除外後の分母 */
  total: number
  nextCursor: AnnotationCursor | null
}

/** 直前1段 undo のエントリ（REQ-108） */
export interface UndoEntry {
  table: 'shots' | 'rallies'
  rowId: string
  /** 逆適用する旧値 */
  patch: ShotAnnotationPatch | RallyEndPatch
  cursor: AnnotationCursor
}

/** hand トグル（パス単位の宣言、REQ-104） */
export interface TypePassOptions {
  /** true: 無印 = forehand を明示保存 / false: hand を書かない */
  recordHand: boolean
}

// ========================================
// ループ窓（REQ-004 / REQ-101 の非対称窓）
// ========================================

/** 決着を見る（後ろ長め）/ 打球瞬間を探す（前長め） */
export type LoopPurpose = 'rallyEnd' | 'hitSearch'

export interface LoopWindow {
  fromMs: number
  toMs: number
}

// ========================================
// 整合チェック補助（REQ-102）
// ========================================

/** deriveWinner の入力に使う最終接触者情報 */
export interface LastContact {
  team: Team
  playerId: PlayerId | null
}

// ========================================
// セッションが読み込むドメイン行（snake→camel 写像後）
// ========================================

export interface AnnotationMatchInfo {
  id: string
  videoSourceType: 'youtube' | 'local'
  videoSourceUrl: string
}

export interface AnnotationRosterEntry {
  playerId: PlayerId
  name: string
  team: Team
}

/** レット除外済みで保持するラリー行（D5: 除外は session 読込直後に一元適用） */
export interface AnnotationRally {
  id: string
  setId: string
  setNumber: number
  rallyNumber: number
  servingTeam: Team
  serverPlayerId: PlayerId
  receiverPlayerId: PlayerId
  pointWinner: Team | null
  isPointConfirmed: boolean
  videoStartTimestampMs: number | null
  endReason: EndReason | null
  landX: number | null
  landY: number | null
  outDirection: OutDirection | null
}

export interface AnnotationShot {
  id: string
  rallyId: string
  shotNumber: number
  videoTimestampMs: number | null
  annotatedTimestampMs: number | null
  shotType: ShotType | null
  hand: Hand | null
  hitPlayerId: PlayerId | null
  hitX: number | null
  hitY: number | null
}
