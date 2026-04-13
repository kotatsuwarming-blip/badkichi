# rule-engine アーキテクチャ設計

**作成日**: 2026-04-10
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

**信頼性**: 🔵 *ADR-002「純TypeScriptロジック」+ ユーザヒアリング 2026-04-10*

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
- **計算単位はセット**: 各関数は1セット分のデータを受け取る。複数セットをまたぐ計算は呼び出し側が行う
- 試合勝者判定のみ、セット結果の配列を受け取る

## コンポーネント構成 🔵

**信頼性**: 🔵 *要件定義書 REQ-001〜REQ-009 + ユーザヒアリング*

### rule-engine の公開関数

| 関数名 | 責務 | 入力 | 出力 | 関連要件 |
|--------|------|------|------|---------|
| `computeRallyStates` | セット内の全ラリーの状態を計算 | SetConfig, SetPlayerPosition[], Rally[], PositionOverride[] | RallyState[] | REQ-001〜006, REQ-104/105 |
| `computeNextServer` | 次のラリーのサーバー情報を返す | SetConfig, SetPlayerPosition[], Rally[], PositionOverride[] | NextServerInfo | REQ-001〜003 |
| `computeScore` | 現在のスコアを計算 | Rally[] | Score | REQ-005, REQ-006 |
| `determineSetWinner` | セットの勝者を判定 | Score, SetConfig | Team \| null | REQ-007, REQ-101〜103 |
| `determineMatchWinner` | 試合の勝者を判定 | SetResult[] | Team \| null | REQ-008 |
| `isSetComplete` | セットが終了しているか判定 | Score, SetConfig | boolean | REQ-007 |

### 関数の依存関係

```
computeRallyStates (メイン関数)
├── computeScore          (スコア計算)
├── resolveServingTeam    (サーブ権の決定) ← 内部関数
├── resolveServerPosition (サーバーの左右) ← 内部関数
└── applyOverrides        (PositionOverride 適用) ← 内部関数

computeNextServer
├── computeScore
├── resolveServingTeam
├── resolveServerPosition
└── applyOverrides

determineSetWinner
└── (スコアとルール設定のみで計算)

determineMatchWinner
└── (セット結果の配列のみで計算)
```

## ディレクトリ構造 🔵

**信頼性**: 🔵 *CLAUDE.md プロジェクト構造 + ユーザヒアリング 2026-04-10*

```
app/
  utils/
    rule-engine/
      index.ts              # 公開 API（re-export）
      types.ts              # 型定義
      compute-rally-states.ts  # メイン計算関数
      compute-next-server.ts   # 次のサーバー計算
      compute-score.ts         # スコア計算
      determine-set-winner.ts  # セット勝者判定
      determine-match-winner.ts # 試合勝者判定
      internal/
        resolve-serving-team.ts    # サーブ権の決定（内部）
        resolve-server-position.ts # サーバーの左右（内部）
        apply-overrides.ts         # PositionOverride 適用（内部）
```

**命名規則**:
- ファイル名: ケバブケース（kebab-case）
- 関数名: キャメルケース（camelCase）
- 型名: パスカルケース（PascalCase）

## 呼び出し側との連携 🔵

**信頼性**: 🔵 *ユーザヒアリング 2026-04-10 composable 説明*

### 録画画面からの呼び出しイメージ

```typescript
// app/composables/useMatchRecording.ts（将来 match-recording で実装）

export function useMatchRecording(matchId: string) {
  const rallies = ref<Rally[]>([])
  const positions = ref<SetPlayerPosition[]>([])
  const overrides = ref<PositionOverride[]>([])
  const setConfig = ref<SetConfig>({ targetPoints: 21, enableDeuce: true, deucePointCap: 30 })

  // rule-engine を呼ぶ（純関数なので computed で自動再計算）
  const rallyStates = computed(() =>
    computeRallyStates(setConfig.value, positions.value, rallies.value, overrides.value)
  )

  const nextServer = computed(() =>
    computeNextServer(setConfig.value, positions.value, rallies.value, overrides.value)
  )

  const score = computed(() => computeScore(rallies.value))

  const setWinner = computed(() =>
    determineSetWinner(score.value, setConfig.value)
  )
}
```

**ポイント**: Vue の `computed` は依存するデータが変わると自動で再計算される。ラリーが追加されるたびに rule-engine の関数が自動で呼ばれ、結果が即座に画面に反映される。

## 非機能要件の実現方法

### パフォーマンス 🔵

**信頼性**: 🔵 *NFR-001 + 純関数の性質*

- **目標**: 1セット分（最大60ラリー）の計算が 10ms 以内
- **実現方法**: 純粋な配列操作のみ。DOM操作、DB通信、非同期処理なし
- **Vue computed の特性**: 依存データが変わらなければキャッシュされる（同じ入力で2回計算しない）

### テスト容易性 🔵

**信頼性**: 🔵 *NFR-101 + REQ-401*

- **テストフレームワーク**: Vitest
- **テスト方法**: 関数を直接 import して呼ぶだけ。モック不要
- **テストファイル配置**: `app/utils/rule-engine/__tests__/` に配置

```typescript
// テストの例
import { computeScore } from '../compute-score'

test('レットはスコアに加算されない', () => {
  const rallies = [
    { rally_number: 1, point_winner: 'A', is_let: false },
    { rally_number: 2, point_winner: null, is_let: true },  // レット
    { rally_number: 3, point_winner: 'B', is_let: false },
  ]
  expect(computeScore(rallies)).toEqual({ teamA: 1, teamB: 1 })
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
- rule-engine に渡される全ラリーは得点者 or レットが確定済み

## 関連文書

- **データフロー**: [dataflow.md](dataflow.md)
- **型定義**: [interfaces.ts](interfaces.ts)
- **要件定義**: [requirements.md](../../spec/rule-engine/requirements.md)
- **ADR-002**: [002-requirements-splitting.md](../../decisions/002-requirements-splitting.md)

## 信頼性レベルサマリー

- 🔵 青信号: 11 件 (92%)
- 🟡 黄信号: 1 件 (8%)
- 🔴 赤信号: 0 件 (0%)

**品質評価**: 高品質
