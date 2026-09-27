-- ========================================
-- shot-value: SV（ショット別ポイント収支）役割カウント RPC（TASK-0001）
-- ========================================
--
-- ショット 1 本ごとに決着からの遡りで役割（決め/誘発/布石/自ミス/許した）を割り当て、
-- (打者, 球種, hand, ゾーン) grain のカウントで返す。点数化（重み合成・SV100・CI）は
-- クライアント（app/utils/shot-value/score.ts）— 重み変更にマイグレーション不要とするため。
--
-- 規則の正: docs/spec/shot-value/requirements.md REQ-001〜/ docs/design/shot-value/
-- - チーム帰属は打順の偶奇 × serving_team（hit_player_id 不使用, REQ-104）
-- - end_reason null/unknown のラリーは分母にも入れない（REQ-102）
-- - camera_near_team null は除外せずゾーンのみ null（REQ-101。placement との差分）
-- - 向き正規化・クランプは stats_shot_placement (20260808140000) と同一

CREATE OR REPLACE FUNCTION stats_shot_value(
  p_match_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_match_ids uuid[] DEFAULT NULL,
  p_set_number smallint DEFAULT NULL,
  p_zones int DEFAULT 3
)
RETURNS TABLE (
  hit_player_id uuid,
  shot_type text,
  hand text,
  zone_row int,
  zone_col int,
  n bigint,
  kime bigint,
  yuhatsu bigint,
  fuseki1 bigint,
  fuseki2 bigint,
  miss bigint,
  yurushi1 bigint,
  yurushi2 bigint
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
    SELECT r.id AS rally_id, r.point_winner, r.end_reason, r.serving_team,
           r.camera_near_team AS cam
    FROM rallies r
    JOIN sets s ON s.id = r.set_id AND s.deleted_at IS NULL
    JOIN matches m ON m.id = s.match_id AND m.deleted_at IS NULL
    WHERE r.deleted_at IS NULL
      AND r.is_let = false
      AND r.is_point_confirmed = true
      AND r.point_winner IS NOT NULL
      AND r.end_reason IN ('floor', 'body', 'net', 'not_over', 'service_fault')
      AND (p_match_id IS NULL OR m.id = p_match_id)
      AND (p_group_id IS NULL OR m.group_id = p_group_id)
      AND (p_match_ids IS NULL OR m.id = ANY(p_match_ids))
      AND (p_set_number IS NULL OR s.set_number = p_set_number)
  ),
  seq AS (
    SELECT sh.hit_player_id AS pid,
      COALESCE(sh.shot_type, 'unknown') AS stype,
      sh.hand AS shand, sh.hit_x AS ox, sh.hit_y AS oy,
      row_number() OVER w AS rn,
      count(*) OVER (PARTITION BY sh.rally_id) AS sc_total,
      sc.point_winner, sc.end_reason, sc.serving_team, sc.cam,
      CASE WHEN row_number() OVER w % 2 = 1 THEN sc.serving_team
           WHEN sc.serving_team = 'A' THEN 'B' ELSE 'A' END AS hitter_team
    FROM shots sh
    JOIN scoped sc ON sc.rally_id = sh.rally_id
    WHERE sh.deleted_at IS NULL
    WINDOW w AS (PARTITION BY sh.rally_id ORDER BY sh.shot_number)
  ),
  kinds AS (
    SELECT q.*,
      CASE
        WHEN q.end_reason = 'service_fault' THEN 'fault'
        WHEN q.end_reason = 'body' THEN 'ace'
        WHEN q.end_reason = 'floor' AND (
          CASE WHEN q.sc_total % 2 = 1 THEN q.serving_team
               WHEN q.serving_team = 'A' THEN 'B' ELSE 'A' END) = q.point_winner
          THEN 'ace'
        ELSE 'miss'
      END AS kind,
      q.sc_total - q.rn AS back
    FROM seq q
  ),
  roled AS (
    SELECT k.pid, k.stype, k.shand, k.ox, k.oy, k.cam, k.hitter_team,
      CASE
        WHEN k.kind = 'fault' THEN CASE WHEN k.rn = 1 THEN 'miss' END
        WHEN k.kind = 'ace' THEN CASE k.back
          WHEN 0 THEN 'kime' WHEN 1 THEN 'yurushi1' WHEN 2 THEN 'fuseki1'
          WHEN 3 THEN 'yurushi2' WHEN 4 THEN 'fuseki2' END
        ELSE CASE k.back
          WHEN 0 THEN 'miss' WHEN 1 THEN 'yuhatsu' WHEN 2 THEN 'yurushi1'
          WHEN 3 THEN 'fuseki1' WHEN 4 THEN 'yurushi2' WHEN 5 THEN 'fuseki2' END
      END AS role
    FROM kinds k
  ),
  zoned AS (
    -- 向き正規化（20260808140000 と同一）:
    -- 打者 = カメラ手前 → y のみ反転（x そのまま）/ 打者 = カメラ奥 → x のみ反転
    SELECT r2.pid, r2.stype, r2.shand, r2.role,
      CASE WHEN r2.cam IS NULL OR r2.ox IS NULL OR r2.oy IS NULL THEN NULL
        ELSE LEAST(p_zones - 1, GREATEST(0, floor(LEAST(1.0, GREATEST(0.0,
          CASE WHEN r2.hitter_team = r2.cam THEN 1.0 - r2.oy ELSE r2.oy END
        )) * p_zones * 2)::int))
      END AS zr,
      CASE WHEN r2.cam IS NULL OR r2.ox IS NULL OR r2.oy IS NULL THEN NULL
        ELSE LEAST(p_zones - 1, GREATEST(0, floor(LEAST(1.0, GREATEST(0.0,
          CASE WHEN r2.hitter_team = r2.cam THEN r2.ox ELSE 1.0 - r2.ox END
        )) * p_zones)::int))
      END AS zc
    FROM roled r2
  )
  SELECT z.pid, z.stype, z.shand, z.zr, z.zc,
    count(*) AS n,
    count(*) FILTER (WHERE z.role = 'kime') AS kime,
    count(*) FILTER (WHERE z.role = 'yuhatsu') AS yuhatsu,
    count(*) FILTER (WHERE z.role = 'fuseki1') AS fuseki1,
    count(*) FILTER (WHERE z.role = 'fuseki2') AS fuseki2,
    count(*) FILTER (WHERE z.role = 'miss') AS miss,
    count(*) FILTER (WHERE z.role = 'yurushi1') AS yurushi1,
    count(*) FILTER (WHERE z.role = 'yurushi2') AS yurushi2
  FROM zoned z
  WHERE z.pid IS NOT NULL
  GROUP BY z.pid, z.stype, z.shand, z.zr, z.zc;
END;
$$;

GRANT EXECUTE ON FUNCTION stats_shot_value(uuid, uuid, uuid[], smallint, int) TO authenticated;
