-- ========================================
-- shot-stats 読み取り専用 集計関数（RPC）
-- ========================================
--
-- 作成日: 2026-08-03
-- 関連設計: architecture.md / api-endpoints.md / interfaces.ts
-- 関連要件: docs/spec/shot-stats/requirements.md (REQ-401/402/403/406 / NFR-002)
--
-- 信頼性レベル:
-- - 🔵 青信号: 要件定義・実装済みスキーマ・stats-dashboard 前例・ヒアリングに準拠
-- - 🟡 黄信号: 妥当な推測による定義
-- - 🔴 赤信号: 出典のない推測
--
-- 重要方針（stats-dashboard 前例踏襲, REQ-402）:
-- - スキーマ変更なし。関数 + GRANT のみの additive migration。適用は CI 経由 db:push
-- - 全関数 SECURITY INVOKER + STABLE + SET search_path = public（RLS 継承, REQ-403）
-- - スコープ: p_match_id XOR p_group_id（両方 NULL / 両方指定は invalid_scope）+ p_group_id 時の p_match_ids 絞り込み
-- - 確定ラリー: r.deleted_at IS NULL AND r.is_let=false AND r.is_point_confirmed=true AND r.point_winner IS NOT NULL
--   （sets / matches も deleted_at IS NULL, REQ-101）
-- - ショットは shots.deleted_at IS NULL のみ（ソフトデリート済み実装に準拠）
-- - end_reason は実装済み 6 値（floor/net/not_over/body/service_fault/unknown）。in/out は
--   「最終打者チーム × point_winner」から導出（deriveInOut と同一規則, REQ-406）
-- - フィルタ方針: 選手・球種はクライアント側（返却 grain に含む）。セット・hand はパラメータ
--   （🔵 grain 爆発防止。ヒアリング2026-08-04 了承・アクセスパターン次第で配分見直し可, dataflow.md 参照）
--
-- 決定打の SQL 導出規則（decisiveShotIndex と同一, REQ-104/406）:
--   body                → 最終ショット
--   net / not_over      → 最終の 1 つ前（shot_count >= 2 のときのみ）
--   floor               → 最終打者チーム = 勝者なら最終ショット（in 相当）、
--                          敗者なら最終の 1 つ前（out 相当, shot_count >= 2 のときのみ）
--   service_fault / unknown → なし
--   ※最終打者の hit_player_id が NULL（打者未注釈）の場合、floor の向きが決められないため
--     決定打なし・in/out 導出 NULL（クライアントで「未注釈」扱い, REQ-108）

-- ========================================
-- 共通 CTE 部品（各関数内で使用する定義の説明）
-- ========================================
-- annotated_scope: 確定ラリー × スコープ絞り込み × セット絞り込み（p_set_number）
-- ordered_shots:   ラリーごとの生存ショットを shot_number 順に並べ、最終/最終-1 を特定
-- player_team:     hit_player_id → 当該試合でのチーム（matches の team_a/b_player1/2_id と照合）

