# singles-support API（PostgREST / RPC）仕様

**作成日**: 2026-08-28
**関連**: [architecture.md](architecture.md) / [database-schema.sql](database-schema.sql)

本プロジェクトは独自の REST API を持たず、Supabase の PostgREST（テーブル直接操作 + RLS）と RPC（`stats_*` 関数）を API として使う。ここでは本単位で**変わるクエリ**を列挙する。

**【信頼性レベル凡例】** 🔵 確実 / 🟡 妥当な推測

## 1. matches（PostgREST） 🔵

### INSERT（useCreateMatch）
```ts
client.from('matches').insert({
  group_id, name, match_date,
  match_type: input.matchType,            // 追加
  team_a_player1_id: input.teamAPlayer1Id,
  team_a_player2_id: input.teamAPlayer2Id, // singles は null
  team_b_player1_id: input.teamBPlayer1Id,
  team_b_player2_id: input.teamBPlayer2Id, // singles は null
  video_source_type, video_source_url
}).select('id, name, match_date').single()
```
- DB 側エラー: `matches_match_type_players_check` / `matches_players_distinct_check` 違反 → `ActionResult.error` → toast（既存 EDGE-010）。

### UPDATE（useUpdateMatch）
- INSERT と同じ列（`group_id` は送らない）。形式変更（doubles ↔ singles）も同じ経路で可能。

### SELECT 一覧（useMatches）
```ts
.select('id, name, match_date, match_type, created_at, video_source_type, video_source_url, completed_at,
         ta1:players!matches_group_id_team_a_player1_id_fkey(id, name),
         ta2:players!matches_group_id_team_a_player2_id_fkey(id, name),   // singles では null
         tb1:players!matches_group_id_team_b_player1_id_fkey(id, name),
         tb2:players!matches_group_id_team_b_player2_id_fkey(id, name),   // singles では null
         sets(winner, deleted_at)')
```
- 埋め込みは FK が NULL のとき `null` を返す（PostgREST の to-one 埋め込み仕様）。クライアントは `[ta1, ta2].flatMap(p => p ? [...] : [])` で 1〜2 人に射影。

### SELECT 単件（useMatchForRecording / useAnnotationSession）
- 上記と同様に `match_type` を追加し、`ta2` / `tb2`（または `team_*_player2_id`）の null をスキップしてロスターを組む。

## 2. set_player_positions（PostgREST） 🔵

### INSERT（useCreateSetPositions）— 変更なし
- singles: 2 行 `[{ set_id, player_id: A1, team: 'A', position: 'right' }, { ..., player_id: B1, team: 'B', position: 'right' }]`
- doubles: 4 行（従来）
- 制約 `UNIQUE(set_id, player_id)` / `UNIQUE(set_id, team, position)` はどちらも満たす。

### SELECT（useSetPositions）— 変更なし
- 呼び出し側（record.vue）の再開判定を「行数 === 4」から「team A と B の行がある」に変更。

## 3. RPC（stats_*） 🔵

| 関数 | 変更 | クライアント側 |
|---|---|---|
| `stats_pair_rates(p_match_id, p_group_id, p_match_ids, p_set_number)` | `match_pairs` CTE で `player2 IS NOT NULL` の試合のみ | 変更なし（singles 試合の行が返らなくなるだけ） |
| `stats_player_rates` | 変更なし | 変更なし |
| `stats_rallies` | 変更なし（pair フィルタは相異 2 名前提で singles と一致しない） | 変更なし |
| `stats_rally_endings` / `stats_rally_tempo` | 変更なし（出力の `team_*_player2_id` が NULL になり得る） | 型を `string \| null` に。`endings.ts` / `flow.ts` で null 除外 |
| `stats_shot_types` / `stats_shot_zones` / `stats_shot_placement*` / `stats_serve_types` / `stats_receive_types` | 変更なし（`IN (a1, NULL)` の NULL セマンティクスで正しく動作） | 変更なし |

## 4. 型生成 🔵

- `app/types/supabase.ts`（`pnpm db:types`）: migration 適用後に再生成。
  - `matches.Row.match_type: string`、`team_*_player2_id: string | null`
  - `Functions.stats_rally_endings / stats_rally_tempo.Returns[].team_*_player2_id: string | null`
- 適用前は同内容を手修正して型を先行させる（REQ-408）。

## 5. RLS 🔵

- 変更なし。`matches_*` ポリシーは `is_member_of(group_id)`。`match_type` 列・NULL 許容化はポリシー式に関与しない。
