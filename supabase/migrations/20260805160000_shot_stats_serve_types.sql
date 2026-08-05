-- ========================================
-- shot-stats: サーブ種別分析用 RPC（C 探針, REQ-008）
-- ========================================
--
-- 作成日: 2026-08-05
-- 関連設計: docs/design/shot-stats/ / 関連タスク: TASK-0011
--
-- stats_shot_types の grain には rallies.server_position が含まれないため、
-- 「サーブ種別 × 右/左ポジション」の絞り込み（REQ-008、stats-dashboard REQ-014 と同形式）
-- 用に 1 打目専用の集計を additive に追加する。
-- サーバーの同定はライブ記録の rallies.server_player_id（NOT NULL）を正とし、
-- サーブ種別は 1 打目ショットの注釈 shot_type（NULL = 未注釈）を用いる。

CREATE OR REPLACE FUNCTION stats_serve_types(
  p_match_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_match_ids uuid[] DEFAULT NULL,
  p_set_number smallint DEFAULT NULL
)
RETURNS TABLE (
  server_player_id uuid,
  shot_type text,        -- 1 打目の注釈（NULL = 未注釈。母数併記用に返す）
  server_position text,  -- 'right' | 'left'
  total bigint,
  won bigint             -- サーブ側チームが当該ラリーを取った数
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
    SELECT r.id AS rid, r.server_player_id AS spid, r.server_position AS spos,
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
  firstshot AS (
    SELECT DISTINCT ON (sh.rally_id) sh.rally_id, sh.shot_type AS stype
    FROM shots sh
    WHERE sh.deleted_at IS NULL
      AND sh.rally_id IN (SELECT sc2.rid FROM scoped sc2)
    ORDER BY sh.rally_id, sh.shot_number ASC
  )
  SELECT
    sc.spid,
    f.stype,
    sc.spos,
    count(*) AS total,
    count(*) FILTER (WHERE sc.point_winner = sc.serving_team) AS won
  FROM scoped sc
  LEFT JOIN firstshot f ON f.rally_id = sc.rid
  GROUP BY sc.spid, f.stype, sc.spos;
END;
$$;

GRANT EXECUTE ON FUNCTION stats_serve_types(uuid, uuid, uuid[], smallint) TO authenticated;
