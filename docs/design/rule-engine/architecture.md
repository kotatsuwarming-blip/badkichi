# rule-engine アーキテクチャ設計

**作成日**: 2026-04-10
**更新日**: 2026-04-13（増分計算アーキテクチャに変更）
**関連要件定義**: [requirements.md](../../spec/rule-engine/requirements.md)
**ヒアリング記録**: [design-interview.md](design-interview.md)

**【信頼性レベル凡例】**:
- 🔵 **青信号**: 要件定義書・設計文書・ユーザヒアリングを参考にした確実な設計
- 🟡 **黄信号**: 要件定義書・設計文書・ユーザヒアリングから妥当な推測による設計
- 🔴 **赤信号**: 要件定義書・設計文書・ユーザヒアリングにない推測による設計

---

## システム概要 🔵

**信頼性**: 🔵 *要件定義書・ADR-002 より*

rule-engine は、バドミントンのダブルスルールに基づく純 TypeScript ロジックモジュールである。アプリケーション全体のレイヤードアーキテクチャにおける **Domain Layer（最内層）** に位置し、外部依存（DB、フレームワーク、ネットワーク）を一切持たない。

## アーキテクチャパターン 🔵

**信頼性**: 🔵 *ADR-002「純TypeScriptロジック」+ ユーザヒアリング 2026-04-10, 2026-04-13*

### 計算方式: 増分計算（状態遷移）

rule-engine は **増分計算** を採用する。現在の状態（GameState）に対してラリー結果を適用し、次の状態を返す。ラリー全件を渡して最初から再計算する方式ではない。

**選択理由**:
- UI に現在の状態が常に表示されているため、その情報を使って次の状態を計算するのが自然
- コードがシンプル（「現在の状態 + 入力 → 次の状態」の1パターン）
- ラリー記録と計算結果は DB に保存されるため、全件再計算は不要

### badkichi 全体のレイヤー構造

```
┌─────────────────────────────────────────────────┐
│  Presentation Layer                              │
│  pages/, components/                             │
│  画面表示・ユーザー操作の受け付け                   │
├─────────────────────────────────────────────────┤
│  Use Case Layer                                  │
│  composables/                                    │
│  ユースケースの組み立て（DB読み書き + 計算呼び出し） │
│  ・applyRally の前後で状態を DB に保存              │
│  ・Override 記録を DB に保存                       │
├─────────────────────────────────────────────────┤
│  Domain Layer ★ rule-engine はここ                │
│  app/utils/rule-engine/                          │
│  ビジネスルール（純関数、外部依存ゼロ）              │
├─────────────────────────────────────────────────┤
│  Infrastructure Layer                            │
│  Supabase Client SDK                             │
│  データの永続化・認証・RLS                         │
└─────────────────────────────────────────────────┘
```

### rule-engine 内部の設計方針

- **純関数の集合**（クラスベースではない）
- 入力 → 出力が決定的。副作用なし
- **状態遷移モデル**: GameState を受け取り、新しい GameState を返す
- 試合勝者判定のみ、セット結果の配列を受け取る

## コンポーネント構成 🔵

**信頼性**: 🔵 *要件定義書 REQ-001〜REQ-011 + ユーザヒアリング 2026-04-13*

### rule-engine の公開関数

| 関数名 | 責務 | 入力 | 出力 | 関連要件 |
|--------|------|------|------|---------|
| `createInitialState` | セットの初期状態を生成 | SetConfig, SetPlayerPosition[] | GameState | REQ-001 |
| `applyRally` | ラリー結果を適用して次の状態を返す | GameState, RallyResult | GameState | REQ-001〜006, REQ-010, REQ-011 |
| `applyOverride` | PositionOverride を適用して位置を反転 | GameState, Team | GameState | REQ-104, REQ-105 |
| `determineSetWinner` | セットの勝者を判定 | Score, SetConfig | Team \| null | REQ-007, REQ-101〜103 |
| `determineMatchWinner` | 試合の勝者を判定 | SetResult[] | Team \| null | REQ-008 |

### 関数の関係

```
createInitialState(config, positions) → 初期 GameState
        │
        ▼
   ┌─────────────────────────────────────┐
   │  ラリーごとのループ（composable 側）    │
   │                                      │
   │  state = applyRally(state, rally)    │
   │       or                             │
   │  state = applyOverride(state, team)  │
   │                                      │
   │  winner = determineSetWinner(        │
   │             state.score, config)     │
   └─────────────────────────────────────┘
        │
        ▼ セット終了後
   determineMatchWinner(setResults) → 試合の勝者
```

## ディレクトリ構造 🔵

