# rule-engine データフロー図

**作成日**: 2026-04-10
**更新日**: 2026-04-13（増分計算アーキテクチャに変更）
**関連アーキテクチャ**: [architecture.md](architecture.md)
**関連要件定義**: [requirements.md](../../spec/rule-engine/requirements.md)

**【信頼性レベル凡例】**:
- 🔵 **青信号**: 要件定義書・設計文書・ユーザヒアリングを参考にした確実なフロー
- 🟡 **黄信号**: 要件定義書・設計文書・ユーザヒアリングから妥当な推測によるフロー
- 🔴 **赤信号**: 要件定義書・設計文書・ユーザヒアリングにない推測によるフロー

---

## rule-engine の状態遷移モデル 🔵

**信頼性**: 🔵 *要件定義書 REQ-001〜011 + ユーザヒアリング 2026-04-13*

```
セット開始
  createInitialState(config, positions) → GameState
        │
        ▼
  ┌──────────────────────────────────────────────┐
  │                                              │
  │  ┌─ applyRally(state, rally) → GameState     │
  │  │    得点: スコア更新 + サーブ権移動 + 位置更新 │
  │  │    レット: 状態そのまま                      │
  │  │                                           │
  │  ├─ applyOverride(state, team) → GameState   │
  │  │    該当チームの左右を反転                    │
  │  │                                           │
  │  └─ determineSetWinner(score, config)        │
  │       → Team | null                          │
  │                                              │
  │  ※ composable がループを制御、DB に保存        │
  └──────────────────────────────────────────────┘
```

## 主要フロー

### フロー1: 得点入力 🔵

**信頼性**: 🔵 *ユーザーストーリー 1.1・2.1 + ユーザヒアリング 2026-04-13*

**関連要件**: REQ-001, REQ-002, REQ-003, REQ-005, REQ-010, REQ-011

```
ユーザー操作         composable               rule-engine          画面表示
────────────      ──────────────           ──────────────      ──────────────
「チームA得点」   →  before = state          applyRally(
  ボタンを押す    →  DB に保存                 state,
                     (before の状態            { pointWinner: 'A',
                      + 得点チーム               isLet: false }
                      + タイムスタンプ)        )
                                             → 新しい state      →  スコア: 5-3
                                                                 →  次サーバー: 選手B
                 →  determineSetWinner(
                      state.score, config)
                    → null（続行）
```

**詳細ステップ**:
1. ユーザーが「チームA得点」ボタンを押す
2. composable が現在の state を保存用に取っておく（before）
3. rule-engine の applyRally を呼び、次の state を得る
4. 新しい state が画面に即座に反映される
5. composable が before の状態 + 得点情報を DB に保存
6. determineSetWinner でセット終了をチェック

### フロー2: レット入力 🔵

**信頼性**: 🔵 *ユーザーストーリー 2.2 + REQ-006*

**関連要件**: REQ-006

```
ユーザー操作         composable          rule-engine            画面表示
────────────      ──────────────      ──────────────        ──────────────
「レット」        →  applyRally(        → 状態は変わらない    →  スコア: 5-3（変わらず）
  ボタンを押す       state,                                   →  サーバー: 変わらず
                    { pointWinner: null,
                      isLet: true })
                 →  DB に保存
                     (レット記録)
```

### フロー3: PositionOverride 入力 🔵

**信頼性**: 🔵 *ユーザーストーリー 4.1 + REQ-104, REQ-105 + ユーザヒアリング 2026-04-13*

**関連要件**: REQ-104, REQ-105

```
ユーザー操作                 composable          rule-engine
──────────────────────     ──────────────      ──────────────
得点入力後、表示を確認
  ↓
表示と動画が不一致
（ラリー開始前に気づく）
  ↓
「チームA入れ替え」         →  applyOverride(     → チームAの左右を反転
  ボタンを押す                  state, 'A')        → 新しい state
                            →  DB に Override 記録を保存
  ↓
次のラリー開始
「チームA得点」             →  applyRally(state, ...) → 反転後の位置で計算
                            →  DB にラリー記録を保存
```

### フロー4: セット終了と次セット開始 🔵

**信頼性**: 🔵 *ユーザーストーリー 3.1, 5.1 + REQ-007, REQ-009*

**関連要件**: REQ-007, REQ-009, REQ-101, REQ-102

```
得点入力後の判定:

  state = applyRally(state, { pointWinner: 'A', isLet: false })
  → state.score = { teamA: 21, teamB: 18 }

  determineSetWinner(state.score, config) → 'A'  // チームA勝利

セット終了が確定:

  composable 側で新セットを開始
  ├ 新セットの初期立ち位置を入力（ユーザー手動）
  ├ 前セットの勝者（'A'）をサーブ権チームとして config に設定
  └ state = createInitialState(newConfig, newPositions)

  ※ 試合勝者判定は rule-engine の範囲外（composable 側で管理）
```

### フロー5: 得点者変更（直前のラリーの修正） 🔵

**信頼性**: 🔵 *ユーザヒアリング 2026-04-13「修正は直前の1ラリーのみ」*

```
ユーザー操作              composable             rule-engine
────────────────────    ──────────────         ──────────────
ラリー3 でチームA得点
を入力したが、ラリー4
のサーバーが映像と違う
  ↓
「直前のラリーを取消」   →  state を1つ前に戻す   （rule-engine は関与しない。
                           (DB から復元 or          composable が前の state を
                            前の state を保持)       保持しておく）
  ↓
正しい得点を再入力       →  applyRally(state, ...) → 正しい次の state
「チームB得点」          →  DB を更新
```

## applyRally 内部の計算フロー 🔵

**信頼性**: 🔵 *REQ-001〜006, REQ-010, REQ-011 を統合*

```
入力: GameState, RallyResult

  ├── 1. レット判定
  │     └── isLet が true なら state をそのまま返す（REQ-006）
  │
  ├── 2. スコア更新
  │     └── pointWinner のチームに +1
  │
  ├── 3. サーブ権の決定
  │     └── 得点したチームがサーブ権を持つ（REQ-002）
  │
  ├── 4. 位置の更新
  │     ├── サーブ側が得点した場合（REQ-010）:
  │     │     → サーブ側の2人が左右入れ替わり
  │     │     → レシーブ側はそのまま
  │     └── レシーブ側が得点した場合（REQ-011）:
  │           → どちらのチームも入れ替わらない
  │           → 新サーブチームのスコア偶奇で決まる位置の選手がサーバー
  │
  └── 5. サーバー / レシーバーの特定
        └── サーブチームのスコア: 偶数=右、奇数=左の選手がサーバー（REQ-003）

出力: 新しい GameState
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
