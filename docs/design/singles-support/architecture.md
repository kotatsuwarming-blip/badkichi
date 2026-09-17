# singles-support アーキテクチャ設計

**作成日**: 2026-08-28
**関連要件**: [docs/spec/singles-support/requirements.md](../../spec/singles-support/requirements.md)
**関連文書**: [dataflow.md](dataflow.md) / [interfaces.ts](interfaces.ts) / [database-schema.sql](database-schema.sql) / [ui-design.md](ui-design.md) / [api-endpoints.md](api-endpoints.md)

**【信頼性レベル凡例】** 🔵 要件・確定スキーマ・既存実装から確実 / 🟡 妥当な推測 / 🔴 出典なし

## システム概要 🔵

ダブルス固定の既存 5 単位（match-management / match-recording / rule-engine / shot-annotation / stats）を横断して、シングルス（各チーム 1 選手）を扱えるようにする。**新しいフロー・新しい RPC・新しいテーブルは作らない**。変更は次の 3 層に限定する。

| 層 | 変更 | 変更しないもの |
|---|---|---|
| DB | `matches.match_type` 追加、`player2` 列 NULL 許容、CHECK 再定義、`stats_pair_rates` のシングルス除外 | `sets` / `set_player_positions` / `rallies` / `shots` / `position_overrides` の定義、RLS、shot_stats 系関数 |
| ドメイン（純関数） | `createInitialState` のスロット補完、`buildSetInput` の 1 人/チーム許容、`matchFormSchema` の形式分岐 | `applyRally` / `applyOverride` / `determineSetWinner`、注釈の derive / suggest、統計の集計関数（NULL 除外のみ） |
| UI / composable | 試合フォーム・一覧・セット設定・コート図・入替ボタン・種別パス・統計フィルタの**表示分岐** | 記録セッション（`useRecordingSession`）、注釈セッションの状態機械、統計ビューの状態 |

## アーキテクチャパターン 🔵

**「形式の差をデータの形で吸収する」パターン**。シングルスをダブルスの特殊ケース（片チームの 2 スロットが同一選手）として表現し、既存のダブルス処理をそのまま通す。

- **rule-engine**: `TeamPositions { left, right }` の両スロットに同じ `playerId` を入れる。
  - サーブ側得点時の左右入替（`applyRally`）は同一選手の交換なので状態が変わらない。
  - `serverPosition = servingScore % 2 === 0 ? 'right' : 'left'` は、シングルスのサービスコート規則（偶数=右/奇数=左）と一致する。
  - `receiver = positions[receivingTeam][serverPosition]` は相手選手そのもの。
  - `applyOverride` はトグルしても同一状態（UI で入替ボタンを出さないので実質呼ばれない）。
- **DB**: `set_player_positions` は `UNIQUE(set_id, player_id)` のため同一選手を 2 行入れられない → シングルスは各チーム `right` の 1 行だけを保存し、**読み出し側（`createInitialState`）で補完**する。書き込み側を変えず、読み出し側 1 箇所で吸収する。
- **統計 SQL**: `hit_player_id IN (a1, a2)` は `a2 = NULL` で「a1 と一致 → true / それ以外 → NULL（偽扱い）」となり、次の `WHEN ... IN (b1, b2)` へ正しく落ちる。ペア集計（`LEAST/GREATEST`）だけは NULL を無視して偽ペアを作るため、`player2 IS NOT NULL` で除外する。

**理由**: 形式ごとの分岐を全層に散らすと回帰リスクが 5 単位に広がる。データ表現で吸収すれば、変更点は「入口（フォーム）」「セット開始（立ち位置）」「表示（コート図・ボタン・フィルタ）」に局所化できる（NFR-301）。

## コンポーネント構成

### DB 層（Supabase / additive migration） 🔵

`supabase/migrations/20260828120000_singles_match_type.sql`（[database-schema.sql](database-schema.sql)）

- `matches.match_type text NOT NULL DEFAULT 'doubles' CHECK IN ('singles','doubles')`
- `team_a_player2_id` / `team_b_player2_id` `DROP NOT NULL`
- `matches_match_type_players_check`（形式 ↔ NULL 整合）
- `matches_players_distinct_check` を NULL 対応版で再定義
- `stats_pair_rates` を `CREATE OR REPLACE`（`match_pairs` CTE に `player2 IS NOT NULL`）

複合 FK `(group_id, team_*_player2_id) → players(group_id, id)` は `MATCH SIMPLE` のため、player2 が NULL なら参照検査をスキップする（変更不要）。

### ドメイン層（純関数） 🔵

| ファイル | 変更 |
|---|---|
| `app/types/match.ts` | `MatchType`、`PLAYERS_PER_TEAM`、`MatchListItem.matchType`、`teamA/teamB: MatchPlayerRef[]`、`CreateMatchInput.teamXPlayer2Id: string \| null` |
| `app/schemas/match-form.ts` | `matchType` 必須、player2 `nullish`、doubles で player2 必須、相異判定を形式別人数で実施、singles の player2 を `null` に `transform` |
| `app/utils/rule-engine/create-initial-state.ts` | `fillSingleSlot`: 片側スロットしか無いチームを同一選手で埋める |
| `app/utils/match-recording/build-set-input.ts` | 1 人/チームを許容し、singles は `right` の 1 行だけ出す（`teamPositions` ヘルパ） |
| `app/utils/shot-stats/endings.ts` / `flow.ts` | `team_*_player2_id` の NULL を `filter` で除外し、`teamA/teamB: string[]` に |

