# singles-support UI 設計

**作成日**: 2026-08-28
**関連**: [architecture.md](architecture.md) / [requirements.md](../../spec/singles-support/requirements.md)

**【信頼性レベル凡例】** 🔵 確実 / 🟡 妥当な推測

## 方針 🔵

- 新しい画面は作らない。既存画面に「形式による表示分岐」を足すだけ。
- シングルスでは**ダブルス専用の操作が一切見えない**こと（NFR-202）。
- 既定はダブルス（既存ユーザーの操作を変えない）。

## 1. 試合フォーム（MatchFormModal） 🔵

```
┌ 試合を追加 ───────────────────────────┐
│ 試合名        [                    ]  │
│ 試合日付      [2026-08-28]            │
│ 対戦形式      (●) ダブルス ( ) シングルス │  ← 追加 (URadioGroup 横並び、data-testid="match-type")
│ チーム A      [選手を選択 ▾]           │
│               [選手を選択 ▾]           │  ← シングルスでは消える (v-if)
│ チーム B      [選手を選択 ▾]           │
│               [選手を選択 ▾]           │  ← 同上
│ 動画ソース    (●) YouTube ( ) ローカル  │
│ ...                                   │
└───────────────────────────────────────┘
```

- シングルス時のラベルは「選手 A」「選手 B」（`matches.playerALabel` / `playerBLabel`）。
- 形式を切り替えても既に選んだ player1 は保持する。player2 の残存値は schema の transform で null 化（EDGE-001）。
- 編集モードは `match.matchType` と `teamA[1]?.id`（undefined 許容）でプリフィル。
- エラー表示: チーム A 欄 = `form`（相異）→ `teamAPlayer1Id` → `teamAPlayer2Id` の順、チーム B 欄 = `teamBPlayer1Id` → `teamBPlayer2Id`。
- スワップロジック（他枠の選手を選ぶと入れ替え）は 4 枠のまま維持。シングルスでは非表示の枠が関与しないので挙動に影響なし。

## 2. 試合一覧（matches/index.vue） 🔵

```
横浜大会                       [録画] [注釈] [統計] [編集] [削除]
2026-08-28  [シングルス] [完了（2-0）]
```

- 日付の右に形式バッジ（`UBadge` neutral/outline、`data-testid="match-type-{id}"`）。
- 対戦カード（試合名なし）は `teamA.map(name).join('・')` → シングルスは「山田 vs 鈴木」。
- 「試合を追加」は選手 **2 人以上**で活性。警告文言は「2 人以上（ダブルスは 4 人以上）」に更新。

## 3. セット設定（SetSetupForm） 🔵

- `isSingles = aPlayers.length === 1 && bPlayers.length === 1`
- シングルスでは「初期立ち位置の入力」見出し・ヒント・ファースト選択 2 欄を `<template v-if="!isSingles">` で丸ごと非表示。
- 目標点／デュース／先攻／カメラ手前チームは共通。チームラベル `A（山田）` のように 1 人名になる。

## 4. コート図（CourtDiagram） 🔵

ダブルス（従来）:
```
 奥: チームB
┌──────────┬──────────┐
│  B1(右)   │  B2(左)   │   ← 奥は正面視でミラー
├──────────┴──────────┤
│        ネット          │
├──────────┬──────────┤
│  A2(左)   │ 🏸A1(右) │
└──────────┴──────────┘
 手前: チームA
```

シングルス（スコア偶数 → 右コート）:
```
 奥: チームB
┌──────────┬──────────┐
│   B1      │  (空)     │   ← 奥のミラーにより right は画面左
├──────────┴──────────┤
│        ネット          │
├──────────┬──────────┤
│  (空)     │  🏸A1    │
└──────────┴──────────┘
 手前: チームA
```

シングルス（サーブ側スコア奇数 → 左コート）:
```
┌──────────┬──────────┐
│  (空)     │   B1      │
├──────────┴──────────┤
│        ネット          │
├──────────┬──────────┤
│  🏸A1    │  (空)     │
└──────────┴──────────┘
```