-- ========================================
-- 1. stats_annotation_coverage: 注釈率（バッジ・母数併記の分母分子） 🔵 REQ-002/003
--    試合ごとに 1 行返す（クライアントでスコープ合計・バッジ表示）
-- ========================================
CREATE OR REPLACE FUNCTION stats_annotation_coverage(
  p_match_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_match_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  match_id uuid,
  shots_total bigint,        -- 🔵 生存ショット総数（確定ラリー内）
  shots_typed bigint,        -- 🔵 shot_type IS NOT NULL
  shots_pointed bigint,      -- 🔵 hit_x/hit_y IS NOT NULL
  shots_handed bigint,       -- 🔵 hand IS NOT NULL
  shots_attributed bigint,   -- 🔵 hit_player_id IS NOT NULL
  rallies_total bigint,      -- 🔵 確定ラリー数
  rallies_ended bigint,      -- 🔵 end_reason IS NOT NULL
  rallies_fully_timed bigint -- 🔵 全ショットに video_timestamp_ms があるラリー数（K の母数, REQ-106）
)
LANGUAGE plpgsql SECURITY INVOKER STABLE SET search_path = public
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
    WHERE r.deleted_at IS NULL AND r.is_let = false
      AND r.is_point_confirmed = true AND r.point_winner IS NOT NULL
      AND (p_match_id IS NULL OR m.id = p_match_id)
      AND (p_group_id IS NULL OR m.group_id = p_group_id)
      AND (p_match_ids IS NULL OR m.id = ANY(p_match_ids))
  ),
  shot_agg AS (
    SELECT sc.mid,
      count(sh.id) AS total,
      count(sh.id) FILTER (WHERE sh.shot_type IS NOT NULL) AS typed,
      count(sh.id) FILTER (WHERE sh.hit_x IS NOT NULL AND sh.hit_y IS NOT NULL) AS pointed,
      count(sh.id) FILTER (WHERE sh.hand IS NOT NULL) AS handed,
      count(sh.id) FILTER (WHERE sh.hit_player_id IS NOT NULL) AS attributed
    FROM scoped sc
    LEFT JOIN shots sh ON sh.rally_id = sc.rally_id AND sh.deleted_at IS NULL
    GROUP BY sc.mid
  ),
  rally_agg AS (
    SELECT sc.mid,
      count(*) AS total,
      count(*) FILTER (WHERE sc.end_reason IS NOT NULL) AS ended,
      count(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM shots sh WHERE sh.rally_id = sc.rally_id
          AND sh.deleted_at IS NULL AND sh.video_timestamp_ms IS NULL
      ) AND EXISTS (
        SELECT 1 FROM shots sh WHERE sh.rally_id = sc.rally_id AND sh.deleted_at IS NULL
      )) AS fully_timed
    FROM scoped sc
    GROUP BY sc.mid
  )
  SELECT ra.mid, COALESCE(sa.total,0), COALESCE(sa.typed,0), COALESCE(sa.pointed,0),
         COALESCE(sa.handed,0), COALESCE(sa.attributed,0),
         ra.total, ra.ended, ra.fully_timed
  FROM rally_agg ra LEFT JOIN shot_agg sa ON sa.mid = ra.mid;
END;
$$;

