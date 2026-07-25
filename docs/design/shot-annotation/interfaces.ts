/**
 * shot-annotation 型定義
 *
 * 作成日: 2026-07-25
 * 関連設計: architecture.md / dataflow.md
 * スタイル: セミコロンなし / no comma dangle（CLAUDE.md ESLint 規約）
 *
 * 信頼性レベル:
 * - 🔵 青信号: EARS要件・ADR-017 §5〜§7・確定スキーマ由来の確実な型
 * - 🟡 黄信号: 上記から妥当な推測による型
 * - 🔴 赤信号: 出典のない推測による型
 *
 * 方針:
 * - ドメイン型は camelCase。DB I/O 時に snake_case へマッピング（既存 composable 準拠）
 * - shots / rallies の行型は migration 適用後の Database 生成型を参照する
 * - 純ロジック（utils/annotation/*）の関数シグネチャもここに集約して単体テストの契約とする
 */

import type { Team, PlayerId } from '~/utils/rule-engine/types'

// ========================================
// 語彙（ADR-017 §6 / §7 の確定値）
// ========================================

/** ショット種別 16種 🔵 ADR-017 §6 */
export type ShotType =
  | 'serve_short' | 'serve_long' | 'serve_drive'
  | 'clear' | 'smash' | 'cut' | 'reverse_cut' | 'drop'
  | 'hairpin' | 'lob' | 'push' | 'half'
  | 'drive'
  | 'receive_long' | 'receive_drive' | 'receive_short'

/** UI 表示グループ（パレットの並びのみ。キー割当は固定） 🔵 ADR-017 §6 */
export type ShotTypeGroup = 'serve' | 'rear' | 'front' | 'flat' | 'receive'

/** ラリー決着 7値 🔵 ADR-017 §7 */
export type EndReason =
  | 'in' | 'out' | 'net' | 'not_over' | 'body' | 'service_fault' | 'unknown'

/** out 細分（落下点未入力時のフォールバック保存値） 🔵 REQ-005 */
export type OutDirection = 'side' | 'back' | 'both'

/** フォア/バック。null = 未判定（トグル OFF のパス） 🔵 REQ-104 */
export type Hand = 'forehand' | 'backhand'

/** 注釈の入力元。MVP は 'human' 固定 🔵 REQ-301 */
export type AnnotationSource = 'human' | 'ai'

// ========================================
// 座標（REQ-014: 絶対正規化座標・範囲外値許容）
// ========================================

/**
 * コート正規化座標。x: 0-1 = コート幅（A側バックバウンダリーから見て左→右）、
 * y: 0-1 = 全長（0 = A側バックバウンダリー、1 = B側）。ライン外は <0 / >1 を許容。
 * 🔵 REQ-014
 */
export interface CourtPoint {
  x: number
  y: number
}

// ========================================
// 注釈値（UPDATE ペイロード）
// ========================================

/** shots への注釈更新（列単位の部分更新） 🔵 REQ-002 */
export interface ShotAnnotationPatch {
  shotType?: ShotType | null
  hand?: Hand | null
  hitPlayerId?: PlayerId | null
  hitX?: number | null
  hitY?: number | null
  annotatedTimestampMs?: number | null // ローカル動画のみ（REQ-010）
}

/** rallies への決着更新 🔵 REQ-002/005 */
export interface RallyEndPatch {
  endReason?: EndReason | null
  landX?: number | null
  landY?: number | null
  outDirection?: OutDirection | null // 落下点スキップ時のみ
}

// ========================================
// セッション・モード
// ========================================

export type AnnotationMode = 'quick' | 'type' | 'position'

/** 巡回位置。レットラリーは列挙から除外済み（REQ-106） 🔵 */
export interface AnnotationCursor {
  setId: string
  rallyId: string
  shotId: string | null // quick モードでは null（ラリー単位巡回）
}

