/**
 * suggest — 打点から種別候補を推定する純関数 (ドッグフーディング 2026-08-05)。
 *
 * 打点パスを先に入力しておくと、種別パスで「自打点の深さ × 行き先の深さ」から
 * ありうる種別を強調表示できる (選択の認知負荷を下げて種別パスを速くする)。
 * 行き先 = 次ショットの打点 (最終打はラリーの落下点)。あくまで強調のみで、
 * 候補外のキー入力も従来どおり有効。
 *
 * ゾーン閾値・対応表は試用後に調整する前提の初期値 (D6 と同じ扱い)。
 */
import type { ShotType } from '~/types/shot-annotation'
import { isReceiveContext } from './taxonomy'

/** ネットからの距離によるコート深さゾーン (正規化 y、ネット = 0.5) */
export type CourtZone = 'front' | 'mid' | 'rear'

/** front: ショートサービスライン (1.98m/13.4m ≒ 0.148) 付近まで / rear: 奥1/3 */
const FRONT_MAX = 0.15
const REAR_MIN = 0.32

export function zoneOfY(y: number): CourtZone {
  const d = Math.min(0.5, Math.abs(y - 0.5))
  if (d < FRONT_MAX) return 'front'
  if (d > REAR_MIN) return 'rear'
  return 'mid'
}

/** 自打点ゾーン × 行き先ゾーン (unknown = 行き先不明) → 候補種別 (2026-08-05 ユーザー校正済み) */
const ZONE_SUGGESTIONS: Record<CourtZone, Record<CourtZone | 'unknown', ShotType[]>> = {
  rear: {
    rear: ['clear_high', 'clear_driven'],
    mid: ['smash', 'clear_driven', 'cut', 'reverse_cut', 'drive'],
    front: ['drop', 'cut', 'reverse_cut'],
    unknown: ['clear_high', 'clear_driven', 'smash', 'drop', 'cut', 'reverse_cut']
  },
  mid: {
    rear: ['drive', 'lob_high', 'lob_low'],
    mid: ['drive', 'half', 'push'],
    front: ['half', 'hairpin', 'drop'],
    unknown: ['drive', 'half', 'push']
  },
  front: {
    rear: ['lob_high', 'lob_low', 'push'],
    mid: ['push', 'drive', 'half', 'lob_low'],
    front: ['hairpin'],
    unknown: ['hairpin', 'lob_high', 'lob_low', 'push']
  }
}

export interface SuggestInput {
  shotNumber: number
  /** 自ショットの打点 y (未入力 null) */
  hitY: number | null
  /** 行き先 y: 次ショットの打点 or 最終打はラリー落下点 (どちらも無ければ null) */
  destY: number | null
  /** 直前ショットの種別 (レシーブ文脈、REQ-103) */
  prevType: ShotType | null
}

/**
 * 種別候補を返す。1打目はサーブ三択 UI 側で完結するため常に空。
 * 打点未入力なら位置由来の候補なし (レシーブ文脈のみ)。
 */
export function suggestShotTypes(input: SuggestInput): ShotType[] {
  if (input.shotNumber === 1) return []
  const out: ShotType[] = []
  if (input.hitY !== null) {
    const from = zoneOfY(input.hitY)
    const to = input.destY !== null ? zoneOfY(input.destY) : 'unknown'
    out.push(...ZONE_SUGGESTIONS[from][to])
  }
  if (isReceiveContext(input.prevType)) {
    out.push('receive_long', 'receive_drive', 'receive_short')
  }
  return [...new Set(out)]
}
