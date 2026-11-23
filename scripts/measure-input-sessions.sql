-- 1 つの試合について、入力作業の区切り (セッション) ごとの時間を出す (読み取り専用)。
-- scripts/measure-input-time.sql の内訳版。Supabase Dashboard の SQL Editor で実行する。
-- 先頭の match_name を対象の試合名に置き換える。
--
-- 出る行: 作業の区切りごとに、種類、開始、終了、長さ (分)、その間に触った行数。
--         3 分以上あいたところで区切る。
--   record       = 打刻 (ショット行の作成)
--   rally_update = ラリー行の更新 = 決まり方パス
--   shot_update  = ショット行の更新 = 最後に行ったパス (打点 → 種別の順なら種別パス)
-- ショット行は最後に更新したパスの時刻しか残らない。先に行ったパスの時間は出ない。
-- 作成から 1 時間以上あとの更新だけを注釈とみなす (打刻中の修正を除く)。

WITH target AS (
  SELECT id AS match_id FROM matches
  WHERE name = '<試合名をここに>' AND deleted_at IS NULL
),
live AS (
  SELECT
    r.id AS rally_id,
    r.updated_at AS rally_updated_at,
    r.created_at AS rally_created_at,
    sh.created_at,
    sh.updated_at
  FROM target t
  JOIN sets s ON s.match_id = t.match_id AND s.deleted_at IS NULL
  JOIN rallies r ON r.set_id = s.id AND r.deleted_at IS NULL
  JOIN shots sh ON sh.rally_id = r.id AND sh.deleted_at IS NULL
),
events AS (
  SELECT 'record' AS kind, created_at AS at FROM live
  UNION ALL
  SELECT 'shot_update', updated_at FROM live WHERE updated_at > created_at + interval '1 hour'
  UNION ALL
  SELECT DISTINCT 'rally_update', rally_updated_at FROM live WHERE rally_updated_at > rally_created_at + interval '1 hour'
),
marked AS (
  SELECT
    kind,
    at,
    CASE
      WHEN at - lag(at) OVER (PARTITION BY kind ORDER BY at) > interval '3 minutes'
        OR lag(at) OVER (PARTITION BY kind ORDER BY at) IS NULL
      THEN 1 ELSE 0
    END AS starts_session
  FROM events
),
sessions AS (
  SELECT kind, at, sum(starts_session) OVER (PARTITION BY kind ORDER BY at) AS session_no
  FROM marked
)
SELECT
  kind,
  session_no,
  min(at) AT TIME ZONE 'Asia/Tokyo' AS started,
  max(at) AT TIME ZONE 'Asia/Tokyo' AS ended,
  round((extract(epoch FROM max(at) - min(at)) / 60.0)::numeric, 1) AS minutes,
  count(*) AS rows_touched
FROM sessions
GROUP BY kind, session_no
ORDER BY kind, session_no;
