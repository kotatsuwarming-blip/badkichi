/**
 * taxonomy — ショット種別の語彙・キー割当・文脈規則の純関数。
 *
 * 関連: TASK-0003 / REQ-007 / REQ-103 / REQ-109 / ADR-017 §6
 * 方針: キー割当は常に固定（筋肉記憶保護）。文脈（レシーブ局面）は選択肢を減らさず
 *       ハイライト表示の判定にのみ使う。1打目はサーブ三択に制限する。
 */
import type { ShotType, ShotTypeGroup } from '~/types/shot-annotation'

/** 通常ショットの固定キー割当（数字段 + QWE、ui-design.md）。パネル表示にも共用 */
export const TYPE_KEY_BINDINGS: ReadonlyArray<[string, ShotType]> = [
  ['1', 'clear_high'], ['D', 'clear_driven'], // clear 分割 (1=ハイ / D=Driven、2026-08-05)
  ['2', 'smash'], ['3', 'cut'], ['4', 'reverse_cut'], ['5', 'drop'],
  ['6', 'drive'], ['7', 'push'], ['8', 'half'], ['9', 'hairpin'],
  ['0', 'lob_high'], ['L', 'lob_low'], // lob 分割 (0=ハイ / L=Low の頭文字、2026-08-05)
  ['Q', 'receive_long'], ['W', 'receive_drive'], ['E', 'receive_short'],
  ['U', 'unknown'] // 判定不能 (ミスヒット等。2026-08-03)
]

/** 1打目（サーブ）の三択キー（REQ-109）。パネル表示にも共用 */
export const SERVE_KEY_BINDINGS: ReadonlyArray<[string, ShotType]> = [
  ['S', 'serve_short'], ['L', 'serve_long'], ['D', 'serve_drive']
]

const KEY_TO_SHOT_TYPE: Record<string, ShotType> = Object.fromEntries(
  TYPE_KEY_BINDINGS.map(([key, type]) => [key.toLowerCase(), type])
)

const SERVE_KEY_TO_SHOT_TYPE: Record<string, ShotType> = Object.fromEntries(
  SERVE_KEY_BINDINGS.map(([key, type]) => [key.toLowerCase(), type])
)

/** レシーブハイライトを発火させる直前種別（REQ-103） */
const RECEIVE_TRIGGERS: ReadonlySet<ShotType> = new Set(['smash', 'push', 'drive'])

const GROUP_OF: Record<ShotType, ShotTypeGroup> = {
  serve_short: 'serve',
  serve_long: 'serve',
  serve_drive: 'serve',
  clear: 'rear', // レガシー (2026-08-05 分割前の既存データ)
  clear_high: 'rear',
  clear_driven: 'rear',
  smash: 'rear',
  cut: 'rear',
  reverse_cut: 'rear',
  drop: 'rear',
  hairpin: 'front',
  lob: 'front', // レガシー (2026-08-05 分割前の既存データ)
  lob_high: 'front',
  lob_low: 'front',
  push: 'front',
  half: 'front',
  drive: 'flat',
  receive_long: 'receive',
  receive_drive: 'receive',
  receive_short: 'receive',
  unknown: 'other'
}

/**
 * キー入力を種別へ解決する。1打目はサーブ三択のみ、2打目以降はサーブキー無効。
 * 未割当キーは null（呼び出し側で無視）。
 */
export function keyToShotType(key: string, shotNumber: number): ShotType | null {
  const k = key.toLowerCase()
  if (shotNumber === 1) {
    return SERVE_KEY_TO_SHOT_TYPE[k] ?? null
  }
  return KEY_TO_SHOT_TYPE[k] ?? null
}

/** 直前ショットの種別からレシーブ局面かを判定（未注釈 null は false） */
export function isReceiveContext(prevType: ShotType | null): boolean {
  return prevType !== null && RECEIVE_TRIGGERS.has(prevType)
}

/** UI 表示グループ（パレットの並び用。キー割当とは独立） */
export function groupOf(type: ShotType): ShotTypeGroup {
  return GROUP_OF[type]
}
