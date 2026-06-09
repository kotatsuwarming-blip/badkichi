-- ========================================
-- stats-dashboard 集計関数 拡張（グローバルフィルタ・ポジション）
-- ========================================
--
-- 作成日: 2026-06-09
-- 関連: 受け入れ追加要件（グローバルフィルタ: 選手/ペア・試合期間 / サービスポジション・役割ドリルダウン）
-- 関連設計: docs/design/stats-dashboard/database-schema.sql
--
-- 変更点（additive な新規 migration。既存ファイルは改変しない）:
-- - 全集計関数に p_match_ids uuid[]（対象試合の限定＝期間/個別選択をクライアントで解決して渡す）を追加。
-- - stats_rallies に server_position 出力（偶数=右/奇数=左のポジション・ドリルダウン用）と
--   p_player_id（その選手が server or receiver として関与した全ラリー）を追加。
-- - 署名変更を伴うため DROP してから CREATE する。SECURITY INVOKER + STABLE + search_path は踏襲。
--
-- 適用は CI 経由 db:push（ローカル不可）。

-- 既存関数を一旦削除（署名変更のため）
DROP FUNCTION IF EXISTS stats_player_rates(uuid, uuid);
DROP FUNCTION IF EXISTS stats_pair_rates(uuid, uuid);
DROP FUNCTION IF EXISTS stats_rally_length(uuid, uuid);
DROP FUNCTION IF EXISTS stats_rallies(uuid, uuid, uuid, uuid, uuid, uuid, text, jsonb, int, int);

