-- ========================================
-- singles-support additive migration
-- ========================================
--
-- 作成日: 2026-08-28
-- 実体: supabase/migrations/20260828120000_singles_match_type.sql
-- 関連設計: architecture.md
-- 関連要件: docs/spec/singles-support/requirements.md (REQ-001 / REQ-003 / REQ-401〜404)
--
-- 方針:
-- - additive のみ (ADD COLUMN / DROP NOT NULL / CHECK 再定義 / 関数 CREATE OR REPLACE)。
--   既存行はすべて match_type='doubles' のまま挙動不変 (REQ-203)。
-- - RLS 変更なし (matches_* は group_id ベース、NFR-101)。
-- - set_player_positions / rallies / shots / position_overrides は変更しない。
--   singles の立ち位置は「各チーム right の 1 行」で表現し、読み出し側 (createInitialState) が補完する。
-- - 適用は CI 経由 (migrate-dev.yml / migrate-prd.yml、REQ-407)。

-- ---------- matches ----------

-- 🔵 対戦形式。既定 doubles で既存行と後方互換
ALTER TABLE matches
  ADD COLUMN match_type text NOT NULL DEFAULT 'doubles'
    CHECK (match_type IN ('singles', 'doubles'));

-- 🔵 singles では player2 が存在しない
ALTER TABLE matches
  ALTER COLUMN team_a_player2_id DROP NOT NULL,
  ALTER COLUMN team_b_player2_id DROP NOT NULL;

-- 🔵 形式と player2 列の整合 (REQ-402)
ALTER TABLE matches
  ADD CONSTRAINT matches_match_type_players_check CHECK (
    (match_type = 'singles' AND team_a_player2_id IS NULL AND team_b_player2_id IS NULL)
    OR
    (match_type = 'doubles' AND team_a_player2_id IS NOT NULL AND team_b_player2_id IS NOT NULL)
  );

-- 🔵 全員別人 (NULL 対応版、REQ-403)。
-- 旧 6-way 不等号 (a1<>a2 AND a1<>b1 AND ...) は a2 が NULL だと式全体が NULL になり
-- CHECK を通過してしまう (a1=b1 を検出できない)。NULL 列を明示的に除いて再定義する。
ALTER TABLE matches DROP CONSTRAINT matches_players_distinct_check;
ALTER TABLE matches
  ADD CONSTRAINT matches_players_distinct_check CHECK (
    team_a_player1_id <> team_b_player1_id
    AND (team_a_player2_id IS NULL
         OR (team_a_player2_id <> team_a_player1_id AND team_a_player2_id <> team_b_player1_id))
    AND (team_b_player2_id IS NULL
         OR (team_b_player2_id <> team_a_player1_id AND team_b_player2_id <> team_b_player1_id))
    AND (team_a_player2_id IS NULL OR team_b_player2_id IS NULL
         OR team_a_player2_id <> team_b_player2_id)
  );

-- 複合 FK (group_id, team_*_player2_id) → players(group_id, id) は MATCH SIMPLE のため
-- player2 が NULL なら参照検査をスキップする。変更不要。

-- ---------- stats_pair_rates: シングルス試合を除外 (REQ-404) ----------
-- LEAST/GREATEST は NULL を無視するため、player2 NULL の試合から (p1, p1) の偽ペアが生まれる。
-- match_pairs CTE で player2 IS NOT NULL の試合だけを対象にする。関数本体は他に変更しない
-- (最新版 20260808180000_stats_dashboard_set_filter.sql のシグネチャ・出力列を維持)。
CREATE OR REPLACE FUNCTION stats_pair_rates(
  p_match_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_match_ids uuid[] DEFAULT NULL,
  p_set_number int DEFAULT NULL
)
RETURNS TABLE (
  player1_id uuid,
  player2_id uuid,
  serve_total bigint,
  serve_won bigint,
  receive_total bigint,
  receive_won bigint
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
  WITH match_pairs AS (
    SELECT m.id AS match_id, 'A'::text AS team,
           LEAST(m.team_a_player1_id, m.team_a_player2_id) AS p1,
           GREATEST(m.team_a_player1_id, m.team_a_player2_id) AS p2
    FROM matches m
    WHERE m.deleted_at IS NULL AND m.team_a_player2_id IS NOT NULL   -- 🔵 追加
    UNION ALL
    SELECT m.id, 'B'::text,
           LEAST(m.team_b_player1_id, m.team_b_player2_id),
           GREATEST(m.team_b_player1_id, m.team_b_player2_id)
    FROM matches m
    WHERE m.deleted_at IS NULL AND m.team_b_player2_id IS NOT NULL   -- 🔵 追加
  ),
  confirmed AS (
    SELECT s.match_id, r.serving_team, r.point_winner
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
  serve AS (
    SELECT mp.p1, mp.p2, count(*) AS total,
           count(*) FILTER (WHERE c.point_winner = c.serving_team) AS won
    FROM confirmed c JOIN match_pairs mp ON mp.match_id = c.match_id AND mp.team = c.serving_team
    GROUP BY mp.p1, mp.p2
  ),
  receive AS (
    SELECT mp.p1, mp.p2, count(*) AS total,
           count(*) FILTER (WHERE c.point_winner <> c.serving_team) AS won
    FROM confirmed c JOIN match_pairs mp ON mp.match_id = c.match_id AND mp.team <> c.serving_team
    GROUP BY mp.p1, mp.p2
  )
  SELECT COALESCE(sv.p1, rc.p1), COALESCE(sv.p2, rc.p2), COALESCE(sv.total, 0), COALESCE(sv.won, 0),
         COALESCE(rc.total, 0), COALESCE(rc.won, 0)
  FROM serve sv FULL OUTER JOIN receive rc ON rc.p1 = sv.p1 AND rc.p2 = sv.p2;
END;
$$;

-- ---------- 変更しない関数 (根拠メモ) ----------
-- stats_shot_types / stats_shot_zones / stats_shot_placement* / stats_rally_endings / stats_rally_tempo /
-- stats_serve_types / stats_receive_types:
--   打者チーム解決 `CASE WHEN sh.hit_player_id IN (sc.a1, sc.a2) THEN 'A' WHEN ... IN (sc.b1, sc.b2) THEN 'B' END`
--   は a2 = NULL のとき「a1 と一致 → true / 不一致 → NULL (偽扱い)」となり次の WHEN へ落ちるため正しい。
--   出力列 team_*_player2_id は NULL を返す (クライアント側で null 除外、interfaces.ts TeamPlayerColumnsDiff)。
-- stats_rallies の p_pair_player1_id / p_pair_player2_id フィルタ:
--   ユーザーが選ぶペアは相異 2 名なので、singles 試合の (p1, p1) と一致することはない。変更不要。
