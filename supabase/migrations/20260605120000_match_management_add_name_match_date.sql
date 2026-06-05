-- ========================================
-- match-management additive migration
-- ========================================
--
-- 関連設計: docs/design/match-management/database-schema.sql / architecture.md / interfaces.ts
-- 関連要件: docs/spec/match-management/requirements.md §スキーマ拡張 (REQ-007/008/108/109/408) / NFR-203
--
-- 方針:
-- - 既存 20260519060000_initial_schema.sql は **編集しない**。新規タイムスタンプ migration として追加する
--   (TASK-0018 の ADR-006 追記 migration と同じパターン)。
-- - 変更は matches への **additive な列追加のみ** (name / match_date)。データ破壊なし。
-- - 適用は CI 経由 (db:push、ローカル不可)。適用後 app/types/supabase.ts を Management API で再生成。
--   (memory: feedback_db_password_ci_only)
-- - RLS は既存 matches_select/insert/update (is_member_of) をそのまま利用。新規ポリシー不要。
-- - video_source_url は NOT NULL のまま変更しない (local=ファイル名ラベル / youtube=URL)。

-- ========================================
-- matches: 試合名 (name) の追加
-- ========================================

-- REQ-007 / REQ-108: 試合名。任意 (NULL 可)。例: "XX練習会" / "横浜市大会"。
ALTER TABLE matches
  ADD COLUMN name text;

-- REQ-108 / EDGE-011: 入力時は trim 後 1〜50 字 (未入力=NULL は許容)。
--   groups/players の name 1〜50 字 CHECK と整合。
ALTER TABLE matches
  ADD CONSTRAINT matches_name_length_check
  CHECK (name IS NULL OR char_length(trim(name)) BETWEEN 1 AND 50);

-- ========================================
-- matches: 試合日付 (match_date) の追加
-- ========================================

-- REQ-008 / REQ-109: その試合が行われた日付。一覧の管理・並びキー。
--   NOT NULL + DEFAULT CURRENT_DATE。DEFAULT は migration 安全性と "UI 既定=本日" の安全網
--   (アプリは常に明示値を送る。REQ-109 の必須はクライアント Zod でも担保)。
ALTER TABLE matches
  ADD COLUMN match_date date NOT NULL DEFAULT CURRENT_DATE;

-- ========================================
-- インデックス (並び替え最適化)
-- ========================================

-- NFR-203: 一覧は (group_id) で絞り match_date 降順で並べる。将来の試合数増に備え部分インデックスを
--   含める。既存 idx_matches_group_id と併存。
CREATE INDEX IF NOT EXISTS idx_matches_group_id_match_date
  ON matches (group_id, match_date DESC)
  WHERE deleted_at IS NULL;
