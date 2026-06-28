-- ========================================
-- stats_rallies: ラリー開始時スコア + ラリー時間を出力に追加
-- ========================================
-- 背景: ユーザビリティテスト #01 (U-06)。ラリー一覧の再生候補に「何対何の場面か」
--       (ラリー開始時スコア) と「ラリー時間」(スタミナ分析) を出したい。
--
-- 方針:
--  - score_a / score_b = 当該ラリー開始時点の確定得点 (同一セット内・rally_number 昇順で
--    自分より前の is_point_confirmed かつ非レットのラリーを得点側別に積算)。
--    選手/役割フィルタの影響を受けないよう、得点はスコープ (試合/Group) 内の
--    全ラリーに対する WINDOW で先に算出し (CTE scored)、その後に選手/ペア/役割/
--    ラリー長の絞り込みを適用する。
--  - rally_duration_ms = ラリー内ショットの (最大 video_timestamp_ms - 最小)。
--    最初の打点から最後の打点までの経過 (近似)。ショットが 0/1 本 or 時刻 NULL なら NULL。
--
-- RETURNS TABLE を変更するため CREATE OR REPLACE 不可 → DROP してから再作成し GRANT を再付与する。

DROP FUNCTION IF EXISTS stats_rallies(uuid, uuid, uuid[], uuid, uuid, uuid, uuid, uuid, text, jsonb, int, int);

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

-- GRANT 再付与 (DROP で消えるため)
GRANT EXECUTE ON FUNCTION stats_rallies(uuid, uuid, uuid[], uuid, uuid, uuid, uuid, uuid, text, jsonb, int, int) TO authenticated;
