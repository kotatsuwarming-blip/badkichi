import { describe, expect, it } from 'vitest'
import { buildLoginRedirect } from '~/utils/redirect'

describe('buildLoginRedirect', () => {
  it('TC-D2-1: 通常パスから redirect クエリ付き login URL を生成する', () => {
    // 【テスト目的】: code を含む着地パスが redirect クエリとして欠落せず保持されることを確認
    // 【テスト内容】: 標準的な /join/ABC12345 を入力し /login?redirect=<encoded> を得る
    // 【期待される動作】: encodeURIComponent でエンコードされ /login へ正しく運搬される
    // 🔵 信頼性レベル: REQ-108 / EDGE-001 に基づく（推測なし）

    // 【テストデータ準備】: 8 文字想定 code を含む典型パス。リダイレクトチェーン起点 (UC2) を代表
    const path = '/join/ABC12345'

    // 【実際の処理実行】: 純粋関数 buildLoginRedirect を呼ぶ（副作用なし）
    const result = buildLoginRedirect(path)

    // 【結果検証】: プレフィックス + エンコード済みパスの完全一致
    // 【期待値確認】: code を含むパスが %2F エンコードで保持されることを確認
    expect(result).toBe('/login?redirect=%2Fjoin%2FABC12345') // 【確認内容】: code を含むパスが欠落・破損せずエンコードされること 🔵
  })

  it('TC-D2-2: 特殊文字・スペースを含むパスを URL 安全にエンコードする', () => {
    // 【テスト目的】: スペース・& を含む不正 code でも URL 構文が壊れないことを確認
    // 【テスト内容】: /join/a b&c を入力し %20 / %26 にエンコードされることを検証
    // 【期待される動作】: redirect クエリ値が単一値として閉じ、クエリ衝突を起こさない
    // 🔵 信頼性レベル: EDGE-005 / EDGE-106 + encodeURIComponent 仕様に基づく（推測なし）

    // 【テストデータ準備】: スペース + & を同時に含む最も危険な境界入力
    // 【初期条件設定】: 無効判定は DB (useJoinGroup) に委譲、page は code 妥当性を意識しない
    const path = '/join/a b&c'

    // 【実際の処理実行】: buildLoginRedirect を呼ぶ（副作用なし）
    // 【処理内容】: encodeURIComponent でパス全体をエンコードし /login?redirect= に連結する
    const result = buildLoginRedirect(path)

    // 【結果検証】: & が %26、スペースが %20 にエンコードされ単一クエリ値になる
    // 【期待値確認】: クエリインジェクション・値破損が起きないことを確認
    expect(result).toBe('/login?redirect=%2Fjoin%2Fa%20b%26c') // 【確認内容】: 特殊文字が URL 安全にエンコードされ redirect 値が単一値として閉じること 🔵
  })
})
