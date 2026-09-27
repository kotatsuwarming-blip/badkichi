-- ========================================
-- shot-stats: レシーブ詳細（サーブ種別 × 返球 × コース）RPC（2026-08-08 #6）
-- ========================================
--
-- ユーザ要望: レシーブは「どのサーブ種別（ショート/ロング/ドライブ）に対して何を返し、
-- どのコースへ打ったか、コースごとの得点率」までドリルダウンしたい。
-- stats_receive_types（種別のみ）を置き換える詳細版。
--
-- grain: (receiver_player_id, server_position, serve_type=1打目注釈, receive_type=2打目注釈,
--         dest_kind, dest_out, dest_row, dest_col) + total / won（レシーブ側得点）
-- コース = 2 打目の行き先:
--   - 3 打目が存在: その接触点（クランプして 'in'）
--   - 2 打目が最終打: net/not_over → 'net' / floor → 落下点（範囲外は 'out' + 方向）
--   - 座標なし・camera_near_team なし等で向きが決められない → dest_kind NULL（コース不明。
--     種別レベルの集計には含まれる）
-- 座標はレシーバー視点（打者 = カメラ手前なら y のみ反転 / 奥なら x のみ反転, REQ-105 改訂）

CREATE OR REPLACE FUNCTION stats_receive_detail(
  p_match_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_match_ids uuid[] DEFAULT NULL,
  p_set_number smallint DEFAULT NULL
)
RETURNS TABLE (
  receiver_player_id uuid,
  server_position text,
  serve_type text,   -- 1 打目の注釈（NULL = 未注釈）
  receive_type text, -- 2 打目の注釈（NULL = 未注釈）
  dest_kind text,    -- 'in' / 'net' / 'out' / NULL（コース不明）
  dest_out text,     -- out の方向（レシーバー視点 left/right/back）
  dest_row int,      -- 相手半面 0=ネット側（in のみ）
  dest_col int,
  total bigint,
  won bigint         -- レシーブ側チームが当該ラリーを取った数
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
           r.serving_team AS steam, r.point_winner AS pwin,
           r.end_reason AS ereason, r.land_x AS lx, r.land_y AS ly,
           r.camera_near_team AS cam
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
  numbered AS (
    SELECT sh.rally_id, sh.shot_type AS stype, sh.hit_x AS hx, sh.hit_y AS hy,
           row_number() OVER (PARTITION BY sh.rally_id ORDER BY sh.shot_number) AS rn,
           count(*) OVER (PARTITION BY sh.rally_id) AS sc_total
    FROM shots sh
    WHERE sh.deleted_at IS NULL
      AND sh.rally_id IN (SELECT sc2.rid FROM scoped sc2)
  ),
  per_rally AS (
    SELECT sc.rid, sc.rpid, sc.spos, sc.steam, sc.pwin, sc.ereason, sc.lx, sc.ly, sc.cam,
      s1.stype AS serve_stype,
      s2.stype AS recv_stype,
      s2.sc_total,
      s3.hx AS n3x, s3.hy AS n3y
    FROM scoped sc
    JOIN numbered s2 ON s2.rally_id = sc.rid AND s2.rn = 2 -- レシーブ発生ラリーのみ
    LEFT JOIN numbered s1 ON s1.rally_id = sc.rid AND s1.rn = 1
    LEFT JOIN numbered s3 ON s3.rally_id = sc.rid AND s3.rn = 3
  ),
  oriented AS (
    SELECT pr.*,
      -- レシーバーのチーム = サーブ側の逆
      CASE WHEN pr.steam = 'A' THEN 'B' ELSE 'A' END AS recv_team,
      -- 行き先の生座標: 3 打目の接触点 / 2 打目が最終打なら floor の落下点
      COALESCE(pr.n3x, CASE WHEN pr.sc_total = 2 AND pr.ereason = 'floor' THEN pr.lx END) AS dx,
      COALESCE(pr.n3y, CASE WHEN pr.sc_total = 2 AND pr.ereason = 'floor' THEN pr.ly END) AS dy
    FROM per_rally pr
  ),
  transformed AS (
    SELECT o.*,
      -- レシーバー視点変換（cam NULL は変換不能 → NULL）
      CASE WHEN o.cam IS NULL THEN NULL
           WHEN o.recv_team = o.cam THEN o.dx ELSE 1.0 - o.dx END AS mdx,
      CASE WHEN o.cam IS NULL THEN NULL
           WHEN o.recv_team = o.cam THEN 1.0 - o.dy ELSE o.dy END AS mdy
    FROM oriented o
  ),
  classified AS (
    SELECT t.rpid, t.spos, t.serve_stype, t.recv_stype,
      CASE
        WHEN t.sc_total = 2 AND t.ereason IN ('net', 'not_over') THEN 'net'
        WHEN t.mdx IS NULL OR t.mdy IS NULL THEN NULL -- コース不明
        WHEN t.sc_total = 2 AND t.ereason = 'floor'
             AND (t.mdx < 0 OR t.mdx > 1 OR t.mdy < 0 OR t.mdy > 1) THEN 'out'
        ELSE 'in'
      END AS dkind,
      CASE
        WHEN t.sc_total = 2 AND t.ereason = 'floor' AND t.mdx < 0 THEN 'left'
        WHEN t.sc_total = 2 AND t.ereason = 'floor' AND t.mdx > 1 THEN 'right'
        WHEN t.sc_total = 2 AND t.ereason = 'floor' AND (t.mdy < 0 OR t.mdy > 1) THEN 'back'
        ELSE NULL
      END AS dout,
      t.mdx, t.mdy,
      (t.pwin <> t.steam) AS recv_won
    FROM transformed t
  )
  SELECT
    c.rpid,
    c.spos,
    c.serve_stype,
    c.recv_stype,
    c.dkind,
    CASE WHEN c.dkind = 'out' THEN c.dout ELSE NULL END,
    CASE WHEN c.dkind = 'in'
         THEN LEAST(2, GREATEST(0, floor(LEAST(1.0, GREATEST(0.0, c.mdy)) * 6)::int - 3))
         ELSE NULL END,
    CASE WHEN c.dkind = 'in'
         THEN LEAST(2, GREATEST(0, floor(LEAST(1.0, GREATEST(0.0, c.mdx)) * 3)::int))
         ELSE NULL END,
    count(*) AS total,
    count(*) FILTER (WHERE c.recv_won) AS won
  FROM classified c
  GROUP BY 1, 2, 3, 4, 5, 6, 7, 8;
END;
$$;

GRANT EXECUTE ON FUNCTION stats_receive_detail(uuid, uuid, uuid[], smallint) TO authenticated;
