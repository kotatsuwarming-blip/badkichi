# TASK-0001 テストケース定義書: playerNameSchema 境界値

**機能名**: player-types-schema（選手ドメイン型 + 選手名バリデーション）
**タスクID**: TASK-0001
**要件名**: player-management
**作成日**: 2026-06-02
**出力ファイル**: `docs/implements/player-management/TASK-0001/player-types-schema-testcases.md`

> **テスト方針（厳守）**: 最小境界値 + 分岐網羅のみ。冗長ケース禁止（Memory `feedback_test_coverage`）。
> 型（`Handedness` / `Player` / `CreatePlayerInput` / `UpdatePlayerInput`）はコンパイル時（`pnpm typecheck`）で静的保証されるため、ランタイムテスト対象外。
> ランタイムテスト対象は `playerNameSchema` の境界値のみ。TASK-0001.md §単体テスト要件に既定の 4 件（TC1〜TC4）に限定する。

---

## 1. 開発言語・フレームワーク

- **プログラミング言語**: TypeScript（strict mode）
  - **言語選択の理由**: プロジェクト全体が Nuxt 4 (Vue 3) + TypeScript 構成であり、Zod スキーマの `z.infer` による型推論と相性が良い。`CLAUDE.md` の Coding Conventions に準拠。
  - **テストに適した機能**: 静的型チェック（`pnpm typecheck`）と Zod `safeParse` の判別共用体（`{ success: true, data } | { success: false, error }`）が型レベルで安全に分岐検証できる。
- **テストフレームワーク**: Vitest
  - **フレームワーク選択の理由**: 既存の単体テスト（`tests/unit/schemas/group-name.test.ts`、`tests/unit/composables/*.test.ts`）がすべて Vitest であり、`vitest.config.ts` で `tests/unit/**/*.test.ts` を対象に設定済み。
  - **テスト実行環境**: `pnpm` 経由の Vitest（unit レイヤー）。`.integration.test.ts` は除外され、本タスクのスキーマテストは純粋関数のため mock / DB / Nuxt context 不要。
- 🔵 信頼性レベル: 青信号（`note.md` §5 テスト関連情報 / `vitest.config.ts` / 既存 `group-name.test.ts` に基づく）

**テストファイル**: `tests/unit/schemas/player-name.test.ts`（`tests/unit/schemas/` ディレクトリは既存。`group-name.test.ts` と同居）

---

## 2. 正常系テストケース（基本的な動作）

### TC1: trim 後 1 字は成功（下限境界）

- **テスト名**: trim 後 1 字は成功する（EDGE-001 下限）
  - **何をテストするか**: `playerNameSchema` が trim 後 1 字の入力を受理し、`data` として trim 後の文字列を返すこと。
  - **期待される動作**: `safeParse` が `success === true` を返し、`data === 'a'`。
- **入力値**: `'a'`（前後空白なしの 1 字）
  - **入力データの意味**: DB `players_name_length_check`（trim 後 1〜50 字）の下限ちょうど。`min(1)` を満たす最小の有効値を代表する。
- **期待される結果**: `result.success === true` かつ `result.data === 'a'`
  - **期待結果の理由**: trim 後 1 字は `min(1)` を満たすため受理される。`data` は trim 適用後の文字列であり、入力と同一の `'a'`。
- **テストの目的**: 下限境界が受理されることを確認する。
  - **確認ポイント**: `min(1)` の境界が「1 字を含む（>=1）」であること、および `.trim()` が `.min()` より前に適用され `data` が trim 後値であること。
- 🔵 信頼性レベル: 青信号（TASK-0001.md §単体テスト TC1 / requirements.md §4-2 / EDGE-001 と 1:1）

### TC3: trim 後ちょうど 50 字は成功（上限境界）

- **テスト名**: trim 後ちょうど 50 字は成功する（EDGE-002 上限）
  - **何をテストするか**: `playerNameSchema` が trim 後ちょうど 50 字の入力を受理すること。
  - **期待される動作**: `safeParse` が `success === true` を返す。
- **入力値**: `'a'.repeat(50)`（50 字）
  - **入力データの意味**: DB `players_name_length_check` の上限ちょうど。`max(50)` を満たす最大の有効値を代表する。
