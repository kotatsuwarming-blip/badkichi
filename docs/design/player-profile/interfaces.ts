/**
 * player-profile TypeScript インターフェース設計
 *
 * 実装先: 既存の player 型（app/types/ 配下）拡張 + app/utils/players/profile.ts
 * スタイル: セミコロンなし / no comma dangle（実装時に準拠）
 */

// ========================================
// PR ①: メンバー区分
// ========================================

export type RosterType = 'member' | 'opponent'

// ========================================
// PR ②: プロフィール
// ========================================

export type PlayerSex = 'male' | 'female' | 'unspecified'

export type PracticeFrequency = 'daily' | 'several_per_week' | 'weekly' | 'monthly' | 'rarely'

/** プレースタイル（REQ-102。9 種・複数選択可・定数 1 箇所） */
export type PlayStyle
  = | 'attacker' | 'defender' | 'all_round' | 'front_player' | 'rear_player'
    | 'rally_oriented' | 'speed_oriented' | 'technical' | 'power'

export const PLAY_STYLES: readonly PlayStyle[] = [
  'attacker', 'defender', 'all_round', 'front_player', 'rear_player',
  'rally_oriented', 'speed_oriented', 'technical', 'power'
]

export const PRACTICE_FREQUENCIES: readonly PracticeFrequency[]
  = ['daily', 'several_per_week', 'weekly', 'monthly', 'rarely']

/** players 行の拡張分（既存 Player 型へ合流） */
export interface PlayerProfileColumns {
  roster_type: RosterType
  sex: PlayerSex
  height_cm: number | null
  weight_kg: number | null
  birthdate: string | null // YYYY-MM-DD
  badminton_since: string | null // YYYY-MM-DD（月単位入力・日は 1 固定）
  practice_frequency: PracticeFrequency | null
  play_styles: PlayStyle[]
}

// ========================================
// 導出関数（app/utils/players/profile.ts）
// ========================================

// deriveAge(birthdate: string | null, today: Date): number | null
//   誕生日を跨いだら +1（月日比較）。null は null
// deriveCareerYears(since: string | null, today: Date): number | null
//   経過年数（切り捨て）。1 年未満は 0（表示側で「1 年未満」）
// sinceFromYears(years: number, today: Date): string
//   「歴 n 年」直接入力の逆算（today − n 年の YYYY-MM-01）
