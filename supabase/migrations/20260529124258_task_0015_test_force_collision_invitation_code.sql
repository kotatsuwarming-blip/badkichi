-- TASK-0015: 招待コード衝突リトライ全敗テスト用 RPC (B 案、B4 確定方針 2026-05-13)
--
-- 用途: TC-15-07 (`invitation_code_collision_after_retry` 例外発火) を確実に再現する。
--   `generate_invitation_code` の本体は CSPRNG (`gen_random_uuid()`) を使うため
--   5 回連続 UNIQUE 衝突を確実に再現できない。本関数は `gen_random_uuid` 部分を
--   固定値 `'DEADBEEF'` に置換し、テスト側で事前に同コードを INSERT しておけば
--   5 回ループ全敗 → `invitation_code_collision_after_retry` 例外が必ず発火する。
--
-- セキュリティ: SECURITY DEFINER + `is_member_of()` チェック付き。生成されるコードは
--   常に `'DEADBEEF'` 固定 (= 既存テストシード行と必ず衝突) のため、prd で誤って
--   呼ばれても新規 INSERT は事前シードが無ければ 1 回目で成功するだけ。dev でのみ
--   意味を持つテストヘルパであり、本 migration は本番にも適用される点を許容する。
--
-- 参照:
--   docs/tasks/data-foundation/TASK-0015.md § 5 方針 B
--   docs/implements/data-foundation/TASK-0015/tdd-testcases.md TC-15-07

CREATE OR REPLACE FUNCTION test_force_collision_invitation_code(target_group_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fixed_code constant text := 'DEADBEEF';
  attempt int := 0;
  max_attempts constant int := 5;
BEGIN
  IF NOT is_member_of(target_group_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  LOOP
    attempt := attempt + 1;
    BEGIN
      INSERT INTO group_invitations (group_id, code, created_by, expires_at)
      VALUES (target_group_id, fixed_code, auth.uid(), now() + interval '7 days');
      RETURN fixed_code;
    EXCEPTION WHEN unique_violation THEN
      IF attempt >= max_attempts THEN
        RAISE EXCEPTION 'invitation_code_collision_after_retry';
      END IF;
    END;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION test_force_collision_invitation_code(uuid) IS
  'TASK-0015 TC-15-07 テスト専用: 固定コード DEADBEEF を使い 5 回連続 UNIQUE 衝突を再現する。';
