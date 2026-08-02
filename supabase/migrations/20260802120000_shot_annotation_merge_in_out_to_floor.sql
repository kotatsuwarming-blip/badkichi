-- ========================================
-- shot-annotation: end_reason の in/out を floor へ統合
-- ========================================
--
-- 関連: docs/spec/shot-annotation/interview-record.md Q14 (ドッグフーディング 2026-08-02)
-- 背景: 決着ループを見ても in/out は動画から判定できない (PRD 注記どおり)。
--       一方「ネットを越えて床に落ちた (floor)」は客観判定でき、in/out は
--       最終接触者 + point_winner (ライブ記録の実測値) から機械的に導出できる:
--         最終接触者 = 勝者 → in / 最終接触者 = 敗者 → out
--       よって人間には floor だけを入力させ、in/out・side/back は集計時導出とする。
--
-- 既存データ: in/out の注釈は floor へ変換 (導出で再現可能なため情報損失なし)。
--             落下点座標 (land_x/y) はそのまま有効。

UPDATE rallies SET end_reason = 'floor' WHERE end_reason IN ('in', 'out');

ALTER TABLE rallies DROP CONSTRAINT rallies_end_reason_check;
ALTER TABLE rallies ADD CONSTRAINT rallies_end_reason_check CHECK (end_reason IN (
  'floor', 'net', 'not_over', 'body', 'service_fault', 'unknown'
));
