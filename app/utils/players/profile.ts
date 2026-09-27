/**
 * profile — 選手プロフィールの定数・導出純関数（player-profile PR ②, TASK-0003）
 *
 * 年齢・バドミントン歴は保存せず、生年月日 / 開始時期から表示時に導出する（REQ-105。
 * 直接保存は時間経過で陳腐化するため禁止）。「歴 n 年」の直接入力は開始時期へ逆算保存
 * （REQ-101: 自動で上がる + 編集可能の両立）。
 *
 * 語彙定数は DB CHECK（20260928100000）と 1:1。変更時は migration と揃えること（REQ-102）。
 * スタイル: セミコロンなし / no comma dangle
 */
import type { PlayerProfile, PlayerProfileInput, PlayStyle, PracticeFrequency } from '~/types/player'

/** プレースタイル 9 種（表示順, REQ-102。ヒアリング2026-09-27 でパワー型追加） */
export const PLAY_STYLES: readonly PlayStyle[] = [
  'attacker', 'defender', 'all_round', 'front_player', 'rear_player',
  'rally_oriented', 'speed_oriented', 'technical', 'power'
]

/** 練習頻度 5 段階（表示順, REQ-101） */
export const PRACTICE_FREQUENCIES: readonly PracticeFrequency[]
  = ['daily', 'several_per_week', 'weekly', 'monthly', 'rarely']

/** 入力範囲（フォーム検証。DB CHECK と一致） */
export const PROFILE_LIMITS = {
  heightCm: { min: 100, max: 250 },
  weightKg: { min: 30, max: 150 },
  minBirthdate: '1920-01-01'
} as const

/** YYYY-MM-DD → ローカル日付（時刻ズレ防止のため手動分解） */
function parseDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** 満年齢（誕生日を跨いだら +1）。null / 不正 / 未来日は null（REQ-104/105） */
export function deriveAge(birthdate: string | null, today: Date = new Date()): number | null {
  if (birthdate === null) return null
  const b = parseDate(birthdate)
  if (b === null || b > today) return null
  let age = today.getFullYear() - b.getFullYear()
  const beforeBirthday
    = today.getMonth() < b.getMonth()
      || (today.getMonth() === b.getMonth() && today.getDate() < b.getDate())
  if (beforeBirthday) age -= 1
  return age
}

/** バドミントン歴（経過年数・切り捨て）。1 年未満は 0（表示側で「1年未満」, EDGE-002） */
export function deriveCareerYears(since: string | null, today: Date = new Date()): number | null {
  return deriveAge(since, today)
}

/** 「歴 n 年」直接入力 → 開始時期の逆算（today − n 年の月初, REQ-101） */
export function sinceFromYears(years: number, today: Date = new Date()): string {
  const y = today.getFullYear() - Math.max(0, Math.floor(years))
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  return `${y}-${mm}-01`
}

/** 空のプロフィール入力（create の初期値, REQ-103） */
export function emptyProfileInput(): PlayerProfileInput {
  return {
    sex: 'unspecified',
    heightCm: null,
    weightKg: null,
    birthdate: null,
    badmintonSince: null,
    practiceFrequency: null,
    playStyles: []
  }
}

/** DB 行 → フォーム入力（edit プリフィル） */
export function toProfileInput(p: PlayerProfile): PlayerProfileInput {
  return {
    sex: p.sex,
    heightCm: p.height_cm,
    weightKg: p.weight_kg,
    birthdate: p.birthdate,
    badmintonSince: p.badminton_since,
    practiceFrequency: p.practice_frequency,
    playStyles: [...p.play_styles]
  }
}

/** フォーム入力 → DB 列（insert/update 用 snake_case） */
export function toProfileColumns(input: PlayerProfileInput): {
  sex: string
  height_cm: number | null
  weight_kg: number | null
  birthdate: string | null
  badminton_since: string | null
  practice_frequency: string | null
  play_styles: string[]
} {
  return {
    sex: input.sex,
    height_cm: input.heightCm,
    weight_kg: input.weightKg,
    birthdate: input.birthdate,
    badminton_since: input.badmintonSince,
    practice_frequency: input.practiceFrequency,
    play_styles: [...input.playStyles]
  }
}

/**
 * プロフィールのフォーム検証（EDGE-001）。エラーの i18n キー配列を返す（空 = OK）。
 * 未来日・birthdate より前の since・範囲外の身長/体重を拒否。DB CHECK の最終防衛と対
 */
export function validateProfileInput(input: PlayerProfileInput, today: Date = new Date()): string[] {
  const errors: string[] = []
  const b = input.birthdate !== null ? parseDate(input.birthdate) : null
  const s = input.badmintonSince !== null ? parseDate(input.badmintonSince) : null
  if (input.birthdate !== null && (b === null || b > today || input.birthdate < PROFILE_LIMITS.minBirthdate)) {
    errors.push('players.profile.errors.birthdate')
  }
  if (input.badmintonSince !== null && (s === null || s > today)) {
    errors.push('players.profile.errors.since')
  }
  if (b !== null && s !== null && s < b) {
    errors.push('players.profile.errors.sinceBeforeBirth')
  }
  if (input.heightCm !== null && (input.heightCm < PROFILE_LIMITS.heightCm.min || input.heightCm > PROFILE_LIMITS.heightCm.max)) {
    errors.push('players.profile.errors.height')
  }
  if (input.weightKg !== null && (input.weightKg < PROFILE_LIMITS.weightKg.min || input.weightKg > PROFILE_LIMITS.weightKg.max)) {
    errors.push('players.profile.errors.weight')
  }
  return errors
}