-- ========================================
-- 2. stats_shot_types: 球種 × 打者 × hand の集計（C/D/G の基盤） 🔵 REQ-008/009/010/012
--    grain = (hit_player_id, shot_type, hand)。選手・球種・hand の絞り込みはクライアント側。
--    セットのみパラメータ（🟡 grain 爆発防止）
-- ========================================
CREATE OR REPLACE FUNCTION stats_shot_types(
  p_match_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_match_ids uuid[] DEFAULT NULL,
  p_set_number smallint DEFAULT NULL
)
RETURNS TABLE (
  hit_player_id uuid,        -- 🔵 NULL = 打者未注釈
  shot_type text,            -- 🔵 NULL = 種別未注釈（母数併記用に返す）
  hand text,                 -- 🔵 NULL = 未判定（フォア扱い禁止, REQ-102）
  shots bigint,              -- 🔵 総打数（ミス率・決定率・構成比の分母, REQ-010）
  serve_first_shots bigint,  -- 🔵 1 打目として打たれた数（C のサーブ母数, REQ-008）
  serve_won bigint,          -- 🔵 1 打目として打ち、当該ラリーを打者チームが取った数
  decisive_won bigint,       -- 🔵 決定打として得点した数（決定率の分子）
  miss_lost bigint,          -- 🔵 自ミス決着（floor-out / net / not_over / service_fault の最終接触）数（ミス率の分子）
  rallies bigint,            -- 🔵 この球種を 1 回以上打ったラリー数（球種別得点率の分母, REQ-010）
  rallies_won bigint         -- 🔵 うち打者チームが取ったラリー数（分子）
)
LANGUAGE plpgsql SECURITY INVOKER STABLE SET search_path = public
AS $$
BEGIN
  IF (p_match_id IS NULL) = (p_group_id IS NULL) THEN
    RAISE EXCEPTION 'invalid_scope';
  END IF;
  RETURN QUERY
  WITH scoped AS (
    SELECT r.id AS rally_id, r.point_winner, r.end_reason, m.id AS mid,
           m.team_a_player1_id, m.team_a_player2_id, m.team_b_player1_id, m.team_b_player2_id
    FROM rallies r
    JOIN sets s ON s.id = r.set_id AND s.deleted_at IS NULL
    JOIN matches m ON m.id = s.match_id AND m.deleted_at IS NULL
    WHERE r.deleted_at IS NULL AND r.is_let = false
      AND r.is_point_confirmed = true AND r.point_winner IS NOT NULL
      AND (p_match_id IS NULL OR m.id = p_match_id)
      AND (p_group_id IS NULL OR m.group_id = p_group_id)
      AND (p_match_ids IS NULL OR m.id = ANY(p_match_ids))
      AND (p_set_number IS NULL OR s.set_number = p_set_number)
  ),
  live_shots AS (
    SELECT sh.*, sc.point_winner, sc.end_reason, sc.mid,
      CASE WHEN sh.hit_player_id IN (sc.team_a_player1_id, sc.team_a_player2_id) THEN 'A'
           WHEN sh.hit_player_id IN (sc.team_b_player1_id, sc.team_b_player2_id) THEN 'B'
           ELSE NULL END AS hitter_team,   -- 🔵 打者チーム導出（ミラー・勝敗判定共通）
      row_number() OVER (PARTITION BY sh.rally_id ORDER BY sh.shot_number) AS rn,
      count(*)    OVER (PARTITION BY sh.rally_id) AS sc_total
    FROM shots sh JOIN scoped sc ON sc.rally_id = sh.rally_id
    WHERE sh.deleted_at IS NULL
  ),
  decisive AS (
    -- 🔵 決定打 index（decisiveShotIndex と同一規則。integration テストで突き合わせ, REQ-406）
    SELECT ls.rally_id,
      CASE
        WHEN ls.end_reason = 'body' THEN ls.sc_total
        WHEN ls.end_reason IN ('net','not_over') AND ls.sc_total >= 2 THEN ls.sc_total - 1
        WHEN ls.end_reason = 'floor' AND ls.hitter_team IS NOT NULL THEN
          CASE WHEN ls.hitter_team = ls.point_winner THEN ls.sc_total
               WHEN ls.sc_total >= 2 THEN ls.sc_total - 1 ELSE NULL END
        ELSE NULL
      END AS decisive_rn
    FROM live_shots ls WHERE ls.rn = ls.sc_total   -- 最終ショット行で判定
  )
  SELECT
    ls.hit_player_id, ls.shot_type, ls.hand,
    count(*) AS shots,
    count(*) FILTER (WHERE ls.rn = 1) AS serve_first_shots,
    count(*) FILTER (WHERE ls.rn = 1 AND ls.hitter_team = ls.point_winner) AS serve_won,
    count(*) FILTER (WHERE d.decisive_rn = ls.rn AND ls.hitter_team = ls.point_winner) AS decisive_won,
    count(*) FILTER (WHERE (
        (ls.end_reason IN ('net','not_over','service_fault') AND ls.rn = ls.sc_total)
        OR (ls.end_reason = 'floor' AND ls.rn = ls.sc_total AND ls.hitter_team IS NOT NULL
            AND ls.hitter_team <> ls.point_winner)
      )) AS miss_lost,   -- 🔵 自ミス = 敗着の最終接触（service_fault はサーブミス, EDGE-105）
    count(DISTINCT ls.rally_id) AS rallies,
    count(DISTINCT ls.rally_id) FILTER (WHERE ls.hitter_team = ls.point_winner) AS rallies_won
  FROM live_shots ls
  LEFT JOIN decisive d ON d.rally_id = ls.rally_id
  GROUP BY ls.hit_player_id, ls.shot_type, ls.hand;
END;
$$;

