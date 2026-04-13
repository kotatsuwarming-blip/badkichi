# rule-engine データフロー図

**作成日**: 2026-04-10
**関連アーキテクチャ**: [architecture.md](architecture.md)
**関連要件定義**: [requirements.md](../../spec/rule-engine/requirements.md)

**【信頼性レベル凡例】**:
- 🔵 **青信号**: 要件定義書・設計文書・ユーザヒアリングを参考にした確実なフロー
- 🟡 **黄信号**: 要件定義書・設計文書・ユーザヒアリングから妥当な推測によるフロー
- 🔴 **赤信号**: 要件定義書・設計文書・ユーザヒアリングにない推測によるフロー

---

## rule-engine の入出力全体像 🔵

**信頼性**: 🔵 *要件定義書 REQ-001〜009 より*

```
入力                          rule-engine                    出力
─────────────────────────    ──────────────────            ──────────────────
SetConfig                 →                              → RallyState[]
  ├ targetPoints: 21         computeRallyStates()           ├ サーバー (player_id)
  ├ enableDeuce: true                                       
  └ deucePointCap: 30                                      ├ レシーバー (player_id)
                                                            ├ サーバー位置 (left/right)
SetPlayerPosition[]       →                              → ├ スコア (teamA, teamB)
  ├ player_id                                               └ チームポジション
  ├ team: 'A' | 'B'
  └ position: 'left' | 'right'                           → NextServerInfo
                                                            ├ servingTeam
Rally[]                   →  computeNextServer()           ├ server (player_id)
  ├ rally_number                                            ├ serverPosition
  ├ point_winner: 'A'|'B'                                  └ receiver (player_id)
  └ is_let: boolean
                                                          → Score
PositionOverride[]        →  computeScore()                ├ teamA: number
  ├ rally_number                                            └ teamB: number
  └ team: 'A' | 'B'
                             determineSetWinner()         → Team | null
                             determineMatchWinner()        → Team | null
                             isSetComplete()              → boolean
```

## 主要フロー

### フロー1: 録画中のラリー入力 🔵

**信頼性**: 🔵 *ユーザーストーリー 1.1・2.1 + ユーザヒアリング*

**関連要件**: REQ-001, REQ-002, REQ-003, REQ-005, REQ-006

```
ユーザー操作         composable          rule-engine            画面表示
────────────      ──────────────      ──────────────        ──────────────
「チームA得点」   →  rallies に追加   →  computeRallyStates()
  ボタンを押す       overrides 参照      computeNextServer()  →  次のサーバー: 選手B
                                        computeScore()       →  スコア: 5-3
                                        isSetComplete()      →  セット継続中
                  →  Supabase に保存
```

**詳細ステップ**:
1. ユーザーが「チームA得点」ボタンを押す
2. composable が `rallies` 配列に新しいラリーを追加
3. Vue の `computed` が自動で rule-engine の関数を再呼び出し
4. rule-engine が全ラリーを走査し、各ラリーの状態と次のサーバーを計算
5. 計算結果が画面に即座に反映される
6. composable が Supabase にラリーデータを保存（非同期、画面表示を待たない）

### フロー2: レット入力 🔵

**信頼性**: 🔵 *ユーザーストーリー 2.2 + REQ-006*

**関連要件**: REQ-006

```
ユーザー操作         composable          rule-engine            画面表示
────────────      ──────────────      ──────────────        ──────────────
「レット」        →  rallies に追加   →  computeScore()
  ボタンを押す       (is_let: true)      → スコア変化なし     →  スコア: 5-3（変わらず）
                                        computeNextServer()  →  サーバー: 変わらず
```

### フロー3: PositionOverride 入力 🔵

**信頼性**: 🔵 *ユーザーストーリー 4.1 + REQ-104, REQ-105*

**関連要件**: REQ-104, REQ-105

```
ユーザー操作                composable          rule-engine
──────────────────────    ──────────────      ──────────────
得点入力後、表示を確認
  ↓
表示と動画が不一致
  ↓
「チームA入れ替わり」     →  overrides に追加  →  computeRallyStates()
  ボタンを押す               (team: 'A')         → チームAの左右を反転
                                                  → 以降のラリーも反転状態で計算
                                               →  computeNextServer()
                                                  → 反転後の位置でサーバーを返す
```

### フロー4: セット終了と次セット開始 🔵

**信頼性**: 🔵 *ユーザーストーリー 3.1, 5.1 + REQ-007, REQ-009*

**関連要件**: REQ-007, REQ-009, REQ-101, REQ-102

```
得点入力後の判定:

  computeScore() → Score { teamA: 21, teamB: 18 }
  determineSetWinner(score, config) → 'A'  // チームA勝利
  isSetComplete(score, config) → true

セット終了が確定:

  composable 側で新セットを開始
  ├ 新セットの初期立ち位置を入力（ユーザー手動）
  ├ 前セットの勝者（'A'）をサーブ権チームとして設定
  └ computeNextServer() で最初のサーバーを表示

試合終了判定:

  determineMatchWinner([
    { winner: 'A' },  // セット1
    { winner: 'A' },  // セット2
  ]) → 'A'  // チームA が 2-0 で勝利
```

### フロー5: 得点者変更（誤入力修正） 🔵

**信頼性**: 🔵 *ユーザヒアリング 2026-04-10「得点者変更は必要」*

```
ユーザー操作              composable             rule-engine
────────────────────    ──────────────         ──────────────
ラリー #5 の得点者を
チームA → チームB に変更  →  rallies[4] を更新    →  computeRallyStates()
                            (point_winner: 'B')     → 全ラリーを再計算
                                                    → #5 以降のサーバーが変わる
                         →  Supabase を更新
```

**ポイント**: rule-engine は純関数なので「再計算」は特別な処理ではない。更新された `rallies` 配列を渡すだけで正しい結果が返る。

## computeRallyStates 内部の計算フロー 🔵

**信頼性**: 🔵 *REQ-001〜006, REQ-104/105 を統合*

```
入力: SetConfig, SetPlayerPosition[], Rally[], PositionOverride[]

for each rally in rallies:
  │
  ├── 1. スコアを累積計算
  │     └── is_let なら加算しない（REQ-006）
  │
  ├── 2. サーブ権を決定
  │     ├── 最初のラリー → 初期サーブ権チーム
  │     └── それ以降 → 前ラリーの得点チーム（REQ-002）
  │
  ├── 3. サーバーの左右を決定
  │     └── サービングチームの得点: 偶数=右、奇数=左（REQ-003）
  │
  ├── 4. PositionOverride を適用
  │     └── 該当ラリーにオーバーライドがあればトグル（REQ-104/105）
  │
  ├── 5. サーバー / レシーバーの player_id を特定
  │     └── 初期位置 + 得点偶奇 + override 状態から導出
  │
  └── 6. RallyState として出力

出力: RallyState[]（各ラリーのサーバー、レシーバー、スコア、位置情報）
```

## 関連文書

- **アーキテクチャ**: [architecture.md](architecture.md)
- **型定義**: [interfaces.ts](interfaces.ts)
- **要件定義**: [requirements.md](../../spec/rule-engine/requirements.md)

## 信頼性レベルサマリー

- 🔵 青信号: 7 件 (100%)
- 🟡 黄信号: 0 件 (0%)
- 🔴 赤信号: 0 件 (0%)

**品質評価**: 高品質
