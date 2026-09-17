-- ========================================
-- shot-stats: 選手視点変換の左右反転を修正（2026-08-08 フィードバック #3）
-- ========================================
--
-- 【症状】左前から打った本数が実態より少ない（左右のマスが入れ替わっていた）。
--
-- 【原因】前回 migration (20260808130000) は「打者 = カメラ手前チームのとき 180° 反転
-- （x→1−x, y→1−y）」としたが、選手視点（自陣が手前・画面左 = 選手の左）への正しい変換は:
--   - 打者 = カメラ手前: カメラ映像がそのまま選手視点 → 前後（y）のみ正規化、左右（x）はそのまま
--     （y_raw=1 = 自陣バック → 正規化 y=0 = 自陣バック にするため y→1−y）
--   - 打者 = カメラ奥: コートを 180° 回して見る → 左右（x）のみ反転（x→1−x）、
--     前後は raw のまま（y_raw=0 = 自陣バック = 正規化 0 ✓）
-- つまり両ケースで x の扱いが逆だった。
--
-- 正規化後の座標系: y=0 = 打者の自陣バック / y=0.5 = ネット / x=0 = 打者から見て左。

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
           r.camera_near_team AS cam,
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
      sc.lx, sc.ly, sc.cam,
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
      COALESCE(q.nx, CASE WHEN q.rn = q.sc_total THEN q.lx END) AS dx,
      COALESCE(q.ny, CASE WHEN q.rn = q.sc_total THEN q.ly END) AS dy
    FROM seq q
    WHERE q.ox IS NOT NULL AND q.oy IS NOT NULL
      AND q.pid IS NOT NULL
      AND q.hitter_team IS NOT NULL
      AND (p_hand IS NULL OR q.shand = p_hand)
  ),
  pairs AS (
    -- 選手視点変換: カメラ手前打者 = y のみ反転 / カメラ奥打者 = x のみ反転
    SELECT rp.pid, rp.stype,
      CASE WHEN rp.hitter_team = rp.cam THEN rp.ox ELSE 1.0 - rp.ox END AS mox,
      CASE WHEN rp.hitter_team = rp.cam THEN 1.0 - rp.oy ELSE rp.oy END AS moy,
      CASE WHEN rp.hitter_team = rp.cam THEN rp.dx ELSE 1.0 - rp.dx END AS mdx,
      CASE WHEN rp.hitter_team = rp.cam THEN 1.0 - rp.dy ELSE rp.dy END AS mdy
    FROM raw_pairs rp
  )
  SELECT
    pr.pid,
    pr.stype,
    LEAST(p_zones - 1, GREATEST(0, floor(LEAST(1.0, GREATEST(0.0, pr.moy)) * p_zones * 2)::int)),
    LEAST(p_zones - 1, GREATEST(0, floor(LEAST(1.0, GREATEST(0.0, pr.mox)) * p_zones)::int)),
    LEAST(p_zones - 1, GREATEST(0, floor(LEAST(1.0, GREATEST(0.0, pr.mdy)) * p_zones * 2)::int - p_zones)),
    LEAST(p_zones - 1, GREATEST(0, floor(LEAST(1.0, GREATEST(0.0, pr.mdx)) * p_zones)::int)),
    count(*) AS shots
  FROM pairs pr
  WHERE pr.mdx IS NOT NULL AND pr.mdy IS NOT NULL
  GROUP BY 1, 2, 3, 4, 5, 6;
END;
$$;
