# singles-support コンテキストノート

**作成日**: 2026-08-28

## 目的

シングルス（各チーム 1 選手）の試合を、ダブルス向けに作った記録・注釈・統計の実装を極力そのまま流用して扱えるようにする。
ユーザビリティテスト U-04（テスターがシングルスを入力して保存に失敗）への対応でもある。

## 設計の要点（ダブルス流用の仕組み）

### 1. ルールエンジン: 「左右スロットに同一選手を入れたダブルス」として扱う

- `set_player_positions` はシングルスでは **各チーム `right` の 1 行**だけを保存する（`UNIQUE(set_id, player_id)` のため同一選手を 2 行入れられない）。
- `createInitialState` が片側しか無いスロットを同一選手で埋める（`fillSingleSlot`）。
- 以降は `applyRally` / `applyOverride` を **無変更**で使う:
  - サーブ側得点時の左右入替は同一選手なので無害。
  - `serverPosition`（偶数=右 / 奇数=左）がそのままシングルスのサービスコート規則になる。
  - レシーバー = 相手チームの同ラベル側 = 相手選手そのもの。
- `rallies.server_position` の denormalize もダブルスと同じ意味（サービスコート）で保存される。

### 2. DB

- `matches.match_type text NOT NULL DEFAULT 'doubles' CHECK IN ('singles','doubles')`
- `team_a_player2_id` / `team_b_player2_id` を NULL 許容に。`matches_match_type_players_check` で形式と NULL の整合を強制。
- `matches_players_distinct_check` を NULL 対応版に再定義（旧 6-way 不等号は NULL 混入で CHECK 全体が NULL=通過になるため）。
- `stats_pair_rates` は `player2 IS NOT NULL` の試合だけを対象にする（`LEAST/GREATEST` が NULL を無視し `(p1,p1)` の偽ペアを作るため）。
- 既存の shot_stats 系関数の `hit_player_id IN (a1, a2)` は `a2 = NULL` でも正しく動く（NULL は不一致扱い）ため無変更。
- `app/types/supabase.ts` は手修正済み。マイグレーション適用後に `pnpm db:types` で再生成すること。

### 3. UI

| 画面 | シングルス時の挙動 |
| --- | --- |
| 試合フォーム | 対戦形式ラジオ（既定ダブルス）。シングルスは各チーム 1 枠、player2 は `null` で保存 |
| 試合一覧 | 形式バッジ表示。選手 2 人から「試合を追加」可能（ダブルスの 4 人要件はフォーム検証が担う） |
| セット設定 | 「ファースト」選択欄を出さない（唯一の選手が自動的にファースト） |
| コート図 | `serverPosition` 側のサービスコートだけに選手を描き、反対側は空セル |
| 記録操作 | A入替 / B入替 ボタン非表示 |
| 注釈（種別パス） | 3 打目以降の打者二択を候補 1 人なら自動確定して前進 |
| 試合統計 | 「ペア別」モードを非表示 |

## スコープ外（今後）

- シングルス用のサイドライン描画（コート図・注釈コート・統計ゾーンは現状ダブルス幅のまま）
- 失点マップ（StatsWeaknessMaps）のシングルス個人単位化（現状チーム単位 = シングルスでは実質個人）
- ミックス/トリプルスなど他形式