- **期待される結果**: `result.success === true`
  - **期待結果の理由**: trim 後 50 字は `max(50)`（<=50）を満たすため受理される。境界の内側（50 字）が許可されることを保証する。
- **テストの目的**: 上限境界が受理されることを確認する。
  - **確認ポイント**: `max(50)` の境界が「50 字を含む（<=50）」であり、off-by-one で 50 字を弾かないこと。
- 🔵 信頼性レベル: 青信号（TASK-0001.md §単体テスト TC3 / requirements.md §4-2 / EDGE-002 と 1:1）

---

## 3. 異常系テストケース（エラーハンドリング）

### TC2: 空白のみ（trim 後 0 字）は拒否

- **テスト名**: 空白のみは trim 後 0 字で拒否される（EDGE-001）
  - **エラーケースの概要**: 前後空白のみの入力が trim 後 0 字となり、`min(1)` で検証エラーになる。
  - **エラー処理の重要性**: 空白のみの選手名は実質「名前なし」であり、DB CHECK をすり抜けさせないクライアント側第一次防衛として必須。`.trim()` を `.min()` の前に置く実装の正しさを保証する。
- **入力値**: `'   '`（半角空白 3 個）
  - **不正な理由**: trim 後 0 字となり、選手名として無意味。`min(1)` の下限（1 字）を下回る。
  - **実際の発生シナリオ**: ユーザがフォームに空白だけ入力して送信した場合（Phase 2 のフォーム / Write composable 経由）。
- **期待される結果**: `result.success === false` かつ `result.error.issues[0]?.message === 'invalid_player_name'`
  - **エラーメッセージの内容**: `message` は文言そのものではなく locale キー `invalid_player_name`。表示は呼び出し側で `t()` する。
  - **システムの安全性**: 無効入力をスキーマ段で確実に弾き、DB へ到達させない。
- **テストの目的**: 下限割れ（trim 後 0 字）のエラーハンドリングと、エラーメッセージキーの整合を確認する。
  - **品質保証の観点**: `.trim()` の適用順（`.min()` より前）が正しくないと空白のみが通過してしまうため、この分岐が trim 順の回帰検出を兼ねる。
- 🔵 信頼性レベル: 青信号（TASK-0001.md §単体テスト TC2 / requirements.md §4-3 / EDGE-001 と 1:1）

### TC4: trim 後 51 字は拒否（上限超過）

- **テスト名**: trim 後 51 字は拒否される（EDGE-002）
  - **エラーケースの概要**: trim 後 51 字の入力が `max(50)` を超過し、検証エラーになる。
  - **エラー処理の重要性**: 上限超過の選手名を弾くことで、DB `players_name_length_check`（trim 後 1〜50 字）と 1:1 の検証を保証する。
- **入力値**: `'a'.repeat(51)`（51 字）
  - **不正な理由**: trim 後 51 字は `max(50)`（<=50）を 1 字超過する、境界のすぐ外側。
  - **実際の発生シナリオ**: ユーザが上限を超える長い名前を入力した場合（Phase 2 のフォーム / Write composable 経由）。
- **期待される結果**: `result.success === false` かつ `result.error.issues[0]?.message === 'invalid_player_name'`
  - **エラーメッセージの内容**: locale キー `invalid_player_name`（TC2 と同一キー。`max` 側も同キーを返す）。
  - **システムの安全性**: 上限超過入力をスキーマ段で弾き、DB CHECK 違反による不明瞭なエラーを未然に防ぐ。
- **テストの目的**: 上限超過（51 字）のエラーハンドリングと、エラーメッセージキーの整合を確認する。
  - **品質保証の観点**: `max(50)` の境界が off-by-one で 51 字を許可しないこと、および `max` 側メッセージキーが `invalid_player_name` であることを保証する。
- 🔵 信頼性レベル: 青信号（TASK-0001.md §単体テスト TC4 / requirements.md §4-2 / EDGE-002 と 1:1）

---

## 4. 境界値テストケースの整理

