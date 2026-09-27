-- ========================================
-- stats-dashboard 集計関数にセットフィルタ（p_set_number）を追加
-- ========================================
--
-- 作成日: 2026-08-08
-- 関連: グローバルフィルタ再編（選手別/ペア別・選手選択・セットを全タブ共通の階層に統一）。
-- shot-stats 系 RPC は p_set_number 対応済みのため、stats-dashboard 系 4 関数にも同じ
-- 追加パラメータを足して全タブでセット絞り込みを可能にする。
--
-- 変更点（additive な新規 migration。既存ファイルは改変しない）:
-- - stats_player_rates / stats_pair_rates / stats_rally_length / stats_rallies に
--   p_set_number int DEFAULT NULL を追加（NULL = 全セット。既存呼び出しは無変更で動作）。
-- - 署名変更を伴うため DROP してから CREATE する。SECURITY INVOKER + STABLE + search_path は踏襲。
--
-- 適用は CI 経由 db:push（ローカル不可）。

-- 既存関数を一旦削除（署名変更のため）
DROP FUNCTION IF EXISTS stats_player_rates(uuid, uuid, uuid[]);
DROP FUNCTION IF EXISTS stats_pair_rates(uuid, uuid, uuid[]);
DROP FUNCTION IF EXISTS stats_rally_length(uuid, uuid, uuid[]);
DROP FUNCTION IF EXISTS stats_rallies(uuid, uuid, uuid[], uuid, uuid, uuid, uuid, uuid, text, jsonb, int, int);

