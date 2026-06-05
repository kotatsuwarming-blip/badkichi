-- ========================================
-- match-recording additive migration: 録画系 DELETE RLS ポリシー
-- ========================================
--
-- 関連設計: docs/design/match-recording/architecture.md「技術的制約」
-- 関連要件: docs/spec/match-recording/requirements.md REQ-406 / REQ-110a / REQ-110c / NFR-101
--
-- 方針:
-- - 既存 20260519060000_initial_schema.sql は **編集しない**。新規タイムスタンプ migration を追加
--   (match-management の name/match_date 追記と同じ additive パターン)。
-- - undo (REQ-110) を物理削除で行うため、録画系 3 テーブルに DELETE ポリシーを追加する。
--   現状 SELECT/INSERT/UPDATE のみで DELETE が無く、RLS 有効テーブルはポリシー不在=全 DELETE 拒否のため。
-- - 列追加・新規テーブルは無し。各 DELETE は既存 *_update と同一の FK 経由 is_member_of EXISTS を流用。
-- - 適用は CI 経由 (db:push、ローカル不可)。適用後 gen-types CI が supabase.ts を再生成
--   (列不変のため Row 型は不変だが再生成自体は走る)。memory: feedback_db_password_ci_only。
-- - recording_gaps は MVP 対象外 (REQ-409) のため DELETE ポリシーを追加しない。
-- - sets / set_player_positions は undo の物理削除対象外 (セット作成は同期・境界操作) のため触らない。

-- rallies: FK 経由 sets → matches。undo で空になった遅延生成 rally を物理削除 (REQ-110a)
CREATE POLICY "rallies_delete" ON rallies FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM sets JOIN matches ON matches.id = sets.match_id
    WHERE sets.id = rallies.set_id AND is_member_of(matches.group_id)
  ));

-- shots: FK 経由 rallies → sets → matches。undo で進行中ラリーの最後の shot を物理削除 (REQ-110a)
CREATE POLICY "shots_delete" ON shots FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM rallies JOIN sets ON sets.id = rallies.set_id
    JOIN matches ON matches.id = sets.match_id
    WHERE rallies.id = shots.rally_id AND is_member_of(matches.group_id)
  ));

-- position_overrides: FK 経由 rallies → sets → matches。undo で override 行を物理削除 (REQ-110c)
CREATE POLICY "po_delete" ON position_overrides FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM rallies JOIN sets ON sets.id = rallies.set_id
    JOIN matches ON matches.id = sets.match_id
    WHERE rallies.id = position_overrides.rally_id AND is_member_of(matches.group_id)
  ));
