/**
 * mapGameStateToRallyDenorm — rule-engine GameState を rallies の denormalize 列へ写像する純関数。
 *
 * 関連: REQ-410 / docs/design/match-recording/architecture.md「GameState→rallies denormalize マッピング」
 * 方針: ラリー開始時点の GameState（誰がこのラリーをサーブするか）を rallies の状態列へ写す。
 *       修正/override 時も同じ写像で上書きし、二重管理しない（denormalize 一貫性）。
 *       camera_near_team はセット開始時の値を carry（MVP セット単位、REQ-002）。
 */

import type { Team } from '~/utils/rule-engine/types'
import type { MapGameStateToRallyDenorm } from '~/types/match-recording'

export const mapGameStateToRallyDenorm: MapGameStateToRallyDenorm = (state, cameraNearTeam: Team | null) => ({
  servingTeam: state.servingTeam,
  serverPosition: state.serverPosition,
  serverPlayerId: state.server,
  receiverPlayerId: state.receiver,
  cameraNearTeam
})
