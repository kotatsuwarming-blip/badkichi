-- ========================================
-- YouTube の目視タップ時刻も annotated_timestamp_ms に保存 (ドッグフーディング 2026-08-03)
-- ========================================
--
-- REQ-101 は「YouTube はフレーム精度が保証できないため annotated を保存しない」だったが、
-- 0.5x スロー再生中の目視タップ (体感 ±100〜300ms) はラリー展開速度の分析に使える。
-- 精度区分を別列で持ち、フレーム精度 (ローカル) と概算 (YouTube) を区別する。
--   frame  = ローカル動画でフレームを目視確認して確定した時刻
--   approx = YouTube スロー再生中の打点タップ時点のプレーヤー時刻 (概算)

ALTER TABLE shots ADD COLUMN annotated_timestamp_precision text
  CHECK (annotated_timestamp_precision IN ('frame', 'approx'));

-- 既存の annotated はすべてローカルのフレーム確定 (旧仕様では YouTube は非保存)
UPDATE shots SET annotated_timestamp_precision = 'frame'
  WHERE annotated_timestamp_ms IS NOT NULL AND deleted_at IS NULL;
