/**
 * 【ファイル概要】: 招待リンク関連のユーティリティ純関数
 * 【配置理由】: DB に status 列が存在しないため、UI 側が有効/期限切れを派生算出する必要がある。
 *              page から切り出した純関数として app/utils/ に配置し、mock-unit でテスト可能にする。
 *              先例: app/utils/redirect.ts (buildLoginRedirect, TASK-0018)
 * 🔵 TASK-0019 / EDGE-107 / requirements.md §2/§4 / testcases.md §0
 */

/**
 * 【型定義】: 招待リンクの状態ユニオン型
 * 【値の意味】: 'active' = 有効 (expires_at >= now)、'expired' = 期限切れ (expires_at < now)
 * 🔵 requirements.md §2 出力仕様
 */
export type InvitationStatus = 'active' | 'expired'

/**
 * 【機能概要】: 招待リンクの有効/期限切れ状態を派生算出する純関数
 * 【実装方針】: DB の group_invitations テーブルに status 列が存在しないため、
 *              expires_at と現在時刻を ms 単位で比較して UI が状態を算出する。
 *              expires_at < now のみ 'expired'、それ以外 (>= now、境界 == 含む) は 'active'。
 *              境界 expires_at == now は厳密未満 '<' 比較なので 'active' に分類する (EDGE-107 確定仕様)。
 * 【テスト対応】: TC-01 (active/未来), TC-02 (expired/過去), TC-03 (EDGE-107: == → active)
 * 【単一責任】: 数値 2 引数の比較による状態分類のみ。ISO 文字列パースや Date 変換は呼び出し側の責務。
 * 🔵 信頼性レベル: requirements.md §2「expires_at < now() → 'expired'、境界 == は 'active'」/
 *              testcases.md §0 函数シグネチャ (推測なし)
 * @param expiresAt - 招待リンクの有効期限 (epoch milliseconds)。呼び出し側が Date.parse() 等で ms 化して渡す
 * @param now - 現在時刻 (epoch milliseconds)。Date.now() 等で取得した値を渡す
 * @returns 'active' (有効: expiresAt >= now) または 'expired' (期限切れ: expiresAt < now)
 */
export function deriveInvitationStatus(expiresAt: number, now: number): InvitationStatus {
  // 【状態判定】: expiresAt が now より厳密に小さい (< 比較) 場合のみ期限切れとする。
  //   境界 expiresAt == now は '1000 < 1000' = false のため 'active' に分類される (EDGE-107 確定仕様)。
  //   '<=' ではなく '<' を使うことで EDGE-107 の境界挙動を回帰から守る。 🔵
  if (expiresAt < now) {
    // 【期限切れ分岐】: expires_at が現在時刻より過去 → 'expired' を返す
    return 'expired'
  }

  // 【有効分岐】: expires_at が現在時刻以上 (未来 または 境界 ==) → 'active' を返す
  return 'active'
}
