# video-upload-analysis 要件定義書 (大粒度: 機能群)

**作成日**: 2026-11-01 / **改訂**: 2026-11-23 (ADR-020 との整合)、**2026-11-24 (2 つの単位に分割し、本書を大粒度の要件定義に改めた)**
**位置づけ**: 「動画を上げる → 解析 → 確認で使う」をまたぐ **機能群の要件定義**。ユーザーストーリーと方針、単位の分割、単位間の契約を持つ。EARS の要件と受け入れ基準は子の単位が持つ
**子の単位**: [video-upload](../video-upload/requirements.md) (アップロードして解析に使える状態にする。原本の保管と削除)、[video-analysis-job](../video-analysis-job/requirements.md) (解析ジョブとワーカー契約、出力の受け渡し)
**上位の決定**: ADR-020 §6 / §7。**再生は YouTube だけ、動画は解析用のアップロードのみ**。**学習利用のオプトインは原本 (映像そのもの) についてで、利用者の確認・訂正と数値特徴量は既定で学習に使う** (ADR-020 §2、ADR-013 §6-4。明記 2026-11-25)。「原本は解析後に削除が既定」は 2026-11-24 に「入力が完了し保持の理由が無くなったら削除」に読み替えた (§方針 3)

## 概要

利用者が試合の動画ファイル (YouTube に上げたものと同じファイル) をアプリにアップロードし、サーバーの解析ジョブが **サーブ候補ファイル** (ラリー確認が読む) と **ショット層の下書き JSON** (注釈の確認が読む) を作る。再生は YouTube に任せ、利用者の手元に動画ファイルを置き続ける必要をなくす。いまは候補の生成を運営者の Mac で行っていて (`~/dev/badkichi-ai/`)、運営者しか使えない。利用者自身が動画を上げて候補を受け取れるようにするのが目的で、顧客自身による確認と訂正 (BL-044) の前提になる。

## なぜ親子にするか (2026-11-24)

- 作者指摘 1: 1 単位 (旧 video-upload-analysis) にアップロード・保管・解析ジョブ・ワーカー契約・課金計測を抱えて大きすぎた。「上げて解析に使える状態にする」と「解析する」は変わる速さも依存先も違う。
- 作者指摘 2: 単位を分けるとユーザーストーリーが書けなくなる (ストーリーは単位をまたぐ)。
- そこで、**大粒度の要件定義 (本書) がストーリーと方針と単位の分割を持ち、子の単位が EARS の要件と受け入れ基準を持つ**。子の `user-stories.md` は親のストーリーへの対応表だけにする。この書き方の規約化 (docs/rule) は別途判断 (inbox)。

## 方針 (子の単位が従う決定)

1. **アップロードは明示的な同意つき。** 4 点 (アップロード・解析・入力完了後の削除・原本の学習利用はオプトイン) に同意して初めて送る。オプトインの対象は**原本 (映像そのもの)** だけで、解析で得た数値特徴量と利用者の確認・訂正 (`human_resolutions`) は同意の有無に関わらずモデルの改善に使う。これは (2) 解析の同意に含めて示す。原本の学習利用は**既定オン・取り消し可** (作者決定 2026-11-25。理由と取り込み先 DVC は ADR-020 §6) 🔵 *ADR-020 §2 / §6 + ADR-013 §6-2 / §6-4*
2. **解析はジョブ。** 台帳に状態・進捗・結果を持ち、ワーカーは本体とは別の GPU 環境で動く。本体はワーカーの中身を知らない 🔵
3. **原本の保持は「理由」で管理し、理由が無くなったら猶予の後に削除する。** 「解析後に即削除」ではない。人の入力 (ラリー確認・注釈の確認) が終わるまでは AI が区間を推論し直すことがあるので、原本は入力完了まで残す。学習に提供した原本は取り込みまで、評価専用の試合は自動では消さない。費用はプロキシ (縮小版) への置き換えで抑える 🟡 *作者指摘 2026-11-24。値 (猶予・上限) は video-upload で決める*
4. **出力は小さなファイルだけ。** 動画はワーカーの外に出さず、選手名も含めない。出力の契約はバージョンつきで、サーブ候補と下書き JSON の両方を返せる 🔵 *ADR-020 §4 L1*
5. **解析にはコートの校正が要る。** コート 4 隅の座標を解析の入力にする。校正は video-tap-annotation (BL-021) の仕組みを使う 🔵 *ADR-017 Stage 1*
6. **再生は YouTube だけ。** アップロードした動画の再生は不採用。YouTube からの動画取得も不採用 🔵 *作者決定 2026-11-23 + ADR-013 §6-2*
7. **課金は保留中。** 動画分析数は計測だけ行い、上限の強制は billing の実装後 🔵 *ADR-020 §8*