### Composable 層 🔵

| composable | 変更 |
|---|---|
| `useCreateMatch` / `useUpdateMatch` | `match_type` を送る。player2 は `null` をそのまま送る |
| `useMatches` | `match_type` を select。埋め込み `ta2/tb2` が null なら 1 人構成に |
| `useMatchForRecording` | `match_type` を select。ロスターを 2 人 or 4 人で組む。`MatchForRecording.matchType` 追加 |
| `useAnnotationSession` | `match_type` を select。`teamOf` Map を NULL スキップで構築（ロスター 2 人 → 打者候補 1 人） |
| `useTypePass` | `inputType` で打者候補が 1 人なら `hitPlayerId` を同時に patch し `advance()` |
| `useRecordingSession` | **変更なし**（positions を透過するだけ） |

### ページ / コンポーネント層 🔵

| コンポーネント | 変更 |
|---|---|
| `MatchFormModal.vue` | 対戦形式ラジオ（既定 doubles）。singles は player2 の `USelectMenu` を `v-if` で非表示、ラベル「選手 A/B」 |
| `matches/index.vue` | 形式バッジ、`hasEnoughPlayers >= 2`、対戦カードを `join('・')` |
| `SetSetupForm.vue` | `isSingles`（各チーム 1 人）ならファースト選択欄を出さず、唯一の選手を `buildSetInput` に渡す |
| `CourtDiagram.vue` | `singles` / `serverPosition` props。singles は `serverPosition` 側のセルにのみ選手、反対側は空セル |
| `PositionControls.vue` | `showOverride`（既定 true）。singles は入替ボタン非表示 |
| `record.vue` | `isSingles` を上記 2 コンポーネントへ。再開判定を「両チームの行が揃っている」に緩和 |
| `StatsGlobalFilterBar.vue` / `matches/[matchId]/stats.vue` | `showPairMode`（既定 true）。singles 試合では「ペア別」非表示 |

## 形式判定の一元化 🔵

形式は **`matches.match_type` を唯一の真実**とし、UI では以下の 2 通りで参照する。

1. 試合行を持つ画面（フォーム・一覧・記録・注釈・試合統計）: `matchType === 'singles'`
2. ロスターしか持たない部品（`SetSetupForm` / `buildSetInput`）: `チーム人数 === 1`（`PLAYERS_PER_TEAM.singles`）

両者は `match_type` と player2 NULL の整合を DB CHECK が保証しているため常に一致する。

## Vue の Boolean prop に関する注意 🔵

「既定 true」の Boolean prop（`showOverride` / `showPairMode`）は、未指定時に Vue が `false` へキャストするため **`withDefaults` で明示**する（プロトタイプでテストが検出した回帰）。

## 永続化・再開 🔵

- 立ち位置行: singles は `set_player_positions` に各チーム 1 行（`right`）。既存の遅延作成（最初の記録操作時に `sets` + `set_player_positions` を作る）は不変。
- 再開（リロード）: `record.vue` は従来「行数 === 4」で再開判定していたが、「A と B の行が両方ある」に変更。`resumeSet` → `createInitialState` がスロットを補完し、確定ラリーを replay する。

## 既存設計からの差分 🔵

| 既存要件 | 差分 |
|---|---|
| match-management REQ-407 / match-recording REQ-407 / shot-annotation REQ-408（ダブルス固定） | 本単位で解除。ダブルスは既定値として維持 |
| match-management REQ-203（選手 4 人未満で作成不可） | 2 人未満で作成不可に緩和。4 人要件はフォーム検証へ |
| rule-engine architecture.md「`SetPlayerPosition[]` の配列長で対応」 | 配列長 2（各チーム 1 行）を `createInitialState` が受け付ける形で実現 |
| stats-dashboard「ペア別」 | singles 試合はペア集計から除外、試合統計ではモード非表示 |

## 非機能要件の実現方法

- **パフォーマンス** 🔵: 列追加のみ。一覧・RPC の結合条件・インデックスは不変（NFR-001）。
- **セキュリティ** 🔵: RLS は `group_id` ベースで不変。`match_type` はメンバーなら誰でも更新可（既存の全項目編集方針、NFR-101）。
- **テスト容易性** 🔵: 分岐は純関数（schema / createInitialState / buildSetInput）と presentational component に集中。`useRecordingSession` の既存テストは無変更で通る。

## 技術的制約 🔵

- migration は CI 経由（`migrate-dev.yml` は `dev` push + `supabase/migrations/**` 変更で発火）。ローカル `db push` 禁止。
- `app/types/supabase.ts` は生成物。migration 適用前は手修正で型を先行させ、適用後に `pnpm db:types` で同期する（REQ-408）。
- `set_player_positions` の `UNIQUE(set_id, player_id)` は変更しない（同一選手 2 行を許すと doubles 側の重複防止 EDGE-002 が崩れる）。

## 関連文書

- 要件: [../../spec/singles-support/requirements.md](../../spec/singles-support/requirements.md)
- ノート: [../../spec/singles-support/note.md](../../spec/singles-support/note.md)
- rule-engine 設計: [../rule-engine/architecture.md](../rule-engine/architecture.md)
- match-recording 設計: [../match-recording/architecture.md](../match-recording/architecture.md)
- プロトタイプ実装: ブランチ `wip/singles-prototype`（タスク実装時の参照用。そのまま取り込まず TDD で再構成する）

## 信頼性レベルサマリー

🔵 青信号: 全項目（プロトタイプで typecheck / lint / 単体テスト 568 件を通過して検証済み）
