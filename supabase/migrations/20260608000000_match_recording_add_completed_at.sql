-- ========================================
-- match-recording additive migration: matches.completed_at
-- ========================================
--
-- 関連: 手動検証フィードバック (1セットでも「完了」にできるようにしたい)
--
-- 方針:
-- - 試合の「完了」をユーザーが明示的に確定できるよう、matches に completed_at を追加する。
--   NULL = 未完了 / 値あり = 完了。2セット先取の導出ではなく明示フラグで判定する。
-- - additive (列追加のみ)。既存 migration は編集しない。適用は CI (db:push、ローカル不可)。
-- - 更新は既存 matches_update RLS (is_member_of) に従う。新規ポリシー不要。

ALTER TABLE matches ADD COLUMN completed_at timestamptz;