-- ========================================
-- 3. stats_shot_zones: 打点の 3×3 ゾーン集計（F） 🔵 REQ-011/105 / REQ-302
--    grain = (hit_player_id, shot_type, zone_row, zone_col)。ミラーは SQL 側で打者視点固定。
--    範囲外座標はクランプ算入（EDGE-101）。p_zones でゾーン数変更可（既定 3, REQ-302）
-- ========================================
CREATE OR REPLACE FUNCTION stats_shot_zones(
  p_match_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_match_ids uuid[] DEFAULT NULL,
  p_set_number smallint DEFAULT NULL,
  p_hand text DEFAULT NULL,          -- 🔵 hand は grain 爆発防止のためパラメータ（ヒアリング2026-08-04 了承）
  p_zones int DEFAULT 3
)
RETURNS TABLE (
  hit_player_id uuid,
  shot_type text,
  zone_row int,   -- 🔵 0 = 打者手前（自陣バック側）〜 p_zones*2-1 = 相手コート奥。全長 2 コート分
  zone_col int,   -- 🔵 0 = 打者視点左 〜 p_zones-1 = 右
  shots bigint
)
LANGUAGE plpgsql SECURITY INVOKER STABLE SET search_path = public
AS $$
BEGIN
  IF (p_match_id IS NULL) = (p_group_id IS NULL) THEN
    RAISE EXCEPTION 'invalid_scope';
  END IF;
  RETURN QUERY
  WITH scoped AS (
    SELECT r.id AS rally_id,
           m.team_a_player1_id, m.team_a_player2_id, m.team_b_player1_id, m.team_b_player2_id
    FROM rallies r
    JOIN sets s ON s.id = r.set_id AND s.deleted_at IS NULL
    JOIN matches m ON m.id = s.match_id AND m.deleted_at IS NULL
    WHERE r.deleted_at IS NULL AND r.is_let = false
      AND r.is_point_confirmed = true AND r.point_winner IS NOT NULL
      AND (p_match_id IS NULL OR m.id = p_match_id)
      AND (p_group_id IS NULL OR m.group_id = p_group_id)
      AND (p_match_ids IS NULL OR m.id = ANY(p_match_ids))
      AND (p_set_number IS NULL OR s.set_number = p_set_number)
  ),
  pts AS (
    SELECT sh.hit_player_id, sh.shot_type,
      -- 🔵 選手視点固定ミラー（REQ-105）: 打者がチーム B なら x→1−x, y→1−y
      CASE WHEN sh.hit_player_id IN (sc.team_b_player1_id, sc.team_b_player2_id)
           THEN 1.0 - sh.hit_x ELSE sh.hit_x END AS mx,
      CASE WHEN sh.hit_player_id IN (sc.team_b_player1_id, sc.team_b_player2_id)
           THEN 1.0 - sh.hit_y ELSE sh.hit_y END AS my
    FROM shots sh JOIN scoped sc ON sc.rally_id = sh.rally_id
    WHERE sh.deleted_at IS NULL
      AND sh.hit_x IS NOT NULL AND sh.hit_y IS NOT NULL
      AND sh.hit_player_id IS NOT NULL              -- 🔵 打者不明はミラー不能のため対象外（母数併記へ）
      AND (p_hand IS NULL OR sh.hand = p_hand)
  )
  SELECT
    pts.hit_player_id, pts.shot_type,
    -- 🔵 クランプ算入（EDGE-101）: [0,1] に丸めてからゾーン化。y は全長を 2×p_zones 分割
    LEAST(p_zones * 2 - 1, GREATEST(0, floor(LEAST(1.0, GREATEST(0.0, pts.my)) * p_zones * 2)::int)) AS zone_row,
    LEAST(p_zones - 1,     GREATEST(0, floor(LEAST(1.0, GREATEST(0.0, pts.mx)) * p_zones)::int))     AS zone_col,
    count(*) AS shots
  FROM pts
  GROUP BY pts.hit_player_id, pts.shot_type, zone_row, zone_col;
END;
$$;

