-- ========================================
-- shot-value データベース設計（テーブル変更なし・読み取り専用 RPC 1 本, REQ-401）
-- 実装先: supabase/migrations/{ts}_shot_value_read_function.sql
-- 前例: 20260805150000 (stats_shot_types の scoped/decisive CTE) +
--       20260808140000 (stats_shot_placement の向き正規化・ゾーン化)
-- ========================================

-- grain = (打者, 球種, hand, ゾーン) × 役割カウント。点数化はクライアント（REQ-002/401）。
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
  zone_row int,   -- 0=自陣バック〜p_zones-1=ネット際。NULL=座標なし/向き不明（REQ-101）
  zone_col int,   -- 0=打者視点左。NULL 同上
  n bigint,       -- 総打数（分母）
  kime bigint, yuhatsu bigint, fuseki1 bigint, fuseki2 bigint,
  miss bigint, yurushi1 bigint, yurushi2 bigint
)
LANGUAGE plpgsql SECURITY INVOKER STABLE SET search_path = public
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
      -- REQ-102: end_reason null/unknown は分母にも入れない
      AND r.end_reason IN ('floor', 'body', 'net', 'not_over', 'service_fault')
      -- ※ camera_near_team IS NULL は除外しない（placement と異なる。REQ-101）
      AND (p_match_id IS NULL OR m.id = p_match_id)
      AND (p_group_id IS NULL OR m.group_id = p_group_id)
      AND (p_match_ids IS NULL OR m.id = ANY(p_match_ids))
      AND (p_set_number IS NULL OR s.set_number = p_set_number)
  ),
  seq AS (
    SELECT sh.rally_id, sh.hit_player_id AS pid,
      COALESCE(sh.shot_type, 'unknown') AS stype,  -- REQ-103
      sh.hand AS shand, sh.hit_x AS ox, sh.hit_y AS oy,
      row_number() OVER w AS rn,
      count(*) OVER (PARTITION BY sh.rally_id) AS sc_total,
      sc.point_winner, sc.end_reason, sc.serving_team, sc.cam,
      -- チーム帰属は打順の偶奇（REQ-104: pid null でも位置を消費）
      CASE WHEN row_number() OVER w % 2 = 1 THEN sc.serving_team
           WHEN sc.serving_team = 'A' THEN 'B' ELSE 'A' END AS hitter_team
    FROM shots sh
    JOIN scoped sc ON sc.rally_id = sh.rally_id
    WHERE sh.deleted_at IS NULL
    WINDOW w AS (PARTITION BY sh.rally_id ORDER BY sh.shot_number)
  ),
  kinds AS (
    -- 決着種別（dataflow.md の分岐）。winner_hit_last は最終打の偶奇から
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
      q.sc_total - q.rn AS back  -- 末尾からの距離（0 = 最終打）
    FROM seq q
  ),
  roled AS (
    SELECT k.pid, k.stype, k.shand, k.ox, k.oy, k.cam, k.hitter_team,
      CASE
        WHEN k.kind = 'fault' THEN CASE WHEN k.rn = 1 THEN 'miss' END
        WHEN k.kind = 'ace' THEN CASE k.back
          WHEN 0 THEN 'kime' WHEN 1 THEN 'yurushi1' WHEN 2 THEN 'fuseki1'
          WHEN 3 THEN 'yurushi2' WHEN 4 THEN 'fuseki2' END
        WHEN k.kind = 'miss' THEN CASE k.back
          WHEN 0 THEN 'miss' WHEN 1 THEN 'yuhatsu' WHEN 2 THEN 'yurushi1'
          WHEN 3 THEN 'fuseki1' WHEN 4 THEN 'yurushi2' WHEN 5 THEN 'fuseki2' END
      END AS role
    FROM kinds k
  ),
  zoned AS (
    -- 向き正規化は placement 20260808140000 と同一:
    -- 打者=カメラ手前 → y のみ反転 / 打者=カメラ奥 → x のみ反転。クランプ算入。
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
  WHERE z.pid IS NOT NULL  -- REQ-104: 選手別集計から除外（役割割当は済んでいる）
  GROUP BY z.pid, z.stype, z.shand, z.zr, z.zc;
END;
$$;

GRANT EXECUTE ON FUNCTION stats_shot_value(uuid, uuid, uuid[], smallint, int) TO authenticated;

-- ========================================
-- 設計メモ
-- ========================================
-- 1. x 反転の向きに注意: placement の正規化は「手前 = y のみ / 奥 = x のみ」。
--    zoned CTE の x 分岐（手前 = そのまま / 奥 = 1−x）は 20260808140000 と同じ振り分け。
--    実装時は placement の pairs CTE と目視で一致確認すること。
-- 2. hand フィルタは RPC 引数にしない（grain に含めクライアント絞り込み。
--    stats_shot_types と同方式。placement の p_hand とは方式が異なるが、
--    SV は hand 切替で RPC 再実行しないため grain 持ちが正しい）。
-- 3. 検算例（requirements.md）: ミス決着 5 打 → back=4..0 が
--    yurushi2/fuseki1/yurushi1/yuhatsu/miss。エース決着 5 打 → fuseki2/yurushi2/fuseki1/yurushi1/kime。
--    integration テストで両ケースを固定データで検証する。
