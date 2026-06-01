# TDDテストケース定義書: グループ設定画面 (`/groups/[id]/settings`)

- **機能名**: グループ設定画面 (group-settings-page)
- **タスクID**: TASK-0019
- **要件名**: auth-onboarding
- **出力ファイル**: `docs/implements/auth-onboarding/TASK-0019/group-settings-page-testcases.md`
- **作成日**: 2026-06-01

---

## 0. テスト方針の宣言 (最重要 / requirements.md §0・§6 を継承)

本タスクは **UI 結線 (page) タスク**であり、テスト方針は「最小の境界値 + 分岐網羅のみ」(`feedback_test_coverage.md`)、かつ **UI 見た目テストは書かない** (NFR-301)。vitest は **mock-unit 限定** (integration は本タスク対象外、`feedback_test_layer_separation.md`)。

### 本タスクで新規に書くテスト

| 対象 | 種別 | 書くか | 根拠 |
|---|---|---|---|
| **招待状態の派生算出 `deriveInvitationStatus(expiresAt, now)`** | 純関数 | **○ 最小 3 ケース** | page 固有・未検証ロジック。EDGE-107 境界含む。requirements.md §4 / §6 |

### 本タスクで書かないテスト (除外理由を明記)

| 対象 | 除外理由 |
|---|---|
| 招待一覧取得 (`useListInvitations`) | TASK-0012 のテストで検証済。page は結線のみ |
| 招待生成分岐 (成功 / `not_a_member` / `invitation_code_collision_after_retry`) + 内部 `refresh()` | TASK-0012 (`useGenerateInvitation.test.ts`) で検証済。page は結線のみ |
| メンバー一覧 SELECT / RLS | composable 側 + data-foundation integration test (ADR-012) で済。page 見た目テスト書かない (NFR-301) |
| URL 組立 (`${useRequestURL().origin}/join/${code}`) | SSR/ブラウザ API 結線が支配的。純関数化の必然性が低く原則書かない (requirements.md §6 結論) |
| コピー toast / ローディング (Skeleton/disabled) / モバイル表示 / 空一覧 | 見た目・ブラウザ API 結線のため NFR-301 によりテストを書かない |

---

## deriveInvitationStatus テストの採否判定 (結論)

- **採否**: **採用** (書く)。
- **理由**: 「状態 (有効 / 期限切れ)」は `group_invitations` に status 列が無いため page 側が `expires_at < now()` で派生算出する **page 固有・未検証の純粋ロジック**。境界 `expires_at == now()` の挙動 (EDGE-107) を回帰から守る最小単位の単体テストが妥当 (requirements.md §6「唯一のテスト候補」)。
- **配置 (関数)**: `app/utils/invitation.ts` に純関数として切り出す。
  - 根拠: 同種の「page から切り出した純関数 + mock-unit テスト」の既存先例が `app/utils/redirect.ts` (`buildLoginRedirect`, TASK-0018) として存在する。同一規約に揃える。
- **配置 (テスト)**: `tests/unit/utils/invitation.test.ts`。
  - 根拠: 既存 unit テストは `tests/unit/**` 配下に種別ディレクトリで配置 (`tests/unit/composables/`, `tests/unit/middleware/`)。pure util は `tests/unit/utils/` に揃える。`*.test.ts` 命名で vitest mock-unit が自動検出 (note.md §5)。

### 関数シグネチャ (確定仕様)

```ts
// app/utils/invitation.ts
export type InvitationStatus = 'active' | 'expired'

/**
 * 招待リンクの状態を派生算出する純関数。
 * DB に status 列は無く、有効/期限切れは expires_at と現在時刻の比較で UI が算出する。
 * 規則: expires_at < now → 'expired'、それ以外 (>= now) → 'active'
 *       境界 expires_at == now は厳密未満 '<' のため 'active' (EDGE-107 確定仕様)
 */
export function deriveInvitationStatus(expiresAt: number, now: number): InvitationStatus
```

- **引数の単位**: ms (epoch milliseconds) で統一して比較する。`expires_at` は ISO 文字列 (`group_invitations.expires_at`) のため、呼び出し側が `Date.parse(expires_at)` 等で ms 化して渡す。**本純関数は数値比較のみを担当**し、パース責務は持たない (単一責任)。
  - 🟡 引数を ms 数値とする点は requirements.md が `deriveInvitationStatus(expiresAt, now)` のシグネチャのみ提示し型を明記していないため妥当な推測。`Date` 同士・ISO 文字列同士でも `<` 比較は成立するが、ms 数値が最も曖昧さがなく境界 `==` を厳密に表現できるため採用。

