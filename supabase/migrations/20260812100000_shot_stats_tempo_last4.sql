-- ========================================
-- stats_rally_tempo: 終盤4打の平均間隔（last4_avg_interval_ms）を出力に追加
-- ========================================
--
-- 作成日: 2026-08-12
-- 関連: K 展開スピードの 2 軸散布図改修（x = ラリー全体の平均間隔 / y = 終盤4打の平均間隔、
--       秒/打に統一・4打以上のみ集計。ヒアリング2026-08-12）。
-- last4_avg_interval_ms = ラスト 4 打の 3 間隔の平均 = (t_last − t_last-3) / 3。
-- 4 打すべてに時刻がない場合は NULL（クライアント側で対象外扱い）。
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
  agg AS (
    SELECT sh.rally_id,
      count(*) AS sc_total,
      count(sh.video_timestamp_ms) AS timed,
      max(sh.video_timestamp_ms) - min(sh.video_timestamp_ms) AS dur
    FROM shots sh
    WHERE sh.deleted_at IS NULL
      AND sh.rally_id IN (SELECT sc2.rid FROM scoped sc2)
    GROUP BY sh.rally_id
  ),
  ranked AS (
    SELECT sh.rally_id, sh.video_timestamp_ms AS ts,
           row_number() OVER (PARTITION BY sh.rally_id ORDER BY sh.shot_number DESC) AS rdesc
    FROM shots sh
    WHERE sh.deleted_at IS NULL
      AND sh.rally_id IN (SELECT sc2.rid FROM scoped sc2)
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
    sc.a1, sc.a2, sc.b1, sc.b2
  FROM scoped sc
  LEFT JOIN agg a ON a.rally_id = sc.rid
  LEFT JOIN last3 l ON l.rally_id = sc.rid
  LEFT JOIN last4 l4 ON l4.rally_id = sc.rid;
END;
$$;

-- GRANT 再付与 (DROP で消えるため)
GRANT EXECUTE ON FUNCTION stats_rally_tempo(uuid, uuid, uuid[], smallint) TO authenticated;
