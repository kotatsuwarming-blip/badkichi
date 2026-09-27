-- ========================================
-- ショット削除の論理削除化 (ドッグフーディング 2026-08-03)
-- ========================================
--
-- アノテーションスタジオの「ショット削除」を物理削除から deleted_at の UPDATE に変更する。
-- 誤削除でライブ記録の押下時刻 (video_timestamp_ms) が失われ、復元不能になるため。
--
-- 論理削除行が shot_number を保持したまま残るので、UNIQUE (rally_id, shot_number) の
-- ままだと削除後の -1 renumber が削除行の番号と衝突する。live 行 (deleted_at IS NULL)
-- だけの部分ユニークインデックスに張り替える。

ALTER TABLE shots DROP CONSTRAINT shots_rally_id_shot_number_key;

CREATE UNIQUE INDEX shots_rally_id_shot_number_live_key
  ON shots (rally_id, shot_number)
  WHERE deleted_at IS NULL;
