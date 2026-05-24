-- ADR-006: 1 ユーザー = 1 Group 制約 (MVP)
--
-- 既存 migration `20260519060000_initial_schema.sql` は NFR-302 により変更禁止のため、
-- 本ファイルで構造的制約 (UNIQUE) と RPC 早期失敗ガードを追加する。
--
-- 参照:
--   docs/decisions/006-single-group-per-user-mvp.md
--   docs/tasks/data-foundation/TASK-0018.md

-- 1. group_members に UNIQUE (user_id) 制約を追加
--    既存の UNIQUE (group_id, user_id) は同一 Group 内の重複防止 (EDGE-002)
--    本制約は別 Group も含めた「ユーザは 1 Group のみ所属可能」を構造的に保証する。
ALTER TABLE group_members
  ADD CONSTRAINT group_members_user_id_unique UNIQUE (user_id);

-- 2. join_group_with_code を CREATE OR REPLACE で再定義し、冒頭に既所属チェックを追加
--    UNIQUE 違反 (PG 23505) を待つのではなく、識別可能な例外で早期失敗させる
--    (ADR-006 §決定 §RPC ガード)
CREATE OR REPLACE FUNCTION join_group_with_code(invite_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invitation_record record;
  target_group_id uuid;
BEGIN
  -- ADR-006: 既所属チェック (構造的 UNIQUE 制約と二重ガード、識別可能例外で早期失敗)
  IF EXISTS (
    SELECT 1 FROM group_members WHERE user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'already_in_group';
  END IF;

  SELECT * INTO invitation_record
  FROM group_invitations
  WHERE code = invite_code AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_found';
  END IF;

  IF invitation_record.expires_at < now() THEN
    RAISE EXCEPTION 'invitation_expired';
  END IF;

  target_group_id := invitation_record.group_id;

  INSERT INTO group_members (group_id, user_id)
  VALUES (target_group_id, auth.uid());

  RETURN target_group_id;
END;
$$;
