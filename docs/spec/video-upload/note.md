# video-upload コンテキストノート

**作成日**: 2026-11-24 (video-upload-analysis から分割)
**関連**: [requirements.md](requirements.md) / [../video-analysis-job/note.md](../video-analysis-job/note.md) / [../serve-start-assist/note.md](../serve-start-assist/note.md)

## 1. 分割の経緯

- 2026-11-01: 動画のアップロードと解析を 1 単位 (video-upload-analysis) で起こした。
- 2026-11-23: ADR-020 §6 との整合 (VUA-0、PR #94)。同意の 4 点、原本は解析後削除が既定、学習利用はオプトイン保管、ジョブ出力にショット層の下書き JSON を追加。
- 2026-11-24: 作者指摘 2 点で改訂。
  1. **要件が大きすぎる。** 「アップロードして解析に使える状態にする」までを本単位 (video-upload) に、解析は別単位 (video-analysis-job) に分けた。境界は「`ready` の動画と署名 URL」(本単位 → 解析) と「保持の理由の付け外し」(記録側 → 本単位) の 2 本の契約。
  2. **入力が完了するまで原本を消したくない。ただ持ち続けると費用。テスト用のデータは消えてはいけない。** 「解析後に削除」を「保持の理由 (hold) が無くなったら削除」に置き換えた (§3)。
- ADR-013 §6-2 との関係は旧文書のまま: 明示的な同意つきのアップロードなので、不採用の「本人に明示せず裏送り」「YouTube のサーバー側取得」には抵触しない。
- 旧キューの VID-0〜4 (#100〜#106、削除候補) のうち VID-1 (受け取り)・VID-2 (保管と削除)・VID-3 (学習同意) は本単位、VID-4 (推論起動) は video-analysis-job が受け持つ。

## 2. 構成案 (kairo-design で確定)

```
ブラウザ ──(再開可能アップロード, TUS)──▶ Storage (非公開バケット videos/)
   │ 同意・校正・区間                          │
   ▼                                          ▼
 本体 (Nuxt サーバー) ── match_videos (台帳: メタデータ, 状態, 保持の理由, 削除記録)
   │  ready になったら                          ▲
   ├──▶ video-analysis-job (署名 URL を発行)     │ hold の付け外し (サーバー側 API)
   │                                            │
   └──◀ serve-start-assist / ai-draft-loop ──────┘ (correction を付ける・入力完了で外す)
         ai-draft-loop の学習用書き出し ──────────┘ (learning を外す)
 定期ジョブ (1 日 1 回): 保持の理由が無く猶予を過ぎた原本を削除、漏れを検知
```

- **台帳 `match_videos`**: id, match_id, storage_path, size_bytes, duration_ms, fps, width, height, rotation, format, segment_start_ms, segment_end_ms, consent_at, consent_terms (4 点), learning_consent_at, learning_consent_revoked_at, status (uploading / uploaded / ready / deleted), is_proxy, holds (jsonb または別テーブル `match_video_holds`: kind, set_at, set_by, cleared_at), delete_scheduled_at, deleted_at, delete_reason。RLS は `matches.group_id` 経由。
- **校正**: video-tap-annotation のコート校正を参照する。無ければ本単位の画面で 1 枚の静止画から 4 隅を取り、同じ保存先に書く (校正の所有は video-tap-annotation 側)。
- **署名 URL の発行**: サーバールートのみ。video-analysis-job がジョブ開始時に呼ぶ。有効期限 12 時間 (既定)。
- **保持の理由の API**: サーバー側だけから呼べる関数 (`add_hold(match_video_id, kind, by)` / `clear_hold(...)`)。クライアントからは `match_videos` の保持の列を更新できない。

## 3. 保持の設計 (hold)

原本を持つ理由は 3 つで、消す条件がそれぞれ違う。

| 理由 | 付ける側 | 外す側 | 消す条件 |
|---|---|---|---|
| `correction` 入力が完了するまで | ラリー確認 (serve-start-assist) が候補を取り込んだとき | 試合の「確認完了」(ai-draft-loop が判定) | 外れてから猶予 7 日 (REQ-103)。放置は 90 日で上限 (REQ-104) |
| `learning` 学習に提供 | 学習同意 (REQ-009) | 学習用書き出しが取り込んだとき (REQ-105)、または同意の取り消し (REQ-108) | 同上 |
| `eval` 評価専用の試合 | 評価専用の指定 (ADR-020 §3、5 試合に 1) | 運営者のみ (REQ-106) | 自動では消さない |

- なぜ `correction` が要るか: 人が訂正するのは YouTube を見ながらで、訂正画面自体に原本は要らない。要るのは AI 側で、ラリーの開始・終了を人が直したらその区間で打刻・球種を推論し直す (video-analysis-job の再実行)。原本が無いと再推論できない。
- 「確認完了」の信号は ai-draft-loop 側の要件 (試合単位の `confirmed_at`。L2 の信号「1 試合あたりの作業時間」の終点としても要る)。**本単位は hold の付け外しの口を提供するだけ**で、いつ外すかは記録側が決める。→ inbox に起票済み (ai-draft-loop の要件追補候補)。
- `eval` の正本は製品のストレージではなく DVC (ADR-020 §3)。製品側は「消さない」だけで、評価セットの凍結・版管理は badkichi-ai 側。製品側の原本が (利用者の要求や Group 削除で) 消えても、DVC 側の版はそのまま使える。ただし学習同意の取り消しは DVC 側の版にも効く (版ごと破棄、EDGE-104)。
- 手元の検証データ (戸塚・南区、`~/dev/badkichi-ai/`) は製品のストレージに無いので、本単位の削除の対象外。

費用の目安 (概算、kairo-design で実測に置き換える):

| 項目 | 値 |
|---|---|
| 1080p 原本 1 試合 | 2〜4 GB |
| 1280 幅 30 fps プロキシ 1 試合 | 300〜600 MB (原本の 1/5〜1/10) |
| 100 試合を原本のまま保管 | 200〜400 GB。Supabase Pro の込み分 (100 GB) を超えた分が GB 単価で月に数ドル |
| 100 試合をプロキシで保管 | 30〜60 GB。込み分に収まる |

プロキシ (REQ-301) を採れば「原本は早く消す、プロキシはゆっくり消す」の二段構えになり、保持の理由はプロキシに対して働く。解析に要る解像度 (TrackNet 512×288、姿勢 640) はプロキシで足りる。

## 4. 残す論点 (kairo-design と人の判断)

- 猶予 7 日・放置上限 90 日・署名 URL 12 時間・ファイル上限 4 GB / 3 時間の値 (すべて仮)
- プロキシ (REQ-301) の採否と生成の場所 (video-analysis-job のワーカーが解析のついでに出すのが自然。その場合は解析単位との契約に「プロキシを返す」を足す)
- 保持の理由の保存形 (jsonb か別テーブル)。付け外しの履歴が要るなら別テーブル
- 校正の入力 UI を本単位に持つか video-tap-annotation (BL-021) に寄せるか。画面外の隅の扱い
- 再開可能アップロードの実装 (Supabase Storage の TUS) とプランごとの上限
- 同意の文言 (BL-004 と揃える)。(3) を「入力が完了したら削除」に変えたので、プライバシーポリシーの記載も合わせる。(2) に「特徴量と確認・訂正はモデル改善に使う」を含める (2026-11-25)
- **原本 (映像) の学習利用の既定値**。ADR-020 §6 / ADR-013 §6-4 はオプトイン (既定オフ)。作者は「基本的には利用したい。利用者が修正したものは教師データにしたい」(2026-11-25)。訂正と特徴量は既定で使うので満たせているが、映像そのものを既定オン (オプトアウト) にするかは別の判断で、ADR 2 本の追記が要る。検証段階 (チームメイト) は既定オン、公開時に既定オフへ戻す運用も設定 1 つで可能にしておく (REQ-009)
- `correction` を付けるタイミング: `ready` になった時点で付けるか、候補を取り込んだ時点か。前者の方が単純 (解析前に消える事故が無い)

## 5. 進め方の注意

- 最初の利用者は運営者自身 (戸塚・南区の動画で通す)。その段階では保管費用は小さいので、削除の定期ジョブ (NFR-301) は最後に実装してよい。ただし台帳と保持の理由の列は最初から持つ (後から付けると既存の原本の扱いに困る)。
- 本単位だけでは何も解析されない。video-analysis-job と対で使うが、本単位の PR は `ready` までで閉じる。
- 課金 (billing) との接点は本単位には無い (動画分析数の計測は video-analysis-job)。