- props 追加: `singles?: boolean`, `serverPosition?: CourtSide`。
- `cell(team, side)` は `singles && side !== serverPosition` のとき空セル `{ id: 'empty-{team}-{side}', name: '', empty: true }` を返す。
- 空セルは `.is-empty { opacity: 0.6 }` で薄く表示。サーバー印（🏸）・レシーブラベル・矢印は従来ロジックのまま（空セルは `isServer/isReceiver=false`）。
- 手前/奥のミラー（奥は right を画面左）も従来どおり。

## 5. 記録操作（PositionControls / record.vue） 🔵

- `PositionControls` に `showOverride`（`withDefaults` 既定 true）。シングルスでは「A入替／B入替」行を非表示、「次のセットへ」は残す。
- コートチェンジボタン、打った／得点／レット／スキップ／取り消しは共通。
- 記録ガイド（Guide.vue）の④「A入替／B入替」の文言はダブルス向けのまま据え置き（🟡 シングルス利用者には該当ボタンが無いだけで害はない。必要なら後続で形式別文言に）。

## 6. 注釈（種別パス） 🔵

- 3 打目以降、シングルスでは打者二択パネル（`TypePassPanel` の hitter プロンプト）が出ず、種別キー 1 打で次へ進む。
- 打点パス・クイックパスは変更なし。

## 7. 統計 🔵

- 試合統計（`matches/[matchId]/stats.vue`）: 対象試合がシングルスなら `StatsGlobalFilterBar` の「ペア別」ボタンを非表示（`:show-pair-mode="match?.matchType !== 'singles'"`）。
- Group 統計: 「ペア別」は残す（ダブルス試合のペアのみ並ぶ）。
- 失点マップ（被決定点）の注記はシングルスでは選手単位の文言（`shotStats.weakness.playerNote`）に切り替える（REQ-302、2026-09-14 昇格）。

## 7b. シングルスサイドラインの描画（REQ-301、2026-09-14 昇格） 🔵

コート実寸: ダブルス幅 6.1m / シングルス幅 5.18m → サイドラインは左右 **0.46m 内側**。

| コンポーネント | 描画 | 座標 |
|---|---|---|
| `CourtDiagramInput`（注釈タップ、0.1m 単位） | **常に**描く（実コート同様。タップの目印） | x = COURT.left + 4.6 / COURT.left + COURT.width − 4.6、縦全長、細線（stroke-white/50 程度） |
| `StatsCourtZones`（統計、cm 単位） | **常に**描く | x = 46 / 610 − 46 = 564、縦全長、既存ライン群と同グループ・やや薄く |
| `CourtDiagram`（記録、装飾グリッド） | `singles=true` のときのみ | 左右 7.5%（46/610）内側に縦の白線オーバーレイ |

※ ダブルスロングサービスライン（バックから 0.76m）は 3 図とも既存どおり描く（実コートに常在するため形式で消さない）。

## i18n 追加キー 🔵

| キー | ja | en |
|---|---|---|
| `matches.matchTypeLabel` | 対戦形式 | Match type |
| `matches.matchTypeOptions.singles` | シングルス | Singles |
| `matches.matchTypeOptions.doubles` | ダブルス | Doubles |
| `matches.playerALabel` | 選手 A | Player A |
| `matches.playerBLabel` | 選手 B | Player B |
| `matches.notEnoughPlayers`（変更） | 試合を作成するには選手が 2 人以上（ダブルスは 4 人以上）必要です | （既存 en 値を維持） |
| `errors.players_must_be_distinct`（変更） | 同じ選手を複数の枠に選択することはできません | （既存 en 値を維持） |
| `errors.invalid_match_type` | 対戦形式が不正です | "" |

## data-testid 一覧（テスト用） 🔵

| testid | 場所 |
|---|---|
| `match-type` | MatchFormModal 形式ラジオ |
| `match-type-{id}` | 一覧の形式バッジ |
| `positions-title` | SetSetupForm（シングルスでは存在しない） |
| `a-first` / `b-first` | SetSetupForm（同上） |
| `cell-{playerId}` / `cell-empty-{team}-{side}` | CourtDiagram のセル |
| `override-a` / `override-b` | PositionControls（シングルスでは存在しない） |
| `mode-pair` | StatsGlobalFilterBar（シングルス試合統計では存在しない） |

## 信頼性レベルサマリー

🔵 青信号: 主要項目すべて / 🟡 黄信号: ガイド文言・失点マップ注記の据え置き判断
