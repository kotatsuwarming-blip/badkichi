-- ========================================
-- shot-annotation additive migration: 注釈列の追加
-- ========================================
--
-- 関連設計: docs/design/shot-annotation/database-schema.sql / architecture.md
-- 関連要件: docs/spec/shot-annotation/requirements.md REQ-002 / REQ-406
--
-- 方針:
-- - additive のみ (ADD COLUMN)。既存列・既存アプリの動作に影響しない。
-- - 全列 nullable = 部分的な注釈が正常状態 (REQ-003)。
-- - RLS ポリシーの追加は不要: 注釈は既存行の UPDATE のみで、shots / rallies の
--   UPDATE ポリシー (FK 経由 is_member_of) は initial_schema で定義済み (design-interview D2)。
-- - hit_x/hit_y/land_x/land_y は絶対正規化座標 (REQ-014)。ライン外は範囲外値 (<0 / >1) を
--   許容するため 0-1 の CHECK は掛けない。
-- - 適用は CI 経由 (dev: migrate-dev / prd: migrate-prd)。型は gen-types が再生成。
--   memory: feedback_db_password_ci_only。
-- - shot_corrections テーブルは Stage 2 (AI 下書き) 導入時 (REQ-302)。
--   打点の高さ (hit_z) は Stage 3 で自動導出する際に追加 (ヒアリング2026-07-24)。

-- shots: ショット単位の注釈列 (ADR-017 §5)
ALTER TABLE shots
  -- 誰が打ったか (プレフィル: 1打目=server / 2打目=receiver / 以降チーム偶奇+二択, REQ-012)
  ADD COLUMN hit_player_id uuid REFERENCES players(id),
  -- 球種 16種 (ADR-017 §6)
  ADD COLUMN shot_type text CHECK (shot_type IN (
    'serve_short', 'serve_long', 'serve_drive',
    'clear', 'smash', 'cut', 'reverse_cut', 'drop',
    'hairpin', 'lob', 'push', 'half',
    'drive',
    'receive_long', 'receive_drive', 'receive_short'
  )),
  -- フォア/バック。null = 未判定 (hand トグル OFF のパス)。null をフォアと解釈しない (REQ-104)
  ADD COLUMN hand text CHECK (hand IN ('forehand', 'backhand')),
  -- 打点 (絶対正規化座標, REQ-014)
  ADD COLUMN hit_x real,
  ADD COLUMN hit_y real,
  -- 人間がフレーム確認して確定した打球時刻 (ローカル動画のみ, REQ-010)。
  -- 押下時刻 video_timestamp_ms は上書きせず保持 → ペアが Stage 2 スナッピングの教師データ
  ADD COLUMN annotated_timestamp_ms integer,
  -- AI 下書き用の先行定義 (Stage 2 以降)。MVP は 'human' 固定 (REQ-301)
  ADD COLUMN annotation_source text CHECK (annotation_source IN ('human', 'ai')),
  ADD COLUMN ai_model_version text,
  ADD COLUMN ai_confidence real;

-- rallies: ラリー決着の注釈列 (ADR-017 §7)
ALTER TABLE rallies
  -- 決着の物理分類 7値。最終接触者 + end_reason で勝敗の向きを導出可能 (REQ-102)
  ADD COLUMN end_reason text CHECK (end_reason IN (
    'in', 'out', 'net', 'not_over', 'body', 'service_fault', 'unknown'
  )),
  -- 決着の落下点 (end_reason が in/out のときのみ入力, REQ-005)。
  -- 1ラリーに高々1点のラリー属性のため shots ではなく rallies に持つ (ユーザー指摘 2026-07-19)
  ADD COLUMN land_x real,
  ADD COLUMN land_y real,
  -- out 細分のフォールバック (通常は land_x/y から導出。落下点未入力時のみ保存)
  ADD COLUMN out_direction text CHECK (out_direction IN ('side', 'back', 'both'));
