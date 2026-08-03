-- ========================================
-- shot_type に 'unknown' を追加 (ドッグフーディング 2026-08-03)
-- ========================================
--
-- ラケットに当たってもちゃんと飛ばない場合など、種別が判定できないショットがある。
-- 「不明」を明示的に選べるようにする (null = 未入力 と区別する)。

ALTER TABLE shots DROP CONSTRAINT shots_shot_type_check;

ALTER TABLE shots ADD CONSTRAINT shots_shot_type_check CHECK (shot_type IN (
  'serve_short', 'serve_long', 'serve_drive',
  'clear', 'smash', 'cut', 'reverse_cut', 'drop',
  'hairpin', 'lob', 'push', 'half',
  'drive',
  'receive_long', 'receive_drive', 'receive_short',
  'unknown'
));
