-- ========================================
-- stats-dashboard 読み取り専用 集計関数（RPC）
-- ========================================
--
-- 作成日: 2026-06-09
-- 関連設計: docs/design/stats-dashboard/database-schema.sql / api-endpoints.md
-- 関連要件: docs/spec/stats-dashboard/requirements.md (REQ-402 / REQ-408 / NFR-002)
-- 関連タスク: TASK-0003 (player_rates / pair_rates), TASK-0004 (rally_length / rallies)
--
-- 方針:
-- - 既存テーブルのスキーマは変更しない（additive: 関数 + GRANT のみ, REQ-402）。
-- - 適用は CI 経由 db:push（ローカル適用しない, REQ-408）。
-- - 全関数 SECURITY INVOKER + STABLE + SET search_path=public。RLS（rallies/sets/matches の
--   FK 経由 is_member_of）を継承するため他 Group は集計・返却されない（REQ-403 / NFR-101）。
-- - スコープ引数 p_match_id / p_group_id はいずれか一方のみ（両方 NULL/両方指定は invalid_scope）。
-- - 確定ラリー（得点率の集計対象, REQ-101）:
--     r.deleted_at IS NULL AND r.is_let = false AND r.is_point_confirmed = true AND r.point_winner IS NOT NULL
--   （sets/matches も deleted_at IS NULL）

-- ========================================
-- 1. stats_player_rates: 選手別 サービス/レシーブ 得点率（母数・分子） 🔵 REQ-003
-- ========================================
CREATE OR REPLACE FUNCTION stats_player_rates(
  p_match_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL
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
  ),
  serve AS (
    SELECT c.server_player_id AS pid,
           count(*) AS total,
           count(*) FILTER (WHERE c.point_winner = c.serving_team) AS won
    FROM confirmed c GROUP BY c.server_player_id
  ),
  receive AS (
    SELECT c.receiver_player_id AS pid,
           count(*) AS total,
           count(*) FILTER (WHERE c.point_winner <> c.serving_team) AS won
    FROM confirmed c GROUP BY c.receiver_player_id
  )
  SELECT
    COALESCE(sv.pid, rc.pid) AS player_id,
    COALESCE(sv.total, 0) AS serve_total,
    COALESCE(sv.won, 0) AS serve_won,
    COALESCE(rc.total, 0) AS receive_total,
    COALESCE(rc.won, 0) AS receive_won
  FROM serve sv
  FULL OUTER JOIN receive rc ON rc.pid = sv.pid;
END;
$$;

-- ========================================
-- 2. stats_pair_rates: ペア別 サービス/レシーブ 得点率 🔵 REQ-012
--    ペアは試合のチーム構成から無向 2 選手集合（LEAST/GREATEST 正規化）として導出。
--    A/B ラベルは serving 判定の内部利用のみ（出力は player_id の組）。
-- ========================================
CREATE OR REPLACE FUNCTION stats_pair_rates(
  p_match_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL
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
  ),
  serve AS (
    SELECT mp.p1, mp.p2,
           count(*) AS total,
           count(*) FILTER (WHERE c.point_winner = c.serving_team) AS won
    FROM confirmed c
    JOIN match_pairs mp ON mp.match_id = c.match_id AND mp.team = c.serving_team
    GROUP BY mp.p1, mp.p2
  ),
  receive AS (
    SELECT mp.p1, mp.p2,
           count(*) AS total,
           count(*) FILTER (WHERE c.point_winner <> c.serving_team) AS won
    FROM confirmed c
    JOIN match_pairs mp ON mp.match_id = c.match_id AND mp.team <> c.serving_team
    GROUP BY mp.p1, mp.p2
  )
  SELECT
    COALESCE(sv.p1, rc.p1) AS player1_id,
    COALESCE(sv.p2, rc.p2) AS player2_id,
    COALESCE(sv.total, 0) AS serve_total,
    COALESCE(sv.won, 0) AS serve_won,
    COALESCE(rc.total, 0) AS receive_total,
    COALESCE(rc.won, 0) AS receive_won
  FROM serve sv
  FULL OUTER JOIN receive rc ON rc.p1 = sv.p1 AND rc.p2 = sv.p2;
