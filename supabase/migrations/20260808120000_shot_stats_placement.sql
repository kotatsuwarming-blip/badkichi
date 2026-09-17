-- ========================================
-- shot-stats: 配球ヒートマップ用 打点→配球先ペア集計（F 探針改訂, ヒアリング2026-08-08）
-- ========================================
--
-- 作成日: 2026-08-08
-- 関連: docs/spec/shot-stats/requirements.md REQ-011 改訂 / docs/tasks TASK-0012 追補
--
-- ユーザフィードバック（2026-08-08 dev 検証）:
--   「手前 3×3 のゾーンを選択すると、そこから打ったショットの配球先が奥 3×3 に数字で出る。
--    数字にカーソルを合わせると球種と本数の内訳が出る」
-- これには打点単独ではなく「打点（origin）→ 行き先（destination）」のペアが必要。
--   destination = 次のショットの打点（相手の接触点）。最終ショットは rallies の落下点 land_x/y。
-- 座標は選手視点固定ミラー（REQ-105）+ クランプ算入（EDGE-101）を SQL 側で適用し、
-- origin は自陣半面 3×3（0=バック側行）、dest は相手半面 3×3（0=ネット側行）に正規化する。
-- grain: (hit_player_id, shot_type, origin_row, origin_col, dest_row, dest_col)
-- 選手・球種・origin セルの絞り込みと球種内訳ツールチップはクライアント側。

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
  shot_type text,     -- NULL = 種別未注釈（内訳では「未注釈」表示）
  origin_row int,     -- 0 = 自陣バック側 〜 p_zones-1 = ネット側（自陣半面）
  origin_col int,     -- 0 = 打者視点左 〜 p_zones-1 = 右
  dest_row int,       -- 0 = 相手半面ネット側 〜 p_zones-1 = 相手バック側
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
  seq AS (
    SELECT sh.rally_id, sh.hit_player_id AS pid, sh.shot_type AS stype, sh.hand AS shand,
      sh.hit_x AS ox, sh.hit_y AS oy,
      lead(sh.hit_x) OVER w AS nx, lead(sh.hit_y) OVER w AS ny,
      row_number() OVER w AS rn,
      count(*) OVER (PARTITION BY sh.rally_id) AS sc_total,
      sc.lx, sc.ly, sc.b1, sc.b2
    FROM shots sh
    JOIN scoped sc ON sc.rally_id = sh.rally_id
    WHERE sh.deleted_at IS NULL
    WINDOW w AS (PARTITION BY sh.rally_id ORDER BY sh.shot_number)
  ),
  pairs AS (
    -- destination: 次ショットの打点。最終ショットは落下点（land）
    SELECT q.pid, q.stype,
      CASE WHEN q.pid IN (q.b1, q.b2) THEN 1.0 - q.ox ELSE q.ox END AS mox,
      CASE WHEN q.pid IN (q.b1, q.b2) THEN 1.0 - q.oy ELSE q.oy END AS moy,
      CASE WHEN q.pid IN (q.b1, q.b2) THEN 1.0 - COALESCE(q.nx, CASE WHEN q.rn = q.sc_total THEN q.lx END)
           ELSE COALESCE(q.nx, CASE WHEN q.rn = q.sc_total THEN q.lx END) END AS mdx,
      CASE WHEN q.pid IN (q.b1, q.b2) THEN 1.0 - COALESCE(q.ny, CASE WHEN q.rn = q.sc_total THEN q.ly END)
           ELSE COALESCE(q.ny, CASE WHEN q.rn = q.sc_total THEN q.ly END) END AS mdy
    FROM seq q
    WHERE q.ox IS NOT NULL AND q.oy IS NOT NULL
      AND q.pid IS NOT NULL
      AND (p_hand IS NULL OR q.shand = p_hand)
  )
  SELECT
    pr.pid,
    pr.stype,
    -- origin は自陣半面へクランプ（0 = バック側）
    LEAST(p_zones - 1, GREATEST(0, floor(LEAST(1.0, GREATEST(0.0, pr.moy)) * p_zones * 2)::int)),
    LEAST(p_zones - 1, GREATEST(0, floor(LEAST(1.0, GREATEST(0.0, pr.mox)) * p_zones)::int)),
    -- dest は相手半面へクランプ（0 = ネット側）
    LEAST(p_zones - 1, GREATEST(0, floor(LEAST(1.0, GREATEST(0.0, pr.mdy)) * p_zones * 2)::int - p_zones)),
    LEAST(p_zones - 1, GREATEST(0, floor(LEAST(1.0, GREATEST(0.0, pr.mdx)) * p_zones)::int)),
    count(*) AS shots
  FROM pairs pr
  WHERE pr.mdx IS NOT NULL AND pr.mdy IS NOT NULL
  GROUP BY 1, 2, 3, 4, 5, 6;
END;
$$;

GRANT EXECUTE ON FUNCTION stats_shot_placement(uuid, uuid, uuid[], smallint, text, int) TO authenticated;
