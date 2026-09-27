# shot-stats RPC 仕様（API エンドポイント相当）

**作成日**: 2026-08-03
**関連設計**: [architecture.md](architecture.md) / [database-schema.sql](database-schema.sql)
**関連要件定義**: [requirements.md](../../spec/shot-stats/requirements.md)

本単位は REST API を追加しない。Supabase RPC（PostgreSQL 関数）を `client.rpc()` で呼び出す（stats-dashboard 前例踏襲）。関数本体・集計規則の詳細は [database-schema.sql](database-schema.sql) を正とする。

**【信頼性レベル凡例】**: 🔵 確実 / 🟡 妥当な推測 / 🔴 出典なし

---

## 共通仕様 🔵

**信頼性**: 🔵 *stats-dashboard RPC 規約（実装調査 2026-08-03）*

- 呼び出し: `app/utils/stats-dashboard/stats-rpc.ts` の `callStatsRpc<T>(client, fn, args)` を再利用（fn union に 5 関数を追加）
- 認証: Supabase セッション必須（`GRANT EXECUTE ... TO authenticated`）。RLS は SECURITY INVOKER で継承（他 Group は 0 行）
- スコープ引数（全関数共通）: `p_match_id` XOR `p_group_id`（両方 NULL / 両方指定 → `invalid_scope` 例外）+ `p_group_id` 時の `p_match_ids uuid[]`（期間・試合のグローバルフィルタ結果）
- 追加共通引数: `p_set_number smallint`（セットフィルタ。coverage を除く）
- エラー: `invalid_scope` はクライアント側のスコープ生成バグ扱い。その他はエラー表示 + リトライ導線（既存パターン）

## エンドポイント一覧

### stats_annotation_coverage 🔵 — REQ-002/003（注釈率・母数）
- **引数**: scope 共通のみ
- **返却**: 試合ごと 1 行 `{ match_id, shots_total, shots_typed, shots_pointed, shots_handed, shots_attributed, rallies_total, rallies_ended, rallies_fully_timed }`
- **利用**: タブヘッダーのバッジ（スコープ合計）、各チャートの n / N

### stats_shot_types 🔵 — REQ-008/009/010/012（C/D/G の基盤）
- **引数**: scope 共通 + `p_set_number`
- **返却 grain**: `(hit_player_id, shot_type, hand)` × 集計値 `{ shots, serve_first_shots, serve_won, decisive_won, miss_lost, rallies, rallies_won }`
- **クライアント側導出**: ミス率 = miss_lost/shots、決定率 = decisive_won/shots、構成比 = shots/Σshots、球種別得点率 = rallies_won/rallies、サーブ得点率 = serve_won/serve_first_shots。選手・球種・hand の絞り込みは computed

### stats_shot_zones 🔵 — REQ-011/105/302 + EDGE-101（F）
- **引数**: scope 共通 + `p_set_number` + `p_hand` + `p_zones int DEFAULT 3`
- **返却 grain**: `(hit_player_id, shot_type, zone_row 0..2*zones-1, zone_col 0..zones-1)` × `{ shots }`
- **備考**: ミラー（選手視点固定）とクランプ算入は SQL 側で適用済み。打者未注釈ショットは対象外（バッジで明示）

### stats_rally_endings 🔵 — REQ-005/006/007（A の基盤）
- **引数**: scope 共通 + `p_set_number`
- **返却**: 確定ラリーごと 1 行 `{ rally_id, match_id, set_number, rally_number, serving_team, point_winner, end_reason, last_hitter_team, decisive_shot_type, decisive_hit_player_id, land_x, land_y, out_direction, team_a/b_player1/2_id }`
- **クライアント側導出**: 決着 4 分類 + unknown（`endings.ts`）、落下点ミラー・ゾーン化（`mirror.ts`）、out 細分（`deriveOutDirection` 同一規則, REQ-103）

### stats_rally_tempo 🔵 — REQ-015/016/106（K の基盤）
- **引数**: scope 共通 + `p_set_number`
- **返却**: 確定ラリーごと 1 行 `{ rally_id, match_id, set_number, rally_number, serving_team, point_winner, shot_count, timed_count, duration_ms, last3_avg_interval_ms, team_a/b_player1/2_id }`
- **クライアント側導出**: 適格判定（timed_count = shot_count かつ shot_count ≥ 2 かつ duration > 0）、平均テンポ、密度系列（`tempo.ts`）

### （新規なし）stats_rallies 🔵 — J/L は既存 RPC を再利用
- `score_a / score_b / point_winner / serving_team / video_start_timestamp_ms` から J（`phase.ts`）と L（`momentum.ts`）を導出。新 RPC・既存 RPC の変更は行わない

## 型の反映 🔵

- 実装後 `pnpm db:types` で `app/types/supabase.ts` を再生成（新 RPC の Args/Returns）
- 行型は `app/types/shot-stats.ts` に手書き（[interfaces.ts](interfaces.ts) 参照。既存 stats-dashboard.ts と同方式）

## 関連文書

- **アーキテクチャ**: [architecture.md](architecture.md) / **データフロー**: [dataflow.md](dataflow.md)
- **型定義**: [interfaces.ts](interfaces.ts) / **RPC 本体**: [database-schema.sql](database-schema.sql)

## 信頼性レベルサマリー

- 🔵 青信号: 9 件（100%）/ 🟡 0 / 🔴 0
**品質評価**: 高品質
