-- ========================================
-- shot_type の clear を clear_high / clear_driven に分割 (ドッグフーディング 2026-08-05)
-- ========================================
--
-- クリアは守備的なハイクリア (高く深く) と攻撃的なドリブンクリア (低く速く) で
-- 戦術的意味が異なるため分割する。既存の 'clear' 行はユーザーが手で振り分けるまで
-- レガシー値として許容し続ける (パレットからは撤去)。lob 分割 (20260805120000) と同じ方針。

ALTER TABLE shots DROP CONSTRAINT shots_shot_type_check;

ALTER TABLE shots ADD CONSTRAINT shots_shot_type_check CHECK (shot_type IN (
  'serve_short', 'serve_long', 'serve_drive',
  'clear_high', 'clear_driven', 'smash', 'cut', 'reverse_cut', 'drop',
  'hairpin', 'lob_high', 'lob_low', 'push', 'half',
  'drive',
  'receive_long', 'receive_drive', 'receive_short',
  'unknown',
  'lob', 'clear' -- レガシー (分割前の既存データ)
));