-- ========================================
-- 1. stats_player_rates（+ p_set_number）
-- ========================================
CREATE OR REPLACE FUNCTION stats_player_rates(
  p_match_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_match_ids uuid[] DEFAULT NULL,
  p_set_number int DEFAULT NULL
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
      AND (p_set_number IS NULL OR s.set_number = p_set_number)
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
-- 2. stats_pair_rates（+ p_set_number）
-- ========================================
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

-- ========================================
-- 3. stats_rally_length（+ p_set_number）
-- ========================================
CREATE OR REPLACE FUNCTION stats_rally_length(
  p_match_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_match_ids uuid[] DEFAULT NULL,
  p_set_number int DEFAULT NULL
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
      AND (p_set_number IS NULL OR s.set_number = p_set_number)
  )
  SELECT c.sc, count(*), count(*) FILTER (WHERE c.point_winner = c.serving_team)
  FROM confirmed c WHERE c.sc > 0 GROUP BY c.sc ORDER BY c.sc;
END;
$$;

-- ========================================
-- 4. stats_rallies（+ p_set_number。ベースは 20260628 の score/duration 付き定義）
-- ========================================
CREATE FUNCTION stats_rallies(
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
  p_offset int DEFAULT 0,
  p_set_number int DEFAULT NULL
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
  video_source_url text,
  score_a smallint,
  score_b smallint,
  rally_duration_ms integer
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
  -- スコープ (試合/Group) 内の全ラリーに対し、ラリー開始時スコアを先に算出する。
  -- 選手/役割/ラリー長フィルタはこの後 (外側) で適用し、スコアの連番性を壊さない。
  -- セット絞りはセット単位の除外のため CTE 内で適用してよい (score の PARTITION は set_id 単位)。
  WITH scored AS (
    SELECT
      r.id            AS rally_id,
      m.id            AS match_id,
      m.name          AS match_name,
      m.match_date    AS match_date,
      m.created_at    AS match_created_at,
      m.video_source_type AS video_source_type,
      m.video_source_url  AS video_source_url,
      s.set_number    AS set_number,
      r.rally_number  AS rally_number,
      r.serving_team  AS serving_team,
      r.server_position AS server_position,
      r.server_player_id   AS server_player_id,
      r.receiver_player_id AS receiver_player_id,
      r.point_winner  AS point_winner,
      r.is_let        AS is_let,
      r.is_point_confirmed AS is_point_confirmed,
      r.video_start_timestamp_ms AS video_start_timestamp_ms,
      COALESCE(SUM(CASE WHEN r.is_point_confirmed AND NOT r.is_let AND r.point_winner = 'A' THEN 1 ELSE 0 END)
        OVER (PARTITION BY r.set_id ORDER BY r.rally_number ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0)::smallint AS score_a,
      COALESCE(SUM(CASE WHEN r.is_point_confirmed AND NOT r.is_let AND r.point_winner = 'B' THEN 1 ELSE 0 END)
        OVER (PARTITION BY r.set_id ORDER BY r.rally_number ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0)::smallint AS score_b
    FROM rallies r
    JOIN sets s ON s.id = r.set_id AND s.deleted_at IS NULL
    JOIN matches m ON m.id = s.match_id AND m.deleted_at IS NULL
    WHERE r.deleted_at IS NULL
      AND (p_match_id IS NULL OR m.id = p_match_id)
      AND (p_group_id IS NULL OR m.group_id = p_group_id)
      AND (p_match_ids IS NULL OR m.id = ANY(p_match_ids))
      AND (p_set_number IS NULL OR s.set_number = p_set_number)
  )
  SELECT
    r.rally_id, r.match_id, r.match_name, r.match_date, r.set_number, r.rally_number,
    r.serving_team, r.server_position, r.server_player_id, r.receiver_player_id,
    r.point_winner, r.is_let, r.is_point_confirmed,
    (SELECT count(*) FROM shots sh WHERE sh.rally_id = r.rally_id AND sh.deleted_at IS NULL) AS shot_count,
    r.video_start_timestamp_ms, r.video_source_type, r.video_source_url,
    r.score_a, r.score_b,
    (SELECT (max(sh.video_timestamp_ms) - min(sh.video_timestamp_ms))::integer
       FROM shots sh
       WHERE sh.rally_id = r.rally_id AND sh.deleted_at IS NULL AND sh.video_timestamp_ms IS NOT NULL) AS rally_duration_ms
  FROM scored r
  WHERE TRUE
    -- 関与選手 (server または receiver) 絞り (グローバル選手フィルタ用)
    AND (p_player_id IS NULL OR r.server_player_id = p_player_id OR r.receiver_player_id = p_player_id)
    -- 1 選手 role 連動絞り
    AND (p_server_player_id IS NULL OR (p_role IS DISTINCT FROM 'receive' AND r.server_player_id = p_server_player_id))
    AND (p_receiver_player_id IS NULL OR (p_role IS DISTINCT FROM 'serve' AND r.receiver_player_id = p_receiver_player_id))
    -- ラリー長ビン和集合
    AND (
      p_shot_ranges IS NULL OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_shot_ranges) e
        WHERE (SELECT count(*) FROM shots sh WHERE sh.rally_id = r.rally_id AND sh.deleted_at IS NULL)
              BETWEEN (e->>'min')::int AND COALESCE((e->>'max')::int, 2147483647)
      )
    )
    -- ペア role 連動絞り
    AND (
      p_pair_player1_id IS NULL OR p_pair_player2_id IS NULL OR EXISTS (
        SELECT 1 FROM matches mm WHERE mm.id = r.match_id AND (
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
  ORDER BY r.match_date DESC NULLS LAST, r.match_created_at DESC, r.set_number, r.rally_number
  LIMIT GREATEST(0, LEAST(COALESCE(p_limit, 500), 2000))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
END;
$$;

-- ========================================
-- GRANT（再付与: authenticated ロールにのみ実行権限）
-- ========================================
GRANT EXECUTE ON FUNCTION stats_player_rates(uuid, uuid, uuid[], int) TO authenticated;
GRANT EXECUTE ON FUNCTION stats_pair_rates(uuid, uuid, uuid[], int) TO authenticated;
GRANT EXECUTE ON FUNCTION stats_rally_length(uuid, uuid, uuid[], int) TO authenticated;
GRANT EXECUTE ON FUNCTION stats_rallies(uuid, uuid, uuid[], uuid, uuid, uuid, uuid, uuid, text, jsonb, int, int, int) TO authenticated;