-- ========================================
-- 1. stats_player_rates（+ p_match_ids 期間/個別絞り）
-- ========================================
CREATE OR REPLACE FUNCTION stats_player_rates(
  p_match_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_match_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  player_id uuid,
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
  WITH confirmed AS (
    SELECT r.serving_team, r.server_player_id, r.receiver_player_id, r.point_winner
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
  ),
  serve AS (
    SELECT c.server_player_id AS pid, count(*) AS total,
           count(*) FILTER (WHERE c.point_winner = c.serving_team) AS won
    FROM confirmed c GROUP BY c.server_player_id
  ),
  receive AS (
    SELECT c.receiver_player_id AS pid, count(*) AS total,
           count(*) FILTER (WHERE c.point_winner <> c.serving_team) AS won
    FROM confirmed c GROUP BY c.receiver_player_id
  )
  SELECT COALESCE(sv.pid, rc.pid), COALESCE(sv.total, 0), COALESCE(sv.won, 0),
         COALESCE(rc.total, 0), COALESCE(rc.won, 0)
  FROM serve sv FULL OUTER JOIN receive rc ON rc.pid = sv.pid;
END;
$$;

-- ========================================
-- 2. stats_pair_rates（+ p_match_ids）
-- ========================================
CREATE OR REPLACE FUNCTION stats_pair_rates(
  p_match_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_match_ids uuid[] DEFAULT NULL
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
    FROM matches m WHERE m.deleted_at IS NULL
    UNION ALL
    SELECT m.id, 'B'::text,
           LEAST(m.team_b_player1_id, m.team_b_player2_id),
           GREATEST(m.team_b_player1_id, m.team_b_player2_id)
    FROM matches m WHERE m.deleted_at IS NULL
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

-- ========================================
-- 3. stats_rally_length（+ p_match_ids）
-- ========================================
CREATE OR REPLACE FUNCTION stats_rally_length(
  p_match_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_match_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  shot_count bigint,
  rallies bigint,
  serve_won bigint
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
  WITH confirmed AS (
    SELECT r.id, r.serving_team, r.point_winner,
           (SELECT count(*) FROM shots sh WHERE sh.rally_id = r.id AND sh.deleted_at IS NULL) AS sc
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
  )
  SELECT c.sc, count(*), count(*) FILTER (WHERE c.point_winner = c.serving_team)
  FROM confirmed c WHERE c.sc > 0 GROUP BY c.sc ORDER BY c.sc;
END;
$$;

-- ========================================
-- 4. stats_rallies（+ server_position 出力 / + p_match_ids / + p_player_id 関与絞り）
-- ========================================
CREATE OR REPLACE FUNCTION stats_rallies(
  p_match_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_match_ids uuid[] DEFAULT NULL,
  p_player_id uuid DEFAULT NULL,
  p_server_player_id uuid DEFAULT NULL,
  p_receiver_player_id uuid DEFAULT NULL,
  p_pair_player1_id uuid DEFAULT NULL,
  p_pair_player2_id uuid DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_shot_ranges jsonb DEFAULT NULL,
  p_limit int DEFAULT 500,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  rally_id uuid,
  match_id uuid,
  match_name text,
  match_date date,
  set_number smallint,
  rally_number smallint,
  serving_team text,
  server_position text,
  server_player_id uuid,
  receiver_player_id uuid,
  point_winner text,
  is_let boolean,
  is_point_confirmed boolean,
  shot_count bigint,
  video_start_timestamp_ms integer,
  video_source_type text,
  video_source_url text
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
  SELECT
    r.id, m.id, m.name, m.match_date, s.set_number, r.rally_number,
    r.serving_team, r.server_position, r.server_player_id, r.receiver_player_id,
    r.point_winner, r.is_let, r.is_point_confirmed,
    (SELECT count(*) FROM shots sh WHERE sh.rally_id = r.id AND sh.deleted_at IS NULL) AS shot_count,
    r.video_start_timestamp_ms, m.video_source_type, m.video_source_url
  FROM rallies r
  JOIN sets s ON s.id = r.set_id AND s.deleted_at IS NULL
  JOIN matches m ON m.id = s.match_id AND m.deleted_at IS NULL
  WHERE r.deleted_at IS NULL
    AND (p_match_id IS NULL OR m.id = p_match_id)
    AND (p_group_id IS NULL OR m.group_id = p_group_id)
    AND (p_match_ids IS NULL OR m.id = ANY(p_match_ids))
    -- 関与選手（server または receiver）絞り（グローバル選手フィルタ用）
    AND (p_player_id IS NULL OR r.server_player_id = p_player_id OR r.receiver_player_id = p_player_id)
    -- 1 選手 role 連動絞り
    AND (p_server_player_id IS NULL OR (p_role IS DISTINCT FROM 'receive' AND r.server_player_id = p_server_player_id))
    AND (p_receiver_player_id IS NULL OR (p_role IS DISTINCT FROM 'serve' AND r.receiver_player_id = p_receiver_player_id))
    -- ラリー長ビン和集合
    AND (
      p_shot_ranges IS NULL OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_shot_ranges) e
        WHERE (SELECT count(*) FROM shots sh WHERE sh.rally_id = r.id AND sh.deleted_at IS NULL)
              BETWEEN (e->>'min')::int AND COALESCE((e->>'max')::int, 2147483647)
      )
    )
    -- ペア role 連動絞り
    AND (
      p_pair_player1_id IS NULL OR p_pair_player2_id IS NULL OR EXISTS (
        SELECT 1 FROM matches mm WHERE mm.id = m.id AND (
          ((p_role IS DISTINCT FROM 'receive') AND (
            (r.serving_team = 'A'
              AND LEAST(mm.team_a_player1_id, mm.team_a_player2_id) = LEAST(p_pair_player1_id, p_pair_player2_id)
              AND GREATEST(mm.team_a_player1_id, mm.team_a_player2_id) = GREATEST(p_pair_player1_id, p_pair_player2_id))
            OR (r.serving_team = 'B'
              AND LEAST(mm.team_b_player1_id, mm.team_b_player2_id) = LEAST(p_pair_player1_id, p_pair_player2_id)
              AND GREATEST(mm.team_b_player1_id, mm.team_b_player2_id) = GREATEST(p_pair_player1_id, p_pair_player2_id))
          ))
          OR
          ((p_role IS DISTINCT FROM 'serve') AND (
            (r.serving_team = 'B'
              AND LEAST(mm.team_a_player1_id, mm.team_a_player2_id) = LEAST(p_pair_player1_id, p_pair_player2_id)
              AND GREATEST(mm.team_a_player1_id, mm.team_a_player2_id) = GREATEST(p_pair_player1_id, p_pair_player2_id))
            OR (r.serving_team = 'A'
              AND LEAST(mm.team_b_player1_id, mm.team_b_player2_id) = LEAST(p_pair_player1_id, p_pair_player2_id)
              AND GREATEST(mm.team_b_player1_id, mm.team_b_player2_id) = GREATEST(p_pair_player1_id, p_pair_player2_id))
          ))
        )
      )
    )
  ORDER BY m.match_date DESC NULLS LAST, m.created_at DESC, s.set_number, r.rally_number
  LIMIT GREATEST(0, LEAST(COALESCE(p_limit, 500), 2000))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
END;
$$;

-- ========================================
-- GRANT（再付与）
-- ========================================
GRANT EXECUTE ON FUNCTION stats_player_rates(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION stats_pair_rates(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION stats_rally_length(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION stats_rallies(uuid, uuid, uuid[], uuid, uuid, uuid, uuid, uuid, text, jsonb, int, int) TO authenticated;
