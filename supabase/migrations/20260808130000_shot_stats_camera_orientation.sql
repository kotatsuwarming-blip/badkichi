-- ========================================
-- shot-stats: 座標の向きをカメラ基準で正規化（重要修正, 2026-08-08）
-- ========================================
--
-- 【背景】注釈スタジオのコート図にはチームの向きラベルが無く、注釈者は
-- 「動画の見たまま」（カメラ手前の選手 = 図の下側 = y 大きい側）でタップしている
-- （ユーザ確認 2026-08-08）。したがって保存座標は設計時の想定
-- 「y=0 = チーム A 側」（ADR-017 / note §3-1）ではなく **カメラ基準**:
--   カメラ手前チーム（rallies.camera_near_team）の半面 = y ∈ [0.5, 1]
--
-- 【選手視点への正規化規則（新）】
--   打者（対象）チーム = camera_near_team のとき 180° 反転（x→1−x, y→1−y）。
--   そうでなければそのまま。→ 打者の自陣が常に y ∈ [0, 0.5] になる。
--   camera_near_team IS NULL のラリーは向きを決められないため座標集計から除外
--   （母数併記で可視化。placement / 落下点が対象）。
--
-- 変更:
-- 1. stats_shot_placement を上記規則で作り直し（同シグネチャ, CREATE OR REPLACE）
-- 2. stats_rally_endings に camera_near_team を出力追加（落下点の向き解決は
--    クライアント純関数が同じ規則で行う）。RETURNS TABLE 変更のため DROP → 再作成
-- ※ stats_shot_zones は placement に置換済み・アプリ未使用のため触らない（旧規則のまま残存）

-- ========================================
-- 1. stats_shot_placement（カメラ基準の向き正規化版）
-- ========================================
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
      AND r.camera_near_team IS NOT NULL  -- 向き不明は除外（本 migration の規則）
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
  pairs AS (
    -- 反転条件: 打者チーム = カメラ手前チーム（打者の自陣を y<0.5 に正規化）
    SELECT q.pid, q.stype,
      CASE WHEN q.hitter_team = q.cam THEN 1.0 - q.ox ELSE q.ox END AS mox,
      CASE WHEN q.hitter_team = q.cam THEN 1.0 - q.oy ELSE q.oy END AS moy,
      CASE WHEN q.hitter_team = q.cam
           THEN 1.0 - COALESCE(q.nx, CASE WHEN q.rn = q.sc_total THEN q.lx END)
           ELSE COALESCE(q.nx, CASE WHEN q.rn = q.sc_total THEN q.lx END) END AS mdx,
      CASE WHEN q.hitter_team = q.cam
           THEN 1.0 - COALESCE(q.ny, CASE WHEN q.rn = q.sc_total THEN q.ly END)
           ELSE COALESCE(q.ny, CASE WHEN q.rn = q.sc_total THEN q.ly END) END AS mdy
    FROM seq q
    WHERE q.ox IS NOT NULL AND q.oy IS NOT NULL
      AND q.pid IS NOT NULL
      AND q.hitter_team IS NOT NULL
      AND (p_hand IS NULL OR q.shand = p_hand)
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

-- ========================================
-- 2. stats_rally_endings: camera_near_team を出力に追加（DROP → 再作成 + GRANT 再付与）
-- ========================================
DROP FUNCTION IF EXISTS stats_rally_endings(uuid, uuid, uuid[], smallint);

CREATE FUNCTION stats_rally_endings(
  p_match_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_match_ids uuid[] DEFAULT NULL,
  p_set_number smallint DEFAULT NULL
)
RETURNS TABLE (
  rally_id uuid,
  match_id uuid,
  set_number smallint,
  rally_number smallint,
  serving_team text,
  point_winner text,
  end_reason text,
  last_hitter_team text,
  decisive_shot_type text,
  decisive_hit_player_id uuid,
  land_x real,
  land_y real,
  out_direction text,
  camera_near_team text,
  team_a_player1_id uuid,
  team_a_player2_id uuid,
  team_b_player1_id uuid,
  team_b_player2_id uuid
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
    SELECT r.id AS rid, r.rally_number AS rnum, r.serving_team AS steam,
           r.point_winner AS pwin, r.end_reason AS ereason,
           r.land_x AS lx, r.land_y AS ly, r.out_direction AS odir,
           r.camera_near_team AS cam,
           s.set_number AS snum, m.id AS mid,
           m.team_a_player1_id AS a1, m.team_a_player2_id AS a2,
           m.team_b_player1_id AS b1, m.team_b_player2_id AS b2
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
  lastshot AS (
    SELECT DISTINCT ON (sh.rally_id)
           sh.rally_id, sh.hit_player_id AS pid, sh.shot_type AS stype
    FROM shots sh
    WHERE sh.deleted_at IS NULL
      AND sh.rally_id IN (SELECT sc2.rid FROM scoped sc2)
    ORDER BY sh.rally_id, sh.shot_number DESC
  ),
  prevshot AS (
    SELECT t.rally_id, t.pid, t.stype
    FROM (
      SELECT sh.rally_id, sh.hit_player_id AS pid, sh.shot_type AS stype,
             row_number() OVER (PARTITION BY sh.rally_id ORDER BY sh.shot_number DESC) AS rdesc
      FROM shots sh
      WHERE sh.deleted_at IS NULL
        AND sh.rally_id IN (SELECT sc2.rid FROM scoped sc2)
    ) t
    WHERE t.rdesc = 2
  ),
  with_team AS (
    SELECT sc.*,
      lsh.pid AS last_pid, lsh.stype AS last_stype,
      p2.pid AS prev_pid, p2.stype AS prev_stype,
      CASE WHEN lsh.pid IN (sc.a1, sc.a2) THEN 'A'
           WHEN lsh.pid IN (sc.b1, sc.b2) THEN 'B'
           ELSE NULL END AS lteam
    FROM scoped sc
    LEFT JOIN lastshot lsh ON lsh.rally_id = sc.rid
    LEFT JOIN prevshot p2 ON p2.rally_id = sc.rid
  )
  SELECT
    wt.rid, wt.mid, wt.snum, wt.rnum, wt.steam, wt.pwin, wt.ereason,
    wt.lteam,
    CASE
      WHEN wt.ereason = 'body' THEN wt.last_stype
      WHEN wt.ereason IN ('net', 'not_over') THEN wt.prev_stype
      WHEN wt.ereason = 'floor' AND wt.lteam IS NOT NULL THEN
        CASE WHEN wt.lteam = wt.pwin THEN wt.last_stype ELSE wt.prev_stype END
      ELSE NULL
    END,
    CASE
      WHEN wt.ereason = 'body' THEN wt.last_pid
      WHEN wt.ereason IN ('net', 'not_over') THEN wt.prev_pid
      WHEN wt.ereason = 'floor' AND wt.lteam IS NOT NULL THEN
        CASE WHEN wt.lteam = wt.pwin THEN wt.last_pid ELSE wt.prev_pid END
      ELSE NULL
    END,
    wt.lx, wt.ly, wt.odir,
    wt.cam,
    wt.a1, wt.a2, wt.b1, wt.b2
  FROM with_team wt;
END;
$$;

GRANT EXECUTE ON FUNCTION stats_rally_endings(uuid, uuid, uuid[], smallint) TO authenticated;