**信頼性**: 🔵 *CLAUDE.md プロジェクト構造 + ユーザヒアリング 2026-04-10*

```
app/
  utils/
    rule-engine/
      index.ts                 # 公開 API（re-export）
      types.ts                 # 型定義
      create-initial-state.ts  # 初期状態生成
      apply-rally.ts           # ラリー結果の適用（状態遷移）
      apply-override.ts        # PositionOverride の適用
      determine-set-winner.ts  # セット勝者判定
      determine-match-winner.ts # 試合勝者判定
      __tests__/               # テストファイル
```

**命名規則**:
- ファイル名: ケバブケース（kebab-case）
- 関数名: キャメルケース（camelCase）
- 型名: パスカルケース（PascalCase）

## 呼び出し側との連携 🔵

**信頼性**: 🔵 *ユーザヒアリング 2026-04-10, 2026-04-13 composable 説明*

### 録画画面からの呼び出しイメージ

```typescript
// app/composables/useMatchRecording.ts（将来 match-recording で実装）

export function useMatchRecording(matchId: string) {
  const config = ref<SetConfig>({
    targetPoints: 21,
    enableDeuce: true,
    deucePointCap: 30,
    firstServingTeam: 'A'
  })
  const state = ref<GameState | null>(null)

  // セット開始
  function startSet(positions: SetPlayerPosition[]) {
    state.value = createInitialState(config.value, positions)
  }

  // 得点入力
  function recordPoint(team: Team) {
    const before = state.value!
    state.value = applyRally(before, { pointWinner: team, isLet: false })
    saveRallyToDb(before, team)  // composable が DB に保存

    // セット終了チェック
    const winner = determineSetWinner(state.value.score, config.value)
    if (winner) handleSetEnd(winner)
  }

  // レット入力
  function recordLet() {
    state.value = applyRally(state.value!, { pointWinner: null, isLet: true })
  }

  // 位置補正
  function overridePosition(team: Team) {
    state.value = applyOverride(state.value!, team)
    saveOverrideToDb(team)  // Override 記録を DB に保存
  }
}
```

**ポイント**:
- `state` は Vue の `ref` で保持。変更するとUIが自動更新される
- DB への保存は composable の責務。rule-engine は計算のみ
- Override 記録も DB に保存する（統計分析用）

## 非機能要件の実現方法

### パフォーマンス 🔵

**信頼性**: 🔵 *NFR-001 + 純関数の性質*

- **目標**: 各関数の呼び出しが 1ms 以内（増分計算のため、1ラリー分の計算のみ）
- **実現方法**: 純粋な比較・代入操作のみ。配列走査なし
- **Vue ref の特性**: 値が変わるとUIが自動で再描画される

### テスト容易性 🔵

**信頼性**: 🔵 *NFR-101 + REQ-401*

- **テストフレームワーク**: Vitest
- **テスト方法**: 関数を直接 import して呼ぶだけ。モック不要
- **テストファイル配置**: `app/utils/rule-engine/__tests__/` に配置

```typescript
// テストの例
import { applyRally, createInitialState } from '../index'

test('得点入力でスコアが更新される', () => {
  const state = createInitialState(config, positions)
  const next = applyRally(state, { pointWinner: 'A', isLet: false })
  expect(next.score).toEqual({ teamA: 1, teamB: 0 })
})
```

### 保守性・拡張性 🟡

**信頼性**: 🟡 *NFR-201 から推測*

- **シングルス/トリプルス対応**: チーム人数をハードコードしない。`SetPlayerPosition[]` の配列長で対応
- **サーバー移行**: rule-engine は純 TypeScript なので、Node.js サーバーでも同じコードが動く
- **課金/認証の変更**: rule-engine は影響を受けない（Domain Layer は外側の変更に無関係）

## 技術的制約 🔵

**信頼性**: 🔵 *REQ-401, REQ-402, REQ-403*

- rule-engine は DB、ネットワーク、ファイルシステムに一切アクセスしない
- rule-engine は Nuxt / Vue に依存しない（ただし `app/utils/` に配置して auto-import の恩恵は受ける）
- rule-engine に渡されるラリー結果は得点者 or レットが確定済み

## 関連文書

- **データフロー**: [dataflow.md](dataflow.md)
- **型定義**: [interfaces.ts](interfaces.ts)
- **要件定義**: [requirements.md](../../spec/rule-engine/requirements.md)
- **ADR-002**: [002-requirements-splitting.md](../../decisions/002-requirements-splitting.md)

## 信頼性レベルサマリー

- 🔵 青信号: 10 件 (91%)
- 🟡 黄信号: 1 件 (9%)
- 🔴 赤信号: 0 件 (0%)

**品質評価**: 高品質
