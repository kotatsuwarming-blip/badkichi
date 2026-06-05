-- ========================================
-- match-management additive migration
-- ========================================
--
-- 作成日: 2026-06-05
-- 関連設計: architecture.md / interfaces.ts
-- 関連要件: docs/spec/match-management/requirements.md §スキーマ拡張 (REQ-007/008/108/109/408)
--
-- 信頼性レベル:
-- 🔵 青信号: requirements.md ヒアリング(2026-06-05)・既存 initial_schema.sql を参考にした確実な定義
-- 🟡 黄信号: 妥当な推測
-- 🔴 赤信号: 推測
--
-- 方針:
-- - 既存 initial_schema.sql は **編集しない**。新規タイムスタンプ migration として追加する
--   (TASK-0018 の追記 migration と同じパターン)。
-- - 変更は matches への **additive な列追加のみ** (name / match_date)。データ破壊なし。
-- - 適用は CI 経由 (db:push、ローカル不可)。適用後 app/types/supabase.ts を Management API で再生成。
--   (memory: feedback_db_password_ci_only)
-- - RLS は既存 matches_select/insert/update (is_member_of) をそのまま利用。新規ポリシー不要。
--
-- 配置例: supabase/migrations/<timestamp>_match_management_add_name_match_date.sql
--

-- ========================================
-- matches: 試合名 (name) の追加
-- ========================================

-- 🔵 REQ-007 / REQ-108: 試合名。任意 (NULL 可)。例: "XX練習会" / "横浜市大会"。
ALTER TABLE matches
  ADD COLUMN name text;

-- 🔵 REQ-108 / EDGE-011: 入力時は trim 後 1〜50 字 (未入力=NULL は許容)。
--   groups/players の name 1〜50 字 CHECK と整合。
ALTER TABLE matches
  ADD CONSTRAINT matches_name_length_check
  CHECK (name IS NULL OR char_length(trim(name)) BETWEEN 1 AND 50);

-- ========================================
-- matches: 試合日付 (match_date) の追加
-- ========================================

-- 🔵 REQ-008 / REQ-109: その試合が行われた日付。一覧の管理・並びキー。
--   NOT NULL + DEFAULT CURRENT_DATE (ヒアリング2026-06-05 で確定)。DEFAULT は migration 安全性と
--   "UI 既定=本日" の安全網 (アプリは常に明示値を送る。REQ-109 の必須はクライアント Zod でも担保)。
ALTER TABLE matches
  ADD COLUMN match_date date NOT NULL DEFAULT CURRENT_DATE;

-- ========================================
-- インデックス (任意・並び替え最適化)
-- ========================================

-- 🔵 NFR-203: 一覧は (group_id) で絞り match_date 降順で並べる。将来の試合数増に備え部分インデックスを
--   今回の migration に含める (ヒアリング2026-06-05 で確定)。既存 idx_matches_group_id と併存。
CREATE INDEX IF NOT EXISTS idx_matches_group_id_match_date
  ON matches (group_id, match_date DESC)
  WHERE deleted_at IS NULL;

-- ========================================
-- 変更しないもの (明示)
-- ========================================
-- 🔵 video_source_url: NOT NULL のまま (local=ファイル名ラベル / youtube=URL)。ヒアリング2026-06-05。
-- 🔵 matches_players_distinct_check / 複合 FK / RLS: 変更なし。
-- 🔵 sets / set_player_positions / rallies 等: 本単位は一切触らない (REQ-405)。

-- ========================================
-- 信頼性レベルサマリー
-- ========================================
-- 🔵 青信号: name 列 + CHECK + match_date 列 (NOT NULL+DEFAULT) + 並び替えインデックス (全て要件・ヒアリング由来)
-- 🟡 黄信号: 0
-- 🔴 赤信号: 0
--
-- 品質評価: 高品質