/** モード別進捗（null 有無から導出、REQ-013） 🔵 */
export interface AnnotationProgress {
  mode: AnnotationMode
  done: number
  total: number // レット除外後の分母
  nextCursor: AnnotationCursor | null
}

/** 直前1段 undo のエントリ（REQ-108） 🔵 */
export interface UndoEntry {
  table: 'shots' | 'rallies'
  rowId: string
  patch: ShotAnnotationPatch | RallyEndPatch // 逆適用する旧値
  cursor: AnnotationCursor
}

/** hand トグル（パス単位の宣言、REQ-104） 🔵 */
export interface TypePassOptions {
  recordHand: boolean // true: 無印 = forehand を明示保存 / false: hand を書かない
}

// ========================================
// 純ロジック契約（utils/annotation/*、NFR-401 の単体テスト対象）
// ========================================

/** taxonomy.ts 🔵 ADR-017 §6 */
export interface TaxonomyApi {
  /** キー → 種別。1打目は serve_* 以外を拒否（REQ-109） */
  keyToShotType(key: string, shotNumber: number): ShotType | null
  /** 直前種別がスマッシュ/プッシュ/ドライブ → レシーブ3種ハイライト（REQ-103） */
  isReceiveContext(prevType: ShotType | null): boolean
  groupOf(type: ShotType): ShotTypeGroup
}

/** courtCoords.ts 🔵 REQ-005/014 */
export interface CourtCoordsApi {
  /** 描画座標 → 正規化（ライン外は範囲外値。clamp しない） */
  toNormalized(px: number, py: number, viewport: DOMRectReadOnly): CourtPoint
  fromNormalized(p: CourtPoint, viewport: DOMRectReadOnly): { px: number, py: number }
  /** 落下点から out 細分を導出。コート内座標なら null（EDGE-002 の警告契機） */
  deriveOutDirection(land: CourtPoint): OutDirection | null
}

/** derive.ts 🔵 ADR-017 §7 */
export interface DeriveApi {
  /** 決定打 = 勝者チームの最後のショット（in/body: 最終、out/net/not_over: その1つ前） */
  decisiveShotIndex(shotCount: number, endReason: EndReason, lastHitterWon: boolean): number | null
  /** (最終接触者チーム, end_reason) → 勝者。unknown / service_fault は規定どおり */
  deriveWinner(lastHitterTeam: Team, endReason: EndReason): Team | null
  /** deriveWinner と記録済み point_winner の矛盾検出（REQ-102。未確定ラリーは skip = EDGE-005） */
  checkConsistency(lastHitterTeam: Team, endReason: EndReason, pointWinner: Team | null, isConfirmed: boolean): boolean
}

/** orderMatching.ts 🔵 REQ-007 / EDGE-003 */
export interface OrderMatchingApi {
  /** ラリー内 k 番目のキー入力 → 対象 shot index。超過は null */
  matchKeyToShot(rallyShotCount: number, inputIndex: number): number | null
}

/** offset.ts 🔵 REQ-004/010/101 / EDGE-004 */
export interface OffsetApi {
  /** 校正サンプルの平均遅延（ms、負値 = 実打は押下より過去） */
  averageOffset(samplesMs: number[]): number
  /** モード別の非対称ループ窓。決着 = [-1000, +2500] / 打点探索 = [-1200, +300]。開始は 0 に clamp */
  loopWindowFor(purpose: 'rallyEnd' | 'hitSearch', anchorMs: number): { fromMs: number, toMs: number }
}

// ========================================
// composable 公開シグネチャ（概形） 🟡 実装時に細部確定
// ========================================

export interface AnnotationSessionApi {
  mode: Ref<AnnotationMode>
  cursor: Ref<AnnotationCursor | null>
  progress: ComputedRef<AnnotationProgress[]>
  goTo(cursor: AnnotationCursor): void // 任意位置へ戻って上書き（REQ-108）
  undoLast(): void // 直前1段のみ
  isYoutube: ComputedRef<boolean> // REQ-101 のモード分岐
}
