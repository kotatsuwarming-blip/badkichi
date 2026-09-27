-- ========================================
-- singles-support: matches.match_type 追加 + player2 列の NULL 許容
-- ========================================
--
-- 作成日: 2026-08-28
-- 関連: docs/spec/singles-support/note.md / rule-engine NFR-201 (チーム人数をハードコードしない)
--
-- 方針:
--   - シングルスは「各チーム 1 選手」。matches.team_*_player2_id を NULL にして表現する。
--   - match_type で形式を明示 (既存行は全て 'doubles')。
--   - set_player_positions はシングルスでは 1 チーム 1 行 (position='right')。
--     クライアント (rule-engine createInitialState) が空いた left スロットを同一選手で埋めるため、
--     サーブ位置の偶奇規則 (右=偶数/左=奇数) はダブルスのエンジンをそのまま流用できる。
--   - stats_pair_rates はペアが存在しない (player2 NULL) 試合を除外する。
--     LEAST/GREATEST は NULL を無視するため、除外しないと (p1,p1) の偽ペアが生成される。

-- ---------- matches ----------
ALTER TABLE matches
  ADD COLUMN match_type text NOT NULL DEFAULT 'doubles'
    CHECK (match_type IN ('singles', 'doubles'));

ALTER TABLE matches
  ALTER COLUMN team_a_player2_id DROP NOT NULL,
  ALTER COLUMN team_b_player2_id DROP NOT NULL;

-- 形式と player2 列の整合: singles → 両方 NULL / doubles → 両方 NOT NULL
ALTER TABLE matches
  ADD CONSTRAINT matches_match_type_players_check CHECK (
    (match_type = 'singles' AND team_a_player2_id IS NULL AND team_b_player2_id IS NULL)
    OR
    (match_type = 'doubles' AND team_a_player2_id IS NOT NULL AND team_b_player2_id IS NOT NULL)
  );

-- 全員別人 (NULL 対応版)。旧 6-way 不等号は NULL が混ざると CHECK 全体が NULL (=通過) になり
-- a1=b1 を検出できなくなるため、NULL 列を明示的に除いて再定義する。
ALTER TABLE matches DROP CONSTRAINT matches_players_distinct_check;
ALTER TABLE matches
  ADD CONSTRAINT matches_players_distinct_check CHECK (
    team_a_player1_id <> team_b_player1_id
    AND (team_a_player2_id IS NULL
         OR (team_a_player2_id <> team_a_player1_id AND team_a_player2_id <> team_b_player1_id))
    AND (team_b_player2_id IS NULL
         OR (team_b_player2_id <> team_a_player1_id AND team_b_player2_id <> team_b_player1_id))
    AND (team_a_player2_id IS NULL OR team_b_player2_id IS NULL
         OR team_a_player2_id <> team_b_player2_id)
  );

-- ---------- stats_pair_rates: シングルス試合を除外 ----------
CREATE OR REPLACE FUNCTION stats_pair_rates(
  p_match_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_match_ids uuid[] DEFAULT NULL,
  p_set_number int DEFAULT NULL
)
RETURNS TABLE (
  player1_id uuid,
  player2_id uuid,
  serve_total bigint,
  serve_won bigint,
  receive_total bigint,
  receive_won bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
BEGIN
  IF (p_match_id IS NULL) = (p_group_id IS NULL) THEN
    RAISE EXCEPTION 'invalid_scope';
  END IF;

  RETURN QUERY
  WITH match_pairs AS (
    SELECT m.id AS match_id, 'A'::text AS team,
           LEAST(m.team_a_player1_id, m.team_a_player2_id) AS p1,
           GREATEST(m.team_a_player1_id, m.team_a_player2_id) AS p2
    FROM matches m
    WHERE m.deleted_at IS NULL AND m.team_a_player2_id IS NOT NULL
    UNION ALL
    SELECT m.id, 'B'::text,
           LEAST(m.team_b_player1_id, m.team_b_player2_id),
           GREATEST(m.team_b_player1_id, m.team_b_player2_id)
    FROM matches m
    WHERE m.deleted_at IS NULL AND m.team_b_player2_id IS NOT NULL
  ),
  confirmed AS (
    SELECT s.match_id, r.serving_team, r.point_winner
    FROM rallies r
    JOIN sets s ON s.id = r.set_id AND s.deleted_at IS NULL
    JOIN matches m ON m.id = s.match_id AND m.deleted_at IS NULL
    WHERE r.deleted_at IS NULL
      AND r.is_let = false
      AND r.is_point_confirmed = true
      AND r.point_winner IS NOT NULL
      AND (p_match_id IS NULL OR m.id = p_match_id)
      AND (p_group_id IS NULL OR m.group_id = p_group_id)
      AND (p_match_ids IS NULL OR m.id = ANY(p_match_ids))
      AND (p_set_number IS NULL OR s.set_number = p_set_number)
  ),
  serve AS (
    SELECT mp.p1, mp.p2, count(*) AS total,
           count(*) FILTER (WHERE c.point_winner = c.serving_team) AS won
    FROM confirmed c JOIN match_pairs mp ON mp.match_id = c.match_id AND mp.team = c.serving_team
    GROUP BY mp.p1, mp.p2
  ),
  receive AS (
    SELECT mp.p1, mp.p2, count(*) AS total,
           count(*) FILTER (WHERE c.point_winner <> c.serving_team) AS won
    FROM confirmed c JOIN match_pairs mp ON mp.match_id = c.match_id AND mp.team <> c.serving_team
    GROUP BY mp.p1, mp.p2
  )
  SELECT COALESCE(sv.p1, rc.p1), COALESCE(sv.p2, rc.p2), COALESCE(sv.total, 0), COALESCE(sv.won, 0),
         COALESCE(rc.total, 0), COALESCE(rc.won, 0)
  FROM serve sv FULL OUTER JOIN receive rc ON rc.p1 = sv.p1 AND rc.p2 = sv.p2;
END;
$$;