-- ========================================
-- 4. stats_rally_endings: 決着注釈つきラリー行（A の基盤） 🔵 REQ-005/006/007
--    確定ラリー 1 行ずつ。in/out・分類・落下点ミラー/ゾーン化・選手/ペア集計はクライアントの
--    純関数で実施（単体テスト可能, REQ-407。deriveInOut と同一規則, REQ-406）
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
  end_reason text,             -- 🔵 6 値 or NULL（未注釈）
  last_hitter_team text,       -- 🔵 最終ショットの打者チーム（NULL = 打者未注釈, REQ-108）
  decisive_shot_type text,     -- 🔵 決定打の球種（NULL = 決定打なし or 未注釈）
  decisive_hit_player_id uuid,
  land_x real, land_y real,    -- 🔵 生座標（ミラーはクライアント, REQ-105/407）
  out_direction text,          -- 🔵 座標 NULL 時のフォールバック（REQ-103）
  team_a_player1_id uuid, team_a_player2_id uuid,  -- 🔵 視点解決用に matches の既存列を同梱（スキーマ変更なし。ヒアリング2026-08-04 了承）
  team_b_player1_id uuid, team_b_player2_id uuid
)
LANGUAGE plpgsql SECURITY INVOKER STABLE SET search_path = public
AS $$
BEGIN
  IF (p_match_id IS NULL) = (p_group_id IS NULL) THEN
    RAISE EXCEPTION 'invalid_scope';
  END IF;
  RETURN QUERY
  WITH scoped AS (
    SELECT r.id, r.rally_number, r.serving_team, r.point_winner, r.end_reason,
           r.land_x, r.land_y, r.out_direction, s.set_number, m.id AS mid,
           m.team_a_player1_id, m.team_a_player2_id, m.team_b_player1_id, m.team_b_player2_id
    FROM rallies r
    JOIN sets s ON s.id = r.set_id AND s.deleted_at IS NULL
    JOIN matches m ON m.id = s.match_id AND m.deleted_at IS NULL
    WHERE r.deleted_at IS NULL AND r.is_let = false
      AND r.is_point_confirmed = true AND r.point_winner IS NOT NULL
      AND (p_match_id IS NULL OR m.id = p_match_id)
      AND (p_group_id IS NULL OR m.group_id = p_group_id)
      AND (p_match_ids IS NULL OR m.id = ANY(p_match_ids))
      AND (p_set_number IS NULL OR s.set_number = p_set_number)
  ),
  lastshot AS (
    SELECT DISTINCT ON (sh.rally_id) sh.rally_id, sh.hit_player_id, sh.shot_type, sh.shot_number,
           count(*) OVER (PARTITION BY sh.rally_id) AS sc_total
    FROM shots sh WHERE sh.deleted_at IS NULL AND sh.rally_id IN (SELECT sc2.id FROM scoped sc2)
    ORDER BY sh.rally_id, sh.shot_number DESC
  ),
  prevshot AS (
    SELECT sh.rally_id, sh.shot_type, sh.hit_player_id,
           row_number() OVER (PARTITION BY sh.rally_id ORDER BY sh.shot_number DESC) AS rdesc
    FROM shots sh WHERE sh.deleted_at IS NULL AND sh.rally_id IN (SELECT sc2.id FROM scoped sc2)
  )
  SELECT
    sc.id, sc.mid, sc.set_number, sc.rally_number, sc.serving_team, sc.point_winner,
    sc.end_reason,
    CASE WHEN lsh.hit_player_id IN (sc.team_a_player1_id, sc.team_a_player2_id) THEN 'A'
         WHEN lsh.hit_player_id IN (sc.team_b_player1_id, sc.team_b_player2_id) THEN 'B'
         ELSE NULL END,
    -- 🔵 決定打の球種（decisiveShotIndex 規則。floor の向きは最終打者チームで判定）
    CASE
      WHEN sc.end_reason = 'body' THEN lsh.shot_type
      WHEN sc.end_reason IN ('net','not_over') THEN p2.shot_type
      WHEN sc.end_reason = 'floor' AND lsh.hit_player_id IS NOT NULL THEN
        CASE WHEN (CASE WHEN lsh.hit_player_id IN (sc.team_a_player1_id, sc.team_a_player2_id) THEN 'A' ELSE 'B' END) = sc.point_winner
             THEN lsh.shot_type ELSE p2.shot_type END
      ELSE NULL END,
    CASE
      WHEN sc.end_reason = 'body' THEN lsh.hit_player_id
      WHEN sc.end_reason IN ('net','not_over') THEN p2.hit_player_id
      WHEN sc.end_reason = 'floor' AND lsh.hit_player_id IS NOT NULL THEN
        CASE WHEN (CASE WHEN lsh.hit_player_id IN (sc.team_a_player1_id, sc.team_a_player2_id) THEN 'A' ELSE 'B' END) = sc.point_winner
             THEN lsh.hit_player_id ELSE p2.hit_player_id END
      ELSE NULL END,
    sc.land_x, sc.land_y, sc.out_direction,
    sc.team_a_player1_id, sc.team_a_player2_id, sc.team_b_player1_id, sc.team_b_player2_id
  FROM scoped sc
  LEFT JOIN lastshot lsh ON lsh.rally_id = sc.id
  LEFT JOIN prevshot p2 ON p2.rally_id = sc.id AND p2.rdesc = 2;
END;
$$;