> 4 件すべてが境界値テストを兼ねる（下限・上限のちょうど境界と、その 1 つ外側）。境界の内側 2 件（TC1/TC3）は正常系、外側 2 件（TC2/TC4）は異常系として上記に記載済み。冗長な中間値（2 字 / 49 字など）は方針により置かない。

| TC | 入力 | trim 後文字数 | 境界の位置 | 期待結果 | 出典 |
|----|------|--------------|-----------|----------|------|
| TC1 | `'a'` | 1 | 下限ちょうど（>=1） | `success === true` / `data === 'a'` | 🔵 EDGE-001 / `min(1)` 下限 |
| TC2 | `'   '` | 0 | 下限の 1 つ外側 | `success === false` / `message === 'invalid_player_name'` | 🔵 EDGE-001 / `min(1)` |
| TC3 | `'a'.repeat(50)` | 50 | 上限ちょうど（<=50） | `success === true` | 🔵 EDGE-002 / `max(50)` 上限 |
| TC4 | `'a'.repeat(51)` | 51 | 上限の 1 つ外側 | `success === false` / `message === 'invalid_player_name'` | 🔵 EDGE-002 / `max(50)` |

- **境界の正確性**: `min(1)` は 1 を含み 0 を除外、`max(50)` は 50 を含み 51 を除外。off-by-one を 4 点で網羅。
- **一貫した動作**: 境界の内側（TC1/TC3）と外側（TC2/TC4）で `success` が反転し、外側は同一の locale キー `invalid_player_name` を返す。
- **堅牢性の確認**: `.trim()` が `.min()/.max()` の前に適用されることを、TC1（trim 後値の `data` 検証）と TC2（空白のみの拒否）で二重に保証する。
- 🔵 信頼性レベル: 青信号（requirements.md §4-2 境界値表 / TASK-0001.md §単体テスト要件）

---

## 5. テストケース実装時の日本語コメント指針

実装時（tdd-red フェーズ）には、各テストケースに以下の構造でコメントを付与する。`group-name.test.ts` のスタイル（簡潔な 1 行 it 名 + 要件 ID）を踏襲しつつ、境界の意図がわかるコメントを添える。

```typescript
import { describe, expect, it } from 'vitest'
import { playerNameSchema } from '~/schemas/player-name'

// 【テストスイート目的】: playerNameSchema の境界値 + 分岐網羅 (trim 後 1〜50 字)。
// 境界値 + 分岐のみ (feedback_test_coverage)。冗長ケース (2文字/49文字等) は置かない。
// 型は pnpm typecheck で静的保証されるためランタイムテスト対象外。
describe('playerNameSchema', () => {
  // 【テスト目的】: 下限境界 (trim 後 1 字) が受理され、data が trim 後値であること。
  // 【期待される動作】: success === true / data === 'a'。
  // 🔵 TASK-0001 TC1 / EDGE-001 下限
  it('TC1: trim 後 1 字は成功する (EDGE-001 下限)', () => {
    // 【テストデータ準備】: min(1) を満たす最小の有効値。
    const result = playerNameSchema.safeParse('a')
    // 【結果検証】: 受理かつ data が trim 後の 'a'。
    expect(result.success).toBe(true) // 【検証項目】: 下限境界が受理される 🔵
    if (result.success) {
      expect(result.data).toBe('a') // 【検証項目】: trim 適用後の値が data になる 🔵
    }
  })

  // 【テスト目的】: 下限割れ (trim 後 0 字) が拒否され、message が locale キーであること。
  // 【期待される動作】: success === false / issues[0].message === 'invalid_player_name'。
  // 🔵 TASK-0001 TC2 / EDGE-001 / min(1)
  it('TC2: 空白のみは trim 後 0 字で拒否される (EDGE-001)', () => {
    // 【テストデータ準備】: trim 後 0 字となる空白のみ。trim 適用順の回帰も兼ねる。
    const result = playerNameSchema.safeParse('   ')
    // 【結果検証】: 拒否かつ message が invalid_player_name。
    expect(result.success).toBe(false) // 【検証項目】: 空白のみが弾かれる 🔵
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('invalid_player_name') // 【検証項目】: min 側メッセージキー 🔵
    }
  })

  // 【テスト目的】: 上限境界 (trim 後 50 字) が受理されること。
  // 【期待される動作】: success === true。
  // 🔵 TASK-0001 TC3 / EDGE-002 上限
  it('TC3: trim 後ちょうど 50 字は成功する (EDGE-002 上限)', () => {
    // 【テストデータ準備】: max(50) を満たす最大の有効値。
    const result = playerNameSchema.safeParse('a'.repeat(50))
    // 【結果検証】: 上限ちょうどが受理される。
    expect(result.success).toBe(true) // 【検証項目】: 上限境界が受理される (off-by-one なし) 🔵
  })

  // 【テスト目的】: 上限超過 (trim 後 51 字) が拒否され、message が locale キーであること。
  // 【期待される動作】: success === false / issues[0].message === 'invalid_player_name'。
  // 🔵 TASK-0001 TC4 / EDGE-002 / max(50)
  it('TC4: trim 後 51 字は拒否される (EDGE-002)', () => {
    // 【テストデータ準備】: 上限を 1 字超過する境界のすぐ外側。
    const result = playerNameSchema.safeParse('a'.repeat(51))
    // 【結果検証】: 拒否かつ message が invalid_player_name。
    expect(result.success).toBe(false) // 【検証項目】: 上限超過が弾かれる 🔵
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('invalid_player_name') // 【検証項目】: max 側メッセージキー 🔵
    }
  })
})
```

