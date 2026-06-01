import { describe, expect, it } from 'vitest'
import { deriveInvitationStatus } from '~/utils/invitation'

describe('deriveInvitationStatus', () => {
  // 【テスト目的】: 招待リンクの有効/期限切れ派生算出 (expires_at < now) が正しく分類されることを確認する
  // 【テスト内容】: ms 数値 2 引数 (expiresAt, now) の厳密未満比較による 'active' / 'expired' 分類
  // 【期待される動作】: expires_at < now のみ 'expired'、>= now (境界 == 含む) は 'active'
  // 🔵 EDGE-107 / requirements.md §2・§4

  it('TC-01: 期限が未来なら active を返す', () => {
    // 【テストデータ準備】: 期限が現在より 1000ms 先 = 失効していない有効リンク
    // 【前提条件確認】: 純関数のため外部状態・mock は不要
    const expiresAt = 2000
    const now = 1000

    // 【実際の処理実行】: deriveInvitationStatus を呼び出し状態を派生算出
    const result = deriveInvitationStatus(expiresAt, now)

    // 【結果検証】: 未失効リンクは 'active'
    // 【検証項目】: 戻り値が 'active' であること 🔵
    expect(result).toBe('active') // 【確認内容】: expires_at > now は有効と分類される
  })

  it('TC-02: 期限が過去なら expired を返す', () => {
    // 【テストデータ準備】: 期限が現在より 1000ms 過去 = 既に失効したリンク
    const expiresAt = 1000
    const now = 2000

    // 【実際の処理実行】: deriveInvitationStatus を呼び出し状態を派生算出
    const result = deriveInvitationStatus(expiresAt, now)

    // 【結果検証】: 失効リンクは 'expired'
    // 【検証項目】: 戻り値が 'expired' であること 🔵
    expect(result).toBe('expired') // 【確認内容】: expires_at < now は期限切れと分類される
  })

  it('TC-03: 期限が現在時刻と同値なら active を返す (EDGE-107 境界)', () => {
    // 【テストデータ準備】: 期限 == 現在時刻ちょうどの境界値。< の厳密未満で 'active' 側に確定する仕様
    // 【初期条件設定】: expiresAt と now を同一値 (1000) に設定し等値境界を表現
    const expiresAt = 1000
    const now = 1000

    // 【実際の処理実行】: 境界値で deriveInvitationStatus を呼び出す
    const result = deriveInvitationStatus(expiresAt, now)

    // 【結果検証】: 1000 < 1000 は偽 → 期限切れに該当せず 'active'
    // 【品質保証】: < と <= の取り違え回帰を防ぎ EDGE-107 境界仕様を固定する
    // 【検証項目】: 等値境界で 'active' を返すこと 🔵
    expect(result).toBe('active') // 【確認内容】: expires_at == now は厳密未満比較により 'active'
  })
})