## 単位の分割と境界の契約

| 単位 | 担うこと | 入力 | 出力 |
|---|---|---|---|
| [video-upload](../video-upload/requirements.md) | アップロード、同意、メタデータ、校正・区間の取得、`ready` の判定、原本の保持の理由 (hold) と削除 | 利用者の操作、hold の付け外し (記録側から) | `ready` の動画 + 署名 URL (解析へ) |
| [video-analysis-job](../video-analysis-job/requirements.md) | ジョブの台帳、ワーカー契約、候補ファイル・下書き JSON の保存と受け渡し、分析数の計測 | `ready` の動画 (video-upload から) | 候補ファイル (serve-start-assist へ)、下書き JSON (ai-draft-loop へ) |

契約は 3 本。

1. **`ready` と署名 URL** (video-upload → video-analysis-job): 原本・同意・メタデータ・校正が揃った動画だけが渡る。署名 URL の発行はサーバー側のみ (video-upload REQ-007、video-analysis-job REQ-001 / REQ-003)。
2. **保持の理由 (hold)** (serve-start-assist / ai-draft-loop → video-upload): `correction` は候補の取り込みで付き、試合の「確認完了」で外れる。`learning` は既定で付き (利用者が外せる)、学習用書き出しが原本を DVC に複製したと記録したときに外れる (video-upload REQ-105)。`eval` は評価専用の指定で付く (video-upload REQ-008)。「確認完了」の判定は ai-draft-loop 側の要件 (追補が要る → inbox)。
3. **出力ファイル** (video-analysis-job → 消費側): サーブ候補ファイルは serve-start-assist note.md §5、下書き JSON は ai-draft-loop REQ-304 の契約 (video-analysis-job REQ-004 / REQ-005)。

## スコープ (機能群として)

### 含む
- 子の 2 単位の範囲すべて
- 単位間の契約 (上の 3 本)

### 含まない
- 解析アルゴリズムそのもの (`~/dev/badkichi-ai/`、L1 ループ)
- 候補・下書きの確認と訂正 (serve-start-assist、ai-draft-loop)
- 評価セットの凍結・版管理 (ADR-020 §3、DVC、badkichi-ai 側)
- 訂正を使った再学習 (ADR-020 §4 L1)

## 関連文書

- **ユーザストーリー (機能群全体)**: [📖 user-stories.md](user-stories.md)
- **コンテキストノート (改訂の履歴、分割の経緯、人の判断)**: [📝 note.md](note.md)
- **子の受け入れ基準**: [video-upload](../video-upload/acceptance-criteria.md) / [video-analysis-job](../video-analysis-job/acceptance-criteria.md)
- **ADR-020 §3 / §4 / §6 / §7 / §8**: [../../decisions/020-ai-first-input-and-loop-engineering.md](../../decisions/020-ai-first-input-and-loop-engineering.md)
- **ADR-013 §6 (動画の扱い・学習データ戦略)**: [../../decisions/013-monetization-and-platform-strategy.md](../../decisions/013-monetization-and-platform-strategy.md)
- **消費側**: [../serve-start-assist/requirements.md](../serve-start-assist/requirements.md)、[../ai-draft-loop/requirements.md](../ai-draft-loop/requirements.md)
- **プライバシーポリシー改訂 (BL-004)、撮影ガイド (BL-008)、ライセンス確認 (BL-030)**: `docs/backlog/`

## 人が判断すること

- 方針 3 (保持の理由で管理、解析後即削除ではない) でよいか。同意の文言 (3) も変わる (BL-004)
- ~~方針 1 の原本の学習利用の既定値~~ → 2026-11-25 作者決定: **既定オン・取り消し可**。ADR-020 §6 / ADR-013 §6-4 に追記済み。残るのは同意文言 (BL-004) と、公開前の既定値の見直し
- 子の単位の値: 猶予 7 日、放置上限 90 日、プロキシの採否 (video-upload)。YOLO11 のライセンス (video-analysis-job)
- 親子の要件定義の書き方を docs/rule に規約として書くか (inbox)