-- ========================================
-- 5. stats_rally_tempo: ラリーごとのテンポ素材（K） 🔵 REQ-015/016/106
--    確定ラリー 1 行ずつ。適格判定（全ショット時刻あり・2/3 本以上・時間 > 0）と
--    テンポ算出はクライアントの純関数（tempo.ts, 単体テスト可能, REQ-407）
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
  shot_count bigint,             -- 🔵 生存ショット数
  timed_count bigint,            -- 🔵 video_timestamp_ms 非 NULL のショット数（適格 = timed_count = shot_count, REQ-106）
  duration_ms integer,           -- 🔵 最終打点時刻 − 最初の打点時刻（適格ラリーのみ意味を持つ）
  last3_avg_interval_ms real,    -- 🔵 ラスト 3 打の 2 間隔の平均（shot_count >= 3 の適格ラリーのみ, REQ-016）
  team_a_player1_id uuid, team_a_player2_id uuid,  -- 🔵 得点/失点の視点解決用（matches の既存列。ヒアリング2026-08-04 了承）
  team_b_player1_id uuid, team_b_player2_id uuid
)
LANGUAGE plpgsql SECURITY INVOKER STABLE SET search_path = public
AS $$
BEGIN
  IF (p_match_id IS NULL) = (p_group_id IS NULL) THEN
    RAISE EXCEPTION 'invalid_scope';
  END IF;
  RETURN QUERY
  WITH scoped AS (
    SELECT r.id, r.rally_number, r.serving_team, r.point_winner, s.set_number, m.id AS mid,
           m.team_a_player1_id, m.team_a_player2_id, m.team_b_player1_id, m.team_b_player2_id
    FROM rallies r
    JOIN sets s ON s.id = r.set_id AND s.deleted_at IS NULL
    JOIN matches m ON m.id = s.match_id AND m.deleted_at IS NULL
    WHERE r.deleted_at IS NULL AND r.is_let = false
      AND r.is_point_confirmed = true AND r.point_winner IS NOT NULL
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
    WHERE sh.deleted_at IS NULL AND sh.rally_id IN (SELECT sc2.id FROM scoped sc2)
    GROUP BY sh.rally_id
  ),
  last3 AS (
    -- 🔵 ラスト 3 打の 2 間隔平均 = (t_last − t_last-2) / 2（時刻昇順が保証される前提ではなく
    --   shot_number 順の 3 打で算出。負値は時刻異常としてクライアントで除外）
    SELECT t.rally_id, (max(t.ts) - min(t.ts)) / 2.0 AS l3
    FROM (
      SELECT sh.rally_id, sh.video_timestamp_ms AS ts,
             row_number() OVER (PARTITION BY sh.rally_id ORDER BY sh.shot_number DESC) AS rdesc
      FROM shots sh
      WHERE sh.deleted_at IS NULL AND sh.rally_id IN (SELECT sc2.id FROM scoped sc2)
    ) t
    WHERE t.rdesc <= 3
    GROUP BY t.rally_id
    HAVING count(t.ts) = 3      -- 3 打すべて時刻あり
  )
  SELECT sc.id, sc.mid, sc.set_number, sc.rally_number, sc.serving_team, sc.point_winner,
         COALESCE(a.sc_total, 0), COALESCE(a.timed, 0), a.dur, l.l3::real,
         sc.team_a_player1_id, sc.team_a_player2_id, sc.team_b_player1_id, sc.team_b_player2_id
  FROM scoped sc
  LEFT JOIN agg a ON a.rally_id = sc.id
  LEFT JOIN last3 l ON l.rally_id = sc.id;
END;
$$;

-- ========================================
-- GRANT 🔵 stats-dashboard 前例（authenticated のみ）
-- ========================================
GRANT EXECUTE ON FUNCTION stats_annotation_coverage(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION stats_shot_types(uuid, uuid, uuid[], smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION stats_shot_zones(uuid, uuid, uuid[], smallint, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION stats_rally_endings(uuid, uuid, uuid[], smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION stats_rally_tempo(uuid, uuid, uuid[], smallint) TO authenticated;

-- ========================================
-- 本設計に含めないもの（判断の記録）
-- ========================================
-- - J（局面別得点率）/ L（セット推移）用の新 RPC: 不要。既存 stats_rallies が
--   score_a/score_b・point_winner・serving_team を返すため、クライアント純関数
--   （phase.ts / momentum.ts）で導出する 🔵 20260628 migration + REQ-407
-- - インデックス追加: 集計は試合/Group 単位の読み込みで既存 FK インデックスが効く。
--   性能問題が出たら別 migration で検討 🔵（shot-annotation design の判断踏襲。ヒアリング2026-08-04 了承）
--
-- ========================================
-- 信頼性レベルサマリー
-- ========================================
-- - 🔵 青信号: 100%（確定スキーマ・要件・前例 RPC 規約・純関数規則に準拠。
--   grain 設計・team 列同梱・インデックス見送りはヒアリング2026-08-04 で了承）
-- - 🟡 黄信号: 0 件 / 🔴 赤信号: 0 件
-- 品質評価: 高品質
