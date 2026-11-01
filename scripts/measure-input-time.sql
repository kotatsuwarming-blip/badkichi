-- 入力にかかった時間を、行の作成時刻・更新時刻から試合ごとに概算する (読み取り専用)。
-- Supabase Dashboard の SQL Editor で実行する。データは変更しない。
--
-- 出る数字:
--   video_span_min      動画上の試合の長さ (最初の打刻から最後の打刻まで)
--   play_min            実プレー時間 (各ラリーの最初の打刻から最後の打刻までの合計)
--   record_min          打刻 (ライブ記録) にかかった時間
--   annotate_min        注釈にかかった時間。各行を最後に更新したパスの分しか数えられないため、下限値
--   record_x / annotate_x  動画上の試合の長さに対する倍率
--
-- 数え方: 行の時刻を試合ごとに並べ、前の行との間隔が 3 分以内のものだけを合計する
--         (3 分を超える間隔は休憩や別の日の作業とみなして除く)。
--         作業の区切りごとの内訳は scripts/measure-input-sessions.sql で見る。
-- 制約:
--   - scripts/duplicate-match-for-annotation.sql で複製した試合は、作成時刻が複製の時刻に
--     そろうため record_min が 0 になる。打刻の時間は複製元の試合で見る。
--   - 同じ行を複数のパス (種別 → 打点) で更新すると、前のパスの時刻は上書きされて残らない。
--     パスごとの正確な時間は、作業中に手元で測るか、計測機能 (BL-020) を待つ。

WITH live AS (
  SELECT
    m.id AS match_id,
    m.name AS match_name,
    m.match_date,
    r.id AS rally_id,
    r.updated_at AS rally_updated_at,
    r.created_at AS rally_created_at,
    sh.id AS shot_id,
    sh.video_timestamp_ms,
    sh.created_at,
    sh.updated_at,
    sh.shot_type,
    sh.hit_x
  FROM matches m
  JOIN sets s ON s.match_id = m.id AND s.deleted_at IS NULL
  JOIN rallies r ON r.set_id = s.id AND r.deleted_at IS NULL AND r.is_let = false
  JOIN shots sh ON sh.rally_id = r.id AND sh.deleted_at IS NULL
  WHERE m.deleted_at IS NULL
),
volume AS (
  SELECT
    match_id,
    min(match_name) AS match_name,
    min(match_date) AS match_date,
    count(DISTINCT rally_id) AS rallies,
    count(*) AS shots,
    count(shot_type) AS shots_with_type,
    count(hit_x) AS shots_with_position,
    (max(video_timestamp_ms) - min(video_timestamp_ms)) / 60000.0 AS video_span_min
  FROM live
  GROUP BY match_id
),
play AS (
  SELECT match_id, sum(span_ms) / 60000.0 AS play_min
  FROM (
    SELECT match_id, rally_id, max(video_timestamp_ms) - min(video_timestamp_ms) AS span_ms
    FROM live
    GROUP BY match_id, rally_id
  ) per_rally
  GROUP BY match_id
),
events AS (
  -- 打刻: ショット行の作成
  SELECT match_id, 'record' AS kind, created_at AS at FROM live
  UNION ALL
  -- 注釈: 作成から 1 時間以上あとに更新されたショット行 (打刻中の修正は含めない。
  --       注釈中にショットを挿入すると作成時刻が後ろにずれるため、「打刻の終了時刻」では区切らない)
  SELECT match_id, 'annotate', updated_at FROM live
  WHERE updated_at > created_at + interval '1 hour'
  UNION ALL
  -- 注釈: 作成から 1 時間以上あとに更新されたラリー行 (決まり方)
  SELECT DISTINCT match_id, 'annotate', rally_updated_at FROM live
  WHERE rally_updated_at > rally_created_at + interval '1 hour'
),
gaps AS (
  SELECT
    match_id,
    kind,
    at - lag(at) OVER (PARTITION BY match_id, kind ORDER BY at) AS gap
  FROM events
),
work AS (
  SELECT
    match_id,
    sum(extract(epoch FROM gap)) FILTER (WHERE kind = 'record' AND gap <= interval '3 minutes') / 60.0 AS record_min,
    sum(extract(epoch FROM gap)) FILTER (WHERE kind = 'annotate' AND gap <= interval '3 minutes') / 60.0 AS annotate_min
  FROM gaps
  GROUP BY match_id
)
SELECT
  v.match_date,
  v.match_name,
  v.rallies,
  v.shots,
  v.shots_with_type,
  v.shots_with_position,
  round(v.video_span_min::numeric, 1) AS video_span_min,
  round(p.play_min::numeric, 1) AS play_min,
  round(w.record_min::numeric, 1) AS record_min,
  round(w.annotate_min::numeric, 1) AS annotate_min,
  round((w.record_min / nullif(v.video_span_min, 0))::numeric, 2) AS record_x,
  round((w.annotate_min / nullif(v.video_span_min, 0))::numeric, 2) AS annotate_x
FROM volume v
JOIN play p USING (match_id)
LEFT JOIN work w USING (match_id)
ORDER BY v.match_date DESC, v.match_name;
