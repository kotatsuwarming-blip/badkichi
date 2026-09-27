-- ========================================
-- レガシー種別 'lob' / 'clear' を語彙から撤去 (ドッグフーディング 2026-08-05)
-- ========================================
--
-- lob/clear 分割後の振り分けが完了し、旧ドッグフーディング試合も削除されたため、
-- CHECK 制約から旧値を落として 18種に確定する。残存行 (削除済み試合の行 +
-- オリジナルの初期注釈 3行) は未入力 (NULL) に戻す (ユーザー確認済み 2026-08-05)。

UPDATE shots SET shot_type = NULL WHERE shot_type IN ('lob', 'clear');

ALTER TABLE shots DROP CONSTRAINT shots_shot_type_check;

ALTER TABLE shots ADD CONSTRAINT shots_shot_type_check CHECK (shot_type IN (
  'serve_short', 'serve_long', 'serve_drive',
  'clear_high', 'clear_driven', 'smash', 'cut', 'reverse_cut', 'drop',
  'hairpin', 'lob_high', 'lob_low', 'push', 'half',
  'drive',
  'receive_long', 'receive_drive', 'receive_short',
  'unknown'
));
