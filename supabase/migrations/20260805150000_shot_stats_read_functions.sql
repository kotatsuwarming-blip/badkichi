-- ========================================
-- shot-stats 読み取り専用 集計関数（RPC）
-- ========================================
--
-- 作成日: 2026-08-05
-- 関連設計: docs/design/shot-stats/database-schema.sql / api-endpoints.md
-- 関連要件: docs/spec/shot-stats/requirements.md (REQ-401/402/403/406 / NFR-002)
-- 関連タスク: docs/tasks/shot-stats/overview.md TASK-0001
--
-- 方針（stats-dashboard 前例踏襲）:
-- - 既存テーブルのスキーマは変更しない（additive: 関数 + GRANT のみ, REQ-402）。
-- - 適用は CI 経由 db:push（ローカル適用しない）。
-- - 全関数 SECURITY INVOKER + STABLE + SET search_path=public。RLS を継承（REQ-403）。
-- - スコープ引数 p_match_id / p_group_id はいずれか一方のみ（両方 NULL/両方指定は invalid_scope）。
--   p_group_id 時は p_match_ids で試合絞り込み（グローバルフィルタ連動）。
-- - 確定ラリー（集計対象, REQ-101）:
--     r.deleted_at IS NULL AND r.is_let = false AND r.is_point_confirmed = true AND r.point_winner IS NOT NULL
--   （sets/matches も deleted_at IS NULL）。ショットは shots.deleted_at IS NULL のみ。
-- - end_reason は 6 値（floor/net/not_over/body/service_fault/unknown）。in/out は
--   「最終打者チーム × point_winner」から導出（app/utils/annotation/derive.ts の
--   deriveInOut / decisiveShotIndex と同一規則。integration テストで突き合わせ, REQ-406）。
--
-- 決定打の導出規則（decisiveShotIndex と同一, REQ-104）:
--   body                → 最終ショット
--   net / not_over      → 最終の 1 つ前（ショット 2 本以上のときのみ）
--   floor               → 最終打者チーム = 勝者なら最終（in 相当）、敗者なら 1 つ前（out 相当）
--   service_fault / unknown → なし
--   ※最終打者未注釈の floor は向きが決められないため決定打なし（REQ-108）