---

## 1. 正常系テストケース（基本的な動作）

### TC-01: 有効期限が未来 → 'active' を返す

- **テスト名**: 期限が現在より未来の招待リンクは「有効」と判定される
  - **何をテストするか**: `expires_at > now` のとき `deriveInvitationStatus` が `'active'` を返すこと
  - **期待される動作**: 厳密未満比較で `expires_at < now` が偽になり期限切れに該当しないため `'active'` を返す
- **入力値**: `deriveInvitationStatus(2000, 1000)` (`expiresAt=2000`, `now=1000`)
  - **入力データの意味**: 期限が現在より 1000ms 先 = 失効していない一般的な有効リンクの代表値
- **期待される結果**: `'active'`
  - **期待結果の理由**: requirements.md §2「`expires_at < now()` → 'expired'、それ以外 'active'」より、未失効は有効
- **テストの目的**: 有効リンクが正しく `'active'` 分類されること
  - **確認ポイント**: 戻り値が文字列 `'active'` であること
- 🔵 信頼性レベル: requirements.md §2 出力仕様 / §4 状態派生境界に基づく（推測なし）

### TC-02: 有効期限が過去 → 'expired' を返す

- **テスト名**: 期限が現在より過去の招待リンクは「期限切れ」と判定される
  - **何をテストするか**: `expires_at < now` のとき `deriveInvitationStatus` が `'expired'` を返すこと
  - **期待される動作**: 厳密未満比較 `expires_at < now` が真になり `'expired'` を返す
- **入力値**: `deriveInvitationStatus(1000, 2000)` (`expiresAt=1000`, `now=2000`)
  - **入力データの意味**: 期限が現在より 1000ms 過去 = 既に失効したリンクの代表値
- **期待される結果**: `'expired'`
  - **期待結果の理由**: requirements.md §2「`expires_at < now()` → 'expired'」より、失効は期限切れ
- **テストの目的**: 失効リンクが正しく `'expired'` 分類されること
  - **確認ポイント**: 戻り値が文字列 `'expired'` であること
- 🔵 信頼性レベル: requirements.md §2 出力仕様 / §4 状態派生境界に基づく（推測なし）

---

## 2. 異常系テストケース（エラーハンドリング）

本純関数は **数値 2 引数の比較のみ**を行い、副作用・I/O・外部依存を一切持たない。requirements.md は不正入力 (NaN / 非数値) に対する固有のエラーハンドリング要件を定義していない (入力の妥当性は呼び出し側のパース責務)。したがって **異常系テストケースは定義しない (該当なし)**。

- 🔵 信頼性レベル: requirements.md §0/§6 のテスト最小化方針 (`feedback_test_coverage.md` 冗長禁止) と純関数の責務範囲に基づく（推測なし）

---

## 3. 境界値テストケース（最小値、最大値、null等）

### TC-03: 有効期限が現在時刻と同値 (`expires_at == now`) → 'active' を返す (EDGE-107)

- **テスト名**: 期限が現在時刻ちょうどの招待リンクは「有効」と判定される (EDGE-107 境界)
  - **境界値の意味**: `<` (厳密未満) 比較における等値境界。`expired` 判定に入る最後の一歩手前で、有効/期限切れの分かれ目
  - **境界値での動作保証**: `==` を `'active'` 側に確定することで、境界の内側 (`>`) と一貫した有効判定になる
- **入力値**: `deriveInvitationStatus(1000, 1000)` (`expiresAt == now == 1000`)
  - **境界値選択の根拠**: requirements.md §2/§4「`expires_at == now` は `<` 比較なので `'active'`、`<` の厳密未満で期限切れ判定する確定仕様」(EDGE-107)。等値はこの仕様を固定する唯一の境界点
  - **実際の使用場面**: 有効期限固定 7 日 (REQ-405) で、ちょうど失効時刻に一覧を描画した瞬間の挙動。1ms の差で分類が変わる境界
- **期待される結果**: `'active'`
  - **境界での正確性**: `1000 < 1000` は偽 → 期限切れに該当せず `'active'`。`<=` ではなく `<` を使うことの回帰防止
  - **一貫した動作**: `expiresAt > now` (TC-01) と同じ `'active'`、`expiresAt < now` (TC-02) のみ `'expired'`、という三分の境界が `==` で破綻しないこと
