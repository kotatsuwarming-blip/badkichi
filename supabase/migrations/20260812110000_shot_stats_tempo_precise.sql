-- ========================================
-- stats_rally_tempo: 注釈時刻（annotated_timestamp_ms）のラリー単位フォールバック採用
-- ========================================
--
-- 作成日: 2026-08-12
-- 関連: 精密テンポ（要件定義時の将来候補）の採用（ヒアリング2026-08-12）。
-- ラリー内の全ショットに annotated_timestamp_ms（打点パスの正確な打刻）があれば
-- 注釈時刻を、無ければ従来どおり video_timestamp_ms（ライブ記録の押下時刻 =
-- 実打球時刻の近似）を使う。**ラリー内で 2 つの時刻系を混ぜない**（ズレ方が違うため）。
-- is_precise = そのラリーが注釈時刻ベースか（クライアントの内訳表示用）。
--
-- RETURNS TABLE を変更するため CREATE OR REPLACE 不可 → DROP してから再作成し GRANT を再付与する。

DROP FUNCTION IF EXISTS stats_rally_tempo(uuid, uuid, uuid[], smallint);

CREATE FUNCTION stats_rally_tempo(
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
  shot_count bigint,
  timed_count bigint,
  duration_ms integer,
  last3_avg_interval_ms real,
  last4_avg_interval_ms real,
  is_precise boolean,
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
           r.point_winner AS pwin, s.set_number AS snum, m.id AS mid,
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
  -- ラリー単位で時刻ソースを決定（全打に注釈時刻あり = 精密。2 つの時刻系は混ぜない）
  src AS (
    SELECT sh.rally_id,
           (count(*) > 0 AND count(sh.annotated_timestamp_ms) = count(*)) AS precise
    FROM shots sh
    WHERE sh.deleted_at IS NULL
      AND sh.rally_id IN (SELECT sc2.rid FROM scoped sc2)
    GROUP BY sh.rally_id
  ),
  -- 採用した時刻系でのショット時刻
  eff AS (
    SELECT sh.rally_id, sh.shot_number,
           CASE WHEN sr.precise THEN sh.annotated_timestamp_ms ELSE sh.video_timestamp_ms END AS ts
    FROM shots sh
    JOIN src sr ON sr.rally_id = sh.rally_id
    WHERE sh.deleted_at IS NULL
  ),
  agg AS (
    SELECT e.rally_id,
      count(*) AS sc_total,
      count(e.ts) AS timed,
      max(e.ts) - min(e.ts) AS dur
    FROM eff e
    GROUP BY e.rally_id
  ),
  ranked AS (
    SELECT e.rally_id, e.ts,
           row_number() OVER (PARTITION BY e.rally_id ORDER BY e.shot_number DESC) AS rdesc
    FROM eff e
  ),
  last3 AS (
    SELECT t.rally_id, (max(t.ts) - min(t.ts)) / 2.0 AS l3
    FROM ranked t
    WHERE t.rdesc <= 3
    GROUP BY t.rally_id
    HAVING count(t.ts) = 3
  ),
  last4 AS (
    SELECT t.rally_id, (max(t.ts) - min(t.ts)) / 3.0 AS l4
    FROM ranked t
    WHERE t.rdesc <= 4
    GROUP BY t.rally_id
    HAVING count(t.ts) = 4
  )
  SELECT
    sc.rid, sc.mid, sc.snum, sc.rnum, sc.steam, sc.pwin,
    COALESCE(a.sc_total, 0), COALESCE(a.timed, 0), a.dur, l.l3::real, l4.l4::real,
    COALESCE(sr.precise, false),
    sc.a1, sc.a2, sc.b1, sc.b2
  FROM scoped sc
  LEFT JOIN agg a ON a.rally_id = sc.rid
  LEFT JOIN src sr ON sr.rally_id = sc.rid
  LEFT JOIN last3 l ON l.rally_id = sc.rid
  LEFT JOIN last4 l4 ON l4.rally_id = sc.rid;
END;
$$;

-- GRANT 再付与 (DROP で消えるため)
GRANT EXECUTE ON FUNCTION stats_rally_tempo(uuid, uuid, uuid[], smallint) TO authenticated;