-- ========================================
-- 1. stats_annotation_coverage: 注釈率（バッジ・母数併記） 🔵 REQ-002/003
-- ========================================
CREATE OR REPLACE FUNCTION stats_annotation_coverage(
  p_match_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_match_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  match_id uuid,
  shots_total bigint,
  shots_typed bigint,
  shots_pointed bigint,
  shots_handed bigint,
  shots_attributed bigint,
  rallies_total bigint,
  rallies_ended bigint,
  rallies_fully_timed bigint
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
    SELECT r.id AS rally_id, m.id AS mid, r.end_reason
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
  shot_agg AS (
    SELECT sc.mid,
      count(sh.id) AS s_total,
      count(sh.id) FILTER (WHERE sh.shot_type IS NOT NULL) AS s_typed,
      count(sh.id) FILTER (WHERE sh.hit_x IS NOT NULL AND sh.hit_y IS NOT NULL) AS s_pointed,
      count(sh.id) FILTER (WHERE sh.hand IS NOT NULL) AS s_handed,
      count(sh.id) FILTER (WHERE sh.hit_player_id IS NOT NULL) AS s_attributed
    FROM scoped sc
    LEFT JOIN shots sh ON sh.rally_id = sc.rally_id AND sh.deleted_at IS NULL
    GROUP BY sc.mid
  ),
  rally_agg AS (
    SELECT sc.mid,
      count(*) AS r_total,
      count(*) FILTER (WHERE sc.end_reason IS NOT NULL) AS r_ended,
      count(*) FILTER (WHERE
        NOT EXISTS (
          SELECT 1 FROM shots sh
          WHERE sh.rally_id = sc.rally_id AND sh.deleted_at IS NULL
            AND sh.video_timestamp_ms IS NULL
        )
        AND EXISTS (
          SELECT 1 FROM shots sh
          WHERE sh.rally_id = sc.rally_id AND sh.deleted_at IS NULL
        )
      ) AS r_fully_timed
    FROM scoped sc
    GROUP BY sc.mid
  )
  SELECT ra.mid,
         COALESCE(sa.s_total, 0), COALESCE(sa.s_typed, 0), COALESCE(sa.s_pointed, 0),
         COALESCE(sa.s_handed, 0), COALESCE(sa.s_attributed, 0),
         ra.r_total, ra.r_ended, ra.r_fully_timed
  FROM rally_agg ra
  LEFT JOIN shot_agg sa ON sa.mid = ra.mid;
END;
$$;

-- ========================================
-- 2. stats_shot_types: 球種 × 打者 × hand 集計（C/D/G の基盤） 🔵 REQ-008/009/010/012
--    grain = (hit_player_id, shot_type, hand)。選手・球種・hand の絞り込みはクライアント側。
-- ========================================
CREATE OR REPLACE FUNCTION stats_shot_types(
  p_match_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_match_ids uuid[] DEFAULT NULL,
  p_set_number smallint DEFAULT NULL
)
RETURNS TABLE (
  hit_player_id uuid,
  shot_type text,
  hand text,
  shots bigint,
  serve_first_shots bigint,
  serve_won bigint,
  decisive_won bigint,
  miss_lost bigint,
  rallies bigint,
  rallies_won bigint
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
    SELECT r.id AS rally_id, r.point_winner, r.end_reason,
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
  live_shots AS (
    SELECT sh.rally_id, sh.hit_player_id AS pid, sh.shot_type AS stype, sh.hand AS shand,
      sc.point_winner, sc.end_reason,
      CASE WHEN sh.hit_player_id IN (sc.a1, sc.a2) THEN 'A'
           WHEN sh.hit_player_id IN (sc.b1, sc.b2) THEN 'B'
           ELSE NULL END AS hitter_team,
      row_number() OVER (PARTITION BY sh.rally_id ORDER BY sh.shot_number) AS rn,
      count(*) OVER (PARTITION BY sh.rally_id) AS sc_total
    FROM shots sh
    JOIN scoped sc ON sc.rally_id = sh.rally_id
    WHERE sh.deleted_at IS NULL
  ),
  decisive AS (
    -- 決定打の位置（decisiveShotIndex と同一規則。最終ショット行で判定）
    SELECT ls.rally_id,
      CASE
        WHEN ls.end_reason = 'body' THEN ls.sc_total
        WHEN ls.end_reason IN ('net', 'not_over') AND ls.sc_total >= 2 THEN ls.sc_total - 1
        WHEN ls.end_reason = 'floor' AND ls.hitter_team IS NOT NULL THEN
          CASE WHEN ls.hitter_team = ls.point_winner THEN ls.sc_total
               WHEN ls.sc_total >= 2 THEN ls.sc_total - 1
               ELSE NULL END
        ELSE NULL
      END AS decisive_rn
    FROM live_shots ls
    WHERE ls.rn = ls.sc_total
  )
  SELECT
    ls.pid,
    ls.stype,
    ls.shand,
    count(*) AS shots,
    count(*) FILTER (WHERE ls.rn = 1) AS serve_first_shots,
    count(*) FILTER (WHERE ls.rn = 1 AND ls.hitter_team = ls.point_winner) AS serve_won,
    count(*) FILTER (WHERE d.decisive_rn = ls.rn AND ls.hitter_team = ls.point_winner) AS decisive_won,
    count(*) FILTER (WHERE
      (ls.end_reason IN ('net', 'not_over', 'service_fault') AND ls.rn = ls.sc_total)
      OR (ls.end_reason = 'floor' AND ls.rn = ls.sc_total
          AND ls.hitter_team IS NOT NULL AND ls.hitter_team <> ls.point_winner)
    ) AS miss_lost,
    count(DISTINCT ls.rally_id) AS rallies,
    count(DISTINCT ls.rally_id) FILTER (WHERE ls.hitter_team = ls.point_winner) AS rallies_won
  FROM live_shots ls
  LEFT JOIN decisive d ON d.rally_id = ls.rally_id
  GROUP BY ls.pid, ls.stype, ls.shand;
END;
$$;

-- ========================================
-- 3. stats_shot_zones: 打点ゾーン集計（F） 🔵 REQ-011/105/302 + EDGE-101
--    選手視点固定ミラー（打者がチーム B なら x→1−x, y→1−y）とクランプ算入は SQL 側で適用。
--    打者未注釈はミラー不能のため対象外（母数併記はクライアントで coverage と突き合わせ）。
--    zone_row: 0 = 打者自陣バック側 〜 p_zones*2-1 = 相手コート奥（全長 2 コート分）。
-- ========================================
CREATE OR REPLACE FUNCTION stats_shot_zones(
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
  zone_row int,
  zone_col int,
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
    SELECT r.id AS rally_id,
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
  pts AS (
    SELECT sh.hit_player_id AS pid, sh.shot_type AS stype,
      CASE WHEN sh.hit_player_id IN (sc.b1, sc.b2)
           THEN 1.0 - sh.hit_x ELSE sh.hit_x END AS mx,
      CASE WHEN sh.hit_player_id IN (sc.b1, sc.b2)
           THEN 1.0 - sh.hit_y ELSE sh.hit_y END AS my
    FROM shots sh
    JOIN scoped sc ON sc.rally_id = sh.rally_id
    WHERE sh.deleted_at IS NULL
      AND sh.hit_x IS NOT NULL AND sh.hit_y IS NOT NULL
      AND sh.hit_player_id IS NOT NULL
      AND (p_hand IS NULL OR sh.hand = p_hand)
  )
  -- クランプ算入（EDGE-101）: [0,1] に丸めてからゾーン化。GROUP BY は位置指定
  -- （出力列名 zone_row/zone_col と plpgsql 変数の衝突回避）
  SELECT
    pts.pid,
    pts.stype,
    LEAST(p_zones * 2 - 1, GREATEST(0, floor(LEAST(1.0, GREATEST(0.0, pts.my)) * p_zones * 2)::int)),
    LEAST(p_zones - 1, GREATEST(0, floor(LEAST(1.0, GREATEST(0.0, pts.mx)) * p_zones)::int)),
    count(*) AS shots
  FROM pts
  GROUP BY 1, 2, 3, 4;
END;
$$;

-- ========================================
-- 4. stats_rally_endings: 決着注釈つきラリー行（A の基盤） 🔵 REQ-005/006/007
--    確定ラリー 1 行ずつ。分類・落下点ミラー/ゾーン化はクライアント純関数（REQ-407）。
-- ========================================
CREATE OR REPLACE FUNCTION stats_rally_endings(
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
    wt.a1, wt.a2, wt.b1, wt.b2
  FROM with_team wt;
END;
$$;

-- ========================================
-- 5. stats_rally_tempo: ラリーごとのテンポ素材（K） 🔵 REQ-015/016/106
--    適格判定（全ショット時刻あり・2/3 本以上・時間 > 0）はクライアント純関数（REQ-407）。
--    last3_avg_interval_ms = ラスト 3 打の 2 間隔の平均 = (t_last − t_last-2) / 2。
-- ========================================
CREATE OR REPLACE FUNCTION stats_rally_tempo(
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
  last3 AS (
    SELECT t.rally_id, (max(t.ts) - min(t.ts)) / 2.0 AS l3
    FROM (
      SELECT sh.rally_id, sh.video_timestamp_ms AS ts,
             row_number() OVER (PARTITION BY sh.rally_id ORDER BY sh.shot_number DESC) AS rdesc
      FROM shots sh
      WHERE sh.deleted_at IS NULL
        AND sh.rally_id IN (SELECT sc2.rid FROM scoped sc2)
    ) t
    WHERE t.rdesc <= 3
    GROUP BY t.rally_id
    HAVING count(t.ts) = 3
  )
  SELECT
    sc.rid, sc.mid, sc.snum, sc.rnum, sc.steam, sc.pwin,
    COALESCE(a.sc_total, 0), COALESCE(a.timed, 0), a.dur, l.l3::real,
    sc.a1, sc.a2, sc.b1, sc.b2
  FROM scoped sc
  LEFT JOIN agg a ON a.rally_id = sc.rid
  LEFT JOIN last3 l ON l.rally_id = sc.rid;
END;
$$;

-- ========================================
-- GRANT（authenticated ロールにのみ実行権限）
-- ========================================
GRANT EXECUTE ON FUNCTION stats_annotation_coverage(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION stats_shot_types(uuid, uuid, uuid[], smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION stats_shot_zones(uuid, uuid, uuid[], smallint, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION stats_rally_endings(uuid, uuid, uuid[], smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION stats_rally_tempo(uuid, uuid, uuid[], smallint) TO authenticated;
