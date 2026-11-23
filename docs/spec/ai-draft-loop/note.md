# ai-draft-loop コンテキストノート

## 既存コードの接点

- 注釈スタジオ: `app/pages/groups/[id]/matches/[matchId]/annotate.vue`（3 モードの切り替え。確認モードはここに 4 つ目として足す）
- 注釈の純関数: `app/utils/annotation/derive.ts`（`decisiveShotIndex` / `deriveInOut`）、`app/utils/annotation/offset.ts`
- 注釈列: `supabase/migrations/20260726120000_shot_annotation_add_annotation_columns.sql`。`annotation_source` の値域は `human` / `ai` のまま使う。`input_source`（タイミングの入力元）に AI 由来の値を足すかは設計で決める（REQ-008）
- rallies の列（`app/types/supabase.ts` で確認済み）: `video_start_timestamp_ms`（null 可）、`serving_team` / `server_player_id` / `receiver_player_id` / `server_position`（NOT NULL）、`point_winner`、`end_reason`、`land_x` / `land_y`、`camera_near_team`、`deleted_at`（論理削除）。終了時刻の列は無く、最終ショットの時刻で代替する。NOT NULL 列の既定値は REQ-008
- shots の列: `video_timestamp_ms`（押下）、`annotated_timestamp_ms` / `annotated_timestamp_precision`、`hit_player_id`、`shot_type`、`hand`、`hit_x` / `hit_y`、`annotation_source` / `ai_model_version` / `ai_confidence`、`input_source`（NOT NULL）、`deleted_at`
- 統計の母数表示: `stats_annotation_coverage`（`20260805150000_shot_stats_read_functions.sql`）。未確認表示は同じ関数群に列を足す形が自然
- 型の再生成は CI の gen-types（`project_gen_types_automation`）。ローカルで `pnpm db:types` は不要
- 動画再生: video-playback（ローカル再選択方式 A）。確認モードは既存のプレイヤーをそのまま使う

## 推論側との契約

- 下書き JSON の形式は `docs/design/ai-draft-loop/draft-json-v1.md`（設計で作成）に置く。`~/dev/badkichi-ai` の出力スクリプトはこれに合わせる
- 項目名（field）は requirements.md の対象項目表の名前を正とする
- `input_hash` は推論に使った入力（動画の内容ハッシュ + 設定）から推論側が計算する

## 実装順（案）

1. マイグレーション（2 表、`matches.eval_holdout`、下書き状態の列）と RLS、型再生成
2. 状態導出と書き出しの純関数 + SQL 関数（unit / integration で固められる部分）
3. 取り込み経路（CLI または管理用 API）。ADR-020-A3 と重なるので、A3 は本単位の設計を前提に進める
4. 確認モード（画面）
5. 統計の未確認表示

1 〜 2 は動画も推論結果も無くても進む。3 以降は `~/dev/badkichi-ai` の下書き JSON が 1 試合分あると検証しやすい（戸塚の映像から作れる）。

## 未決事項（設計で決める）

- value を jsonb にするか、型別の列にするか。本書は jsonb（項目ごとに型が違うため）
- `eval_holdout` の自動付与の比率（5 試合に 1）と、グループをまたいで数えるか
- 無操作の閾値（60 秒）とタブ非表示の扱い
- 取り込みの入口（CLI で service role を使うか、管理者だけが叩ける API にするか）
- 一括確認のショットに `lead_time_ms = 0` を入れる扱い（ラリー属性に全時間を寄せる）で集計がずれないか
- `deleted_at`（論理削除）のショット・ラリーに紐づく予測・確定の扱い（REQ-103 は連鎖削除と書いたが、実態は論理削除。設計で整合させる）

## 関連

- ADR-020 §1 〜 §4、ADR-017 §5（`shot_corrections` は本単位の二層に置き換え）
- `docs/research/loop-engineering/survey.md` §4-3（Label Studio のデータモデル）
- バックログ BL-020（作業時間の自動計測。本単位の `lead_time_ms` で代替）、BL-034（確認と訂正の画面。本単位の確認モードが該当）