- **テストの目的**: EDGE-107 の境界仕様 (`==` は `'active'`) を固定し、`<` と `<=` の取り違え回帰を防ぐ
  - **堅牢性の確認**: 等値という極端条件下でも仕様どおり安定分類されること
- 🔵 信頼性レベル: requirements.md §2/§4 (EDGE-107 `<` 厳密未満で `==` は 'active' を確定) に基づく（推測なし）

---

## 4. 開発言語・フレームワーク

- **プログラミング言語**: TypeScript (strict mode)
  - **言語選択の理由**: プロジェクト全体が Nuxt 4 + TypeScript strict (CLAUDE.md / note.md §1)。純関数も型安全に記述する
  - **テストに適した機能**: `InvitationStatus` ユニオン型 (`'active' | 'expired'`) で戻り値を静的に制約でき、テストの期待値も型レベルで保証される
- **テストフレームワーク**: Vitest 4.1 (+ @nuxt/test-utils, mock-unit 構成)
  - **フレームワーク選択の理由**: 既存 unit テストが全て Vitest (`tests/unit/**/*.test.ts`)。本純関数は Nuxt auto-import に依存しない素の関数のため、mock 不要で `describe/it/expect` のみで完結する
  - **テスト実行環境**: `pnpm test` (vitest mock-unit, pre-commit + CI 自動実行)。`vitest.config.ts` の include フィルタで `tests/unit/utils/invitation.test.ts` が自動検出される
- 🔵 信頼性レベル: note.md §5 (テストフレームワーク・命名規則・ディレクトリ構成) / CLAUDE.md に基づく（推測なし）

---

## 5. テストケース実装時の日本語コメント指針

```ts
import { describe, it, expect } from 'vitest'
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
```

- セットアップ・クリーンアップ (`beforeEach` / `afterEach`) は不要。純関数で共有状態・副作用が無いため。

---

## 6. 要件定義との対応関係

- **参照した機能概要**: requirements.md §1 (招待リンク一覧の状態表示) / §4 状態派生境界 (EDGE-107)
- **参照した入力・出力仕様**: requirements.md §2「招待状態 (派生出力): `'active' | 'expired'`、`expires_at < now()` → 'expired'、境界 `==` は 'active'」
- **参照した制約条件**: requirements.md §3「DB 制約: status 列なし → 状態は派生算出必須」/ §0 テスト最小化 (NFR-301, mock-unit 限定)
- **参照した使用例**: requirements.md §4 エッジ/エラーケース「状態派生境界 (EDGE-107) `deriveInvitationStatus(expiresAt, now)` の 3 分岐 (有効/期限切れ/境界 ==)」
- **参照した先例実装**: `app/utils/redirect.ts` (`buildLoginRedirect`, TASK-0018) — page 切り出し純関数 + mock-unit テストの規約

---

## 7. テストケース数と内訳

| 分類 | 件数 | テストID |
|---|---|---|
| 正常系 | 2 | TC-01 (active/未来), TC-02 (expired/過去) |
| 異常系 | 0 | 該当なし (純関数・I/O なし・不正入力要件なし) |
| 境界値 | 1 | TC-03 (EDGE-107: `expires_at == now` → 'active') |
| **合計** | **3** | |

- **対象関数**: `deriveInvitationStatus(expiresAt: number, now: number): 'active' | 'expired'`
- **関数配置**: `app/utils/invitation.ts`
- **テスト配置**: `tests/unit/utils/invitation.test.ts`

---

## 品質判定

```
✅ 高品質:
- テストケース分類: 正常系 2 + 境界値 1 で有効/期限切れ/境界の分岐を網羅。異常系は純関数の責務範囲外で「該当なし」を明示
- 期待値定義: 全ケースの入力 (ms 数値) と期待値 ('active'/'expired') が一意に確定
- 技術選択: TypeScript strict + Vitest mock-unit、配置パス (app/utils/, tests/unit/utils/) を先例に揃え確定
- 実装可能性: 純関数で外部依存なし、mock 不要、即実装可能
- 信頼性レベル: 🔵 約 95% (TC-01/02/03 + フレームワーク) / 🟡 約 5% (引数 ms 数値型の妥当な推測のみ) / 🔴 0%
```

- **判定**: 高品質
- **冗長排除の確認**: 最小 3 ケース。有効/期限切れの 2 方向 + 唯一の境界 (`==`) のみ。同方向の重複ケース・無意味な大小値バリエーションは追加しない (`feedback_test_coverage.md` 冗長禁止)
