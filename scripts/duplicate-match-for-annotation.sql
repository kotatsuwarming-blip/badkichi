-- ========================================
-- 試合の複製 (注釈なしコピー) — 再アノテーション用
-- ========================================
--
-- 用途: ドッグフーディングで注釈済みの試合を「注釈前の状態」でもう一度やり直すため、
--       ライブ記録データ (sets / rallies / shots / position_overrides) だけをコピーした
--       新しい試合を作る。注釈列 (shot_type / hit_* / end_reason / land_* 等) はコピーしない。
--
-- 使い方:
--   1. Supabase Dashboard (対象環境のプロジェクト) → SQL Editor で実行
--   2. 下の src_match_id を複製したい試合の id に書き換える
--      (試合の id はアプリの URL /groups/{gid}/matches/{ここ}/... で確認できる)
--   3. 実行すると「(再アノテーション用)」付きの試合が同グループに作られる
--
-- 注意:
--   - Dashboard からの実行は RLS をバイパスする (service ロール)。実行環境の選択に注意
--   - スタジオでショット挿入/削除を行った後の場合、その構造変更はコピーに引き継がれる
--     (完全な「ライブ記録直後」には戻せない。注釈列だけが null になる)

DO $$
DECLARE
  src_match_id constant uuid := '00000000-0000-0000-0000-000000000000'; -- ★ここを書き換え
  new_match_id uuid;
  src_set record;
  new_set_id uuid;
  src_rally record;
  new_rally_id uuid;
BEGIN
  INSERT INTO matches (
    group_id, team_a_player1_id, team_a_player2_id, team_b_player1_id, team_b_player2_id,
    video_source_type, video_source_url, name, match_date, completed_at
  )
  SELECT
    group_id, team_a_player1_id, team_a_player2_id, team_b_player1_id, team_b_player2_id,
    video_source_type, video_source_url,
    coalesce(name, '無題') || ' (再アノテーション用)', match_date, completed_at
  FROM matches
  WHERE id = src_match_id AND deleted_at IS NULL
  RETURNING id INTO new_match_id;

  IF new_match_id IS NULL THEN
    RAISE EXCEPTION 'source match not found: %', src_match_id;
  END IF;

  FOR src_set IN
    SELECT * FROM sets WHERE match_id = src_match_id AND deleted_at IS NULL ORDER BY set_number
  LOOP
    INSERT INTO sets (
      match_id, set_number, target_points, enable_deuce, deuce_point_cap,
      first_serving_team, camera_near_team_at_start, winner
    ) VALUES (
      new_match_id, src_set.set_number, src_set.target_points, src_set.enable_deuce,
      src_set.deuce_point_cap, src_set.first_serving_team,
      src_set.camera_near_team_at_start, src_set.winner
    )
    RETURNING id INTO new_set_id;

    INSERT INTO set_player_positions (set_id, player_id, team, position)
    SELECT new_set_id, player_id, team, position
    FROM set_player_positions
    WHERE set_id = src_set.id AND deleted_at IS NULL;

    FOR src_rally IN
      SELECT * FROM rallies WHERE set_id = src_set.id AND deleted_at IS NULL ORDER BY rally_number
    LOOP
      INSERT INTO rallies (
        set_id, rally_number, serving_team, server_position, server_player_id,
        receiver_player_id, camera_near_team, video_start_timestamp_ms,
        point_winner, is_let, is_point_confirmed
      ) VALUES (
        new_set_id, src_rally.rally_number, src_rally.serving_team, src_rally.server_position,
        src_rally.server_player_id, src_rally.receiver_player_id, src_rally.camera_near_team,
        src_rally.video_start_timestamp_ms, src_rally.point_winner, src_rally.is_let,
        src_rally.is_point_confirmed
      )
      RETURNING id INTO new_rally_id;

      INSERT INTO shots (rally_id, shot_number, video_timestamp_ms, input_source)
      SELECT new_rally_id, shot_number, video_timestamp_ms, input_source
      FROM shots
      WHERE rally_id = src_rally.id AND deleted_at IS NULL
      ORDER BY shot_number;

      INSERT INTO position_overrides (rally_id, team, override_type)
      SELECT new_rally_id, team, override_type
      FROM position_overrides
      WHERE rally_id = src_rally.id AND deleted_at IS NULL;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'created annotation-free copy: matches.id = %', new_match_id;
END $$;
