# stats-dashboard コンテキストノート

**作成日**: 2026-06-06
**作業規模**: フル機能開発
**位置づけ**: MVP 全8ユニットの最終ユニット（record の隣の「読み取り・分析」面）

## 1. 責務（スコープ境界）

stats-dashboard は、録画系テーブルに蓄積された **denormalize 済みデータを集計・可視化する読み取り専用の分析画面 + 集計層**。

- **含む**: 統計算出（得点率・ラリー長分析）、チャート可視化、ラリー一覧テーブル、ラリージャンプ
- **含まない**:
  - 録画・データ入力 → match-recording の責務
  - 純ルール計算（サーバー/レシーバー推論） → rule-engine の責務（stats は denormalize 済み結果を読むだけ）
  - 試合・選手 CRUD → match-management / player-management
  - 再生エンジン → video-playback を利用するのみ

## 2. 技術スタック

- Nuxt 4 (Vue 3) + Nuxt UI + TypeScript strict
- Supabase (PostgREST / RPC)、RLS（`is_member_of(matches.group_id)` 経由）
- チャート: **vue-echarts**（PRD §6 技術スタックで指定）
- CSR 限定（ADR-010 SSR/CSR 境界、Supabase クライアントデータ取得）
- composable は操作別分割（ADR-007）

## 3. 消費するデータ（既存スキーマ・追加不要）

initial_schema.sql で確定済。**stats-dashboard はスキーマ変更を行わない**（読み取りのみ）。

| テーブル | stats が使う主な列 |
|---|---|
| `rallies` | `serving_team`, `server_player_id`, `receiver_player_id`, `point_winner`, `is_let`, `is_point_confirmed`, `rally_number`, `video_start_timestamp_ms` |
| `shots` | `rally_id`, `shot_number`（本数カウント＝ラリー長）。**MVP は種別・打者なし** |
| `sets` | `set_number`, `winner`, `first_serving_team`, `target_points` |
| `set_player_positions` | 初期立ち位置（参考） |
| `players` | `name`, `handedness`（表示用） |
| `matches` | 試合メタ（4選手・動画ソース） |

### データ面の重要な制約

- **ショット分析はラリー長（shot 本数）止まり** 🔵 — `shots` に種別・打者がないため「ショット種別分析」は MVP 範囲外（PRD §3.2 除外）
- 得点率は `rallies` の denormalize 列（`server_player_id` / `receiver_player_id` / `point_winner`）から算出可能 🔵
- 集計から除外すべき行: `is_let=true`（レット）、`point_winner IS NULL` / `is_point_confirmed=false`（未確定・スキップ）

## 4. PRD 由来の要求（§F-04 / US-02・US-04・US-06）

1. 🥇 **最重要**: サービス時 vs レシーブ時の得点率（選手別）チャート
2. 🥈 **次に重要**: ラリーのショット数（ラリー長）と得点率の関係チャート
3. ラリー一覧テーブル（番号・サーバー・レシーバー・スコア・ショット数・結果）
4. ラリー一覧から該当ラリーの動画再生位置にワンクリックジャンプ
5. NFR: 統計チャートの初期表示 3 秒以内（PRD 性能要件）

PRD 想定ルート: `/matches/:id/stats`（ただし実アプリは `/groups/[id]/matches/[matchId]/...` 規約 → `/groups/[id]/matches/[matchId]/stats`）

## 5. 上流単位との連携

- **video-playback**: ラリージャンプで composable を利用（match-recording と同じ依存方向 stats → video-playback の一方向）。local 動画は方式 A（再選択）の制約を引き継ぐ
- **rule-engine**: 直接は使わない（録画時に算出・denormalize 済みの結果を読む）
- **match-recording**: record 画面 ↔ stats 画面の相互導線（`[統計を見る →]` / `[← 記録に戻る]`）

## 6. 収益化（ADR-013）との接点 — 設計時の仕込み

- ダッシュボードを「**基本 / 詳細**」でグルーピングできる構造にしておく（基本=Free、詳細=Pro/Trial）。実装ゲート（課金判定）は MVP 後
- どの指標が「詳細（=将来有料）」かを作りながら一言メモする

## 7. 関連 ADR / メモリ

- ADR-002（要件分割・循環依存防止）, ADR-007（composable 命名）, ADR-010（SSR/CSR 境界）, ADR-012（テスト戦略）, ADR-013（収益化）
- [[project_state_storage]]（denormalize 済み rally 状態を DB に保存 = stats の前提）
- [[project_video_playback_spec]]（ラリージャンプの再生基盤・方式A）
- [[project_rally_correction]]（修正は直前のみ＝stats は確定データを読む）
- [[feedback_test_coverage]]（境界値＋分岐網羅のみ）, [[feedback_claude_lead_with_pros_cons]]
