# ai-draft-loop 受け入れ基準

各基準は要件 ID に対応する。検証は unit（純関数）/ integration（Supabase dev）/ manual（dev サーバーで操作）のいずれか。

## 二層スキーマ

- AC-001 (REQ-001/002, integration): `ai_predictions` と `human_resolutions` に INSERT できる。グループのメンバーとして UPDATE / DELETE を試みると RLS で拒否される。service role 以外からの `ai_predictions` INSERT は拒否される
- AC-002 (REQ-003, unit): 予測 1 件に対し、確定なし → draft、confirmed → confirmed、corrected → corrected、rejected → corrected 扱いで現在の値 null、を導出関数が返す。同じ項目に予測が 2 版あるとき、最新版に対する確定だけを見る
- AC-003 (REQ-004, integration): 確定を書くと、shots / rallies の該当列が確定の値になり、`annotation_source` は `ai` のまま、`ai_model_version` は採用中の予測の版のまま
- AC-004 (REQ-005, integration): ラリーの一括確認で、そのラリーの未確定の全項目に confirmed が 1 行ずつ入り、既に確定済みの項目には入らない。一括却下で rejected が入り、現在の値が null になる

## 取り込み

- AC-005 (REQ-006, integration): 下書き JSON を 2 回取り込んでも `ai_predictions` の件数は 1 回分。batch_id が同じで input_hash が違うと拒否される（EDGE-004）
- AC-006 (REQ-007/101, integration): 確定済みの項目に新しい版の予測を取り込むと、予測は追記されるが現在の値は変わらない。未確定の項目は新しい版の値になる
- AC-007 (REQ-008, integration): rallies / shots の行が無い試合に予測を取り込むと、`start_ms` / `end_ms` / `timestamp_ms` から行が生成され、`annotation_source = 'ai'` になる
- AC-008 (REQ-009, manual): 試合一覧に下書き状態と版が表示され、取り込み後に imported、確認開始で in_review、全ラリー確定で reviewed に変わる
- AC-009 (REQ-102, integration): 却下済みのラリーに再取り込みしても現在の値は null のまま。却下を取り消すと最新の予測が反映される
- AC-010 (EDGE-001, integration): 存在しない target_id を含む JSON は、その行だけスキップされ、スキップ件数が結果に含まれる

## 確認画面

- AC-011 (REQ-010, manual): 確認モードでラリーを選ぶと、該当区間が再生され、ラリー属性とショット列の現在の値・状態・確信度が一画面に出る
- AC-012 (REQ-011, manual): 1 キーで一括確認が実行され、次の未確認ラリーへ移動する。全項目確定済みのラリーでは何も書かれず移動だけする（EDGE-005）
- AC-013 (REQ-012, manual): 一括却下の後、そのラリーを既存の決まり方 / 種別 / 打点パスで入力できる
- AC-014 (REQ-013, manual): 球種と打者はキーで、時刻はフレーム送りで、座標はコート図またはドラッグで訂正でき、確定は 1 操作
- AC-015 (REQ-014, manual): 確信度 0.6 未満の項目が視覚的に区別され、キーでそこへ移動できる。score が null の項目も同じ扱い（EDGE-003）
- AC-016 (REQ-015, manual): 確認モードのキーが既存モードのキーと衝突しない。キー一覧が画面内で見られる
- AC-017 (REQ-104, manual): 下書きの無い試合で確認モードを開くと「下書きがありません」が出て、既存 3 モードは従来どおり動く

## 作業時間

- AC-018 (REQ-016, unit + integration): 項目が操作対象になってから確定までの時間が `lead_time_ms` に入る。一括確認ではラリー属性に経過時間、ショットに 0 が入る
- AC-019 (REQ-017 / EDGE-002, unit): 60 秒を超える無操作区間とタブ非表示の区間は `lead_time_ms` に含まれない
- AC-020 (REQ-018, integration): 試合ごとの作業時間の SQL 関数が、合計・項目別・kind 別・確定件数を返す

## 書き出し

- AC-021 (REQ-019, integration): 下書きを初めて取り込む試合の 5 件目ごとに `eval_holdout = true` が付く。手で切り替えられる。5 件未満では付かない（EDGE-006）
- AC-022 (REQ-020, integration): 学習用の書き出しに、`eval_holdout = true` の試合の行と、確定の無い予測が含まれない。各行に元予測の値・版・kind がある
- AC-023 (REQ-021, integration): 評価用の書き出しに、`eval_holdout = true` の試合の確定済みの現在の値だけが含まれる
- AC-024 (REQ-022, unit): 同意除外の引数が受け付けられ、同意列が無い段階では無視される

## 統計

- AC-025 (REQ-023, manual): 注釈を使う各チャートに「未確認 n / N」が出て、確認を進めると減る
- AC-026 (REQ-024, manual): 未確認が 50% を超えるチャートに注意表示が出る

## 非機能

- AC-027 (NFR-001, manual): 作者の試合 1 ゲームで、訂正の `lead_time_ms` 中央値が 5 秒以内、一括確認が 1 秒以内
- AC-028 (NFR-002, integration): 720 打・112 ラリーの JSON の取り込みが 10 秒以内