- **セットアップ・クリーンアップ**: 本スキーマは純粋関数（副作用・共有状態なし）のため `beforeEach` / `afterEach` は不要。mock / Nuxt context / DB も不要。
- 🔵 信頼性レベル: 青信号（`group-name.test.ts` のスタイル + TASK-0001.md のコード例に基づく）

---

## 6. 要件定義との対応関係

- **参照した機能概要**: requirements.md §1（型契約 + 選手名バリデーションの基盤）/ §2-2（`playerNameSchema` 入出力仕様）
- **参照した入力・出力仕様**: requirements.md §2-2（`safeParse` の成功 `{ success:true, data }` / 失敗 `{ success:false, error }`、`issues[0].message === 'invalid_player_name'`）
- **参照した制約条件**: requirements.md §3（DB `players_name_length_check` trim 後 1〜50 字と 1:1、`.trim()` を `.min()/.max()` の前に置く、`message` は locale キー、`group-name.ts` と完全同型）
- **参照した使用例**: requirements.md §4-2 境界値表（TC1〜TC4）/ §4-3 EDGE-001・EDGE-002、TASK-0001.md §単体テスト要件
- **参照した EARS 要件**: REQ-101（name 空 / trim 後 50 字超は拒否）/ EDGE-001（空白のみ拒否）/ EDGE-002（50 字 OK・51 字 NG 境界）/ REQ-404（文言 i18n → message は locale キー）

---

## 7. 品質判定

```
✅ 高品質:
- テストケース分類: 正常系 (TC1/TC3) + 異常系 (TC2/TC4) + 境界値 (4 件すべてが境界) を網羅
- 期待値定義: 各ケースの success / data / message を具体値で明記
- 技術選択: TypeScript + Vitest で確定 (既存 group-name.test.ts と同基盤)
- 実装可能性: 純粋関数スキーマのため mock 不要、確実に実装可能
- 信頼性レベル: 🔵 青信号 100% (TASK-0001.md / requirements.md / EDGE-001/002 と 1:1)
```

### 信頼性サマリー

| カテゴリ | 🔵 青 | 🟡 黄 | 🔴 赤 | 合計 |
|---------|-------|-------|-------|------|
| 正常系（TC1/TC3） | 2 | 0 | 0 | 2 |
| 異常系（TC2/TC4） | 2 | 0 | 0 | 2 |
| 言語・FW 選択 | 1 | 0 | 0 | 1 |
| **合計** | **5** | **0** | **0** | **5** |

**総合**: 🔵 100% — 高品質。型はコンパイル時保証のためランタイム対象外とし、`playerNameSchema` 境界 4 件に限定（冗長ケースなし）。

---

## 次のステップ

次のお勧めステップ: `/tsumiki:tdd-red player-management TASK-0001` で Red フェーズ（失敗テスト作成）を開始します。
