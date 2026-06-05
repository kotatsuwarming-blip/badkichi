/**
 * decideOverrideType — position_overrides.override_type を決定する純関数。
 *
 * 関連: REQ-105 / docs/design/match-recording/architecture.md（swapped/restored の不整合解消）
 * 方針: rule-engine の applyOverride は状態を持たないトグルだが、DB は override_type
 *       ('swapped' | 'restored') の意味ラベルを保存する。当該チームの既存 override 回数の
 *       偶奇でラベルを決める（偶数回目=入れ替わり=swapped / 奇数回目=戻り=restored）。
 *       engine へは applyOverride(team) を渡す（ラベルに依らずトグル）。
 */

import type { DecideOverrideType } from '~/types/match-recording'

export const decideOverrideType: DecideOverrideType = (existingOverrideCount: number) =>
  existingOverrideCount % 2 === 0 ? 'swapped' : 'restored'
