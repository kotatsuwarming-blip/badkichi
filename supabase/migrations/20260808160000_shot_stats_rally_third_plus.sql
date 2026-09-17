-- ========================================
-- shot-stats: 配球ヒートマップを3打目以降に限定 + レシーブ種別分析を追加（2026-08-08 #5）
-- ========================================
--
-- ユーザ指定: サーブ（1打目）はサーブ種別チャートで既出、サーブレシーブ（2打目）も
-- 同様に専用チャートで出す。したがって配球ヒートマップ（stats_shot_placement）は
-- **3打目以降のラリーショットのみ**を対象にする。
--
-- 1. stats_shot_placement: rn >= 3 フィルタを追加（他は 20260808150000 と同一）
-- 2. stats_serve_types と対になる stats_receive_types を追加
--    （レシーバー = rallies.receiver_player_id、種別 = 2打目の注釈、
--     won = レシーブ側チームの得点。2打目ショット行が無いラリー = レシーブ不発生は除外）

CREATE OR REPLACE FUNCTION stats_shot_placement(
  p_match_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_match_ids uuid[] DEFAULT NULL,
  p_set_number smallint DEFAULT NULL,
  p_hand text DEFAULT NULL,
  p_zones int DEFAULT 3
)
RETURNS TABLE (
  hit_player_id uuid,
  shot_type text,
  origin_row int,
  origin_col int,
  dest_kind text,
  dest_out text,
  dest_row int,
  dest_col int,
  shots bigint
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
  WITH scoped AS (
    SELECT r.id AS rally_id, r.land_x AS lx, r.land_y AS ly,
           r.end_reason AS ereason, r.camera_near_team AS cam,
           m.team_a_player1_id AS a1, m.team_a_player2_id AS a2,
           m.team_b_player1_id AS b1, m.team_b_player2_id AS b2
    FROM rallies r
    JOIN sets s ON s.id = r.set_id AND s.deleted_at IS NULL
    JOIN matches m ON m.id = s.match_id AND m.deleted_at IS NULL
    WHERE r.deleted_at IS NULL
      AND r.is_let = false
      AND r.is_point_confirmed = true
      AND r.point_winner IS NOT NULL
      AND r.camera_near_team IS NOT NULL
      AND (p_match_id IS NULL OR m.id = p_match_id)
      AND (p_group_id IS NULL OR m.group_id = p_group_id)
      AND (p_match_ids IS NULL OR m.id = ANY(p_match_ids))
      AND (p_set_number IS NULL OR s.set_number = p_set_number)
  ),
  seq AS (
    SELECT sh.rally_id, sh.hit_player_id AS pid, sh.shot_type AS stype, sh.hand AS shand,
      sh.hit_x AS ox, sh.hit_y AS oy,
      lead(sh.hit_x) OVER w AS nx, lead(sh.hit_y) OVER w AS ny,
      row_number() OVER w AS rn,
      count(*) OVER (PARTITION BY sh.rally_id) AS sc_total,
      sc.lx, sc.ly, sc.ereason, sc.cam,
      CASE WHEN sh.hit_player_id IN (sc.a1, sc.a2) THEN 'A'
           WHEN sh.hit_player_id IN (sc.b1, sc.b2) THEN 'B'
           ELSE NULL END AS hitter_team
    FROM shots sh
    JOIN scoped sc ON sc.rally_id = sh.rally_id
    WHERE sh.deleted_at IS NULL
    WINDOW w AS (PARTITION BY sh.rally_id ORDER BY sh.shot_number)
  ),
  raw_pairs AS (
    SELECT q.pid, q.stype, q.shand, q.cam, q.hitter_team,
      q.ox, q.oy,
      (q.rn = q.sc_total) AS is_last,
      q.ereason,
      COALESCE(q.nx, CASE WHEN q.rn = q.sc_total THEN q.lx END) AS dx,
      COALESCE(q.ny, CASE WHEN q.rn = q.sc_total THEN q.ly END) AS dy
    FROM seq q
    WHERE q.rn >= 3 -- サーブ・レシーブは専用チャートで表示するため 3 打目以降のみ（#5）
      AND q.ox IS NOT NULL AND q.oy IS NOT NULL
      AND q.pid IS NOT NULL
      AND q.hitter_team IS NOT NULL
      AND (p_hand IS NULL OR q.shand = p_hand)
  ),
  pairs AS (
    SELECT rp.pid, rp.stype, rp.is_last, rp.ereason,
      CASE WHEN rp.hitter_team = rp.cam THEN rp.ox ELSE 1.0 - rp.ox END AS mox,
      CASE WHEN rp.hitter_team = rp.cam THEN 1.0 - rp.oy ELSE rp.oy END AS moy,
      CASE WHEN rp.hitter_team = rp.cam THEN rp.dx ELSE 1.0 - rp.dx END AS mdx,
      CASE WHEN rp.hitter_team = rp.cam THEN 1.0 - rp.dy ELSE rp.dy END AS mdy
    FROM raw_pairs rp
  ),
  classified AS (
    SELECT pr.pid, pr.stype, pr.mox, pr.moy,
      CASE
        WHEN pr.is_last AND pr.ereason IN ('net', 'not_over') THEN 'net'
        WHEN pr.mdx IS NULL OR pr.mdy IS NULL THEN NULL
        WHEN pr.is_last AND pr.ereason = 'floor'
             AND (pr.mdx < 0 OR pr.mdx > 1 OR pr.mdy < 0 OR pr.mdy > 1) THEN 'out'
        ELSE 'in'
      END AS dkind,
      CASE
        WHEN pr.is_last AND pr.ereason = 'floor' AND pr.mdx < 0 THEN 'left'
        WHEN pr.is_last AND pr.ereason = 'floor' AND pr.mdx > 1 THEN 'right'
        WHEN pr.is_last AND pr.ereason = 'floor' AND (pr.mdy < 0 OR pr.mdy > 1) THEN 'back'
        ELSE NULL
      END AS dout,
      pr.mdx, pr.mdy
    FROM pairs pr
  )
  SELECT
    c.pid,
    c.stype,
    LEAST(p_zones - 1, GREATEST(0, floor(LEAST(1.0, GREATEST(0.0, c.moy)) * p_zones * 2)::int)),
    LEAST(p_zones - 1, GREATEST(0, floor(LEAST(1.0, GREATEST(0.0, c.mox)) * p_zones)::int)),
    c.dkind,
    CASE WHEN c.dkind = 'out' THEN c.dout ELSE NULL END,
    CASE WHEN c.dkind = 'in'
         THEN LEAST(p_zones - 1, GREATEST(0, floor(LEAST(1.0, GREATEST(0.0, c.mdy)) * p_zones * 2)::int - p_zones))
         ELSE NULL END,
    CASE WHEN c.dkind = 'in'
         THEN LEAST(p_zones - 1, GREATEST(0, floor(LEAST(1.0, GREATEST(0.0, c.mdx)) * p_zones)::int))
         ELSE NULL END,
    count(*) AS shots
  FROM classified c
  WHERE c.dkind IS NOT NULL
  GROUP BY 1, 2, 3, 4, 5, 6, 7, 8;
END;
$$;

-- ========================================
-- stats_receive_types: サーブレシーブ（2打目）種別 × 得点率（#5）
-- ========================================
CREATE OR REPLACE FUNCTION stats_receive_types(
  p_match_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_match_ids uuid[] DEFAULT NULL,
  p_set_number smallint DEFAULT NULL
)
RETURNS TABLE (
  receiver_player_id uuid,
  shot_type text,        -- 2 打目の注釈（NULL = 未注釈）
  server_position text,  -- 当該ラリーのサーブ位置（右 = 偶数点 / 左 = 奇数点）
  total bigint,
  won bigint             -- レシーブ側チームが当該ラリーを取った数
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
  WITH scoped AS (
    SELECT r.id AS rid, r.receiver_player_id AS rpid, r.server_position AS spos,
           r.serving_team, r.point_winner
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
  secondshot AS (
    SELECT t.rally_id, t.stype
    FROM (
      SELECT sh.rally_id, sh.shot_type AS stype,
             row_number() OVER (PARTITION BY sh.rally_id ORDER BY sh.shot_number) AS rn
      FROM shots sh
      WHERE sh.deleted_at IS NULL
        AND sh.rally_id IN (SELECT sc2.rid FROM scoped sc2)
    ) t
    WHERE t.rn = 2
  )
  -- レシーブが発生したラリーのみ（2 打目ショット行があるもの。サーブフォルト等は除外）
  SELECT
    sc.rpid,
    s2.stype,
    sc.spos,
    count(*) AS total,
    count(*) FILTER (WHERE sc.point_winner <> sc.serving_team) AS won
  FROM scoped sc
  JOIN secondshot s2 ON s2.rally_id = sc.rid
  GROUP BY sc.rpid, s2.stype, sc.spos;
END;
$$;

GRANT EXECUTE ON FUNCTION stats_receive_types(uuid, uuid, uuid[], smallint) TO authenticated;