END;
$$;

-- ========================================
-- 3. stats_rally_length: ラリー長別 本数分布 + サーブ側勝数 🔵 REQ-005 / TASK-0004
--    shot_count = 0 は除外（EDGE-102）。勝率 = serve_won / rallies はクライアントで算出。
-- ========================================
CREATE OR REPLACE FUNCTION stats_rally_length(
  p_match_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL
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
  )
  SELECT c.sc AS shot_count,
         count(*) AS rallies,
         count(*) FILTER (WHERE c.point_winner = c.serving_team) AS serve_won
  FROM confirmed c
  WHERE c.sc > 0   -- 🔵 ショット0ラリーは長さ分析から除外（EDGE-102）
  GROUP BY c.sc
  ORDER BY c.sc;
END;
$$;

-- ========================================
-- 4. stats_rallies: ラリー行（テーブル / クロスフィルタ / 再生用） 🔵 REQ-006/007/010/104 / TASK-0004
--    全ライブラリー（レット・未確定含む）を返す（テーブルは履歴表示, REQ-006）。
--    フィルタ引数で 1 選手（player_id・role 連動）/ ペア（player_id の組・role 連動）/ ラリー長ビンを絞り込み。
--    チーム A/B はフィルタ軸にしない（serve/receive 判定の内部利用のみ, ヒアリング2026-06-09）。
--    再生のため試合の動画ソースを同梱（Group 横断のソース切替, REQ-104）。
-- ========================================
CREATE OR REPLACE FUNCTION stats_rallies(
  p_match_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_server_player_id uuid DEFAULT NULL,
  p_receiver_player_id uuid DEFAULT NULL,
  p_pair_player1_id uuid DEFAULT NULL,
  p_pair_player2_id uuid DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_shot_ranges jsonb DEFAULT NULL,
  p_limit int DEFAULT 200,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  rally_id uuid,
  match_id uuid,
  match_name text,
  set_number smallint,
  rally_number smallint,
  serving_team text,
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
    r.id,
    m.id,
    m.name,
    s.set_number,
    r.rally_number,
    r.serving_team,
    r.server_player_id,
    r.receiver_player_id,
    r.point_winner,
    r.is_let,
    r.is_point_confirmed,
    (SELECT count(*) FROM shots sh WHERE sh.rally_id = r.id AND sh.deleted_at IS NULL) AS shot_count,
    r.video_start_timestamp_ms,
    m.video_source_type,
    m.video_source_url
  FROM rallies r
  JOIN sets s ON s.id = r.set_id AND s.deleted_at IS NULL
  JOIN matches m ON m.id = s.match_id AND m.deleted_at IS NULL
  WHERE r.deleted_at IS NULL
    AND (p_match_id IS NULL OR m.id = p_match_id)
    AND (p_group_id IS NULL OR m.group_id = p_group_id)
    -- 🔵 1 選手絞り込み（player_id・role 連動）
    AND (p_server_player_id IS NULL OR (p_role IS DISTINCT FROM 'receive' AND r.server_player_id = p_server_player_id))
    AND (p_receiver_player_id IS NULL OR (p_role IS DISTINCT FROM 'serve' AND r.receiver_player_id = p_receiver_player_id))
    -- 🔵 ラリー長: 選択ビンの和集合（OR）
    AND (
      p_shot_ranges IS NULL OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_shot_ranges) e
        WHERE (SELECT count(*) FROM shots sh WHERE sh.rally_id = r.id AND sh.deleted_at IS NULL)
              BETWEEN (e->>'min')::int AND COALESCE((e->>'max')::int, 2147483647)
      )
    )
    -- 🔵 ペア絞り込み（役割連動）
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
  LIMIT GREATEST(0, LEAST(COALESCE(p_limit, 200), 1000))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
END;
$$;

-- ========================================
-- GRANT（authenticated ロールにのみ実行権限）
-- ========================================
GRANT EXECUTE ON FUNCTION stats_player_rates(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION stats_pair_rates(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION stats_rally_length(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION stats_rallies(uuid, uuid, uuid, uuid, uuid, uuid, text, jsonb, int, int) TO authenticated;
