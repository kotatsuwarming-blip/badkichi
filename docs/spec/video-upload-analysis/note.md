# video-upload-analysis コンテキストノート

**作成日**: 2026-11-01
**関連**: [requirements.md](requirements.md) / [../serve-start-assist/note.md](../serve-start-assist/note.md)

## 1. 背景と決定 (2026-11-01 ユーザー決定)

- サーブ候補の生成 (serve-start-assist) を運営者の手元だけでなく利用者自身が使えるようにする。そのために動画をアプリにアップロードし、サーバーで解析する。
- 再生は YouTube に任せ、利用者のローカルに動画を置かせない。候補の時刻と YouTube のずれは、長さの比較と最初の候補での 1 回の手合わせで扱う (serve-start-assist REQ-113)。自動推定はできない。
- ADR-013 §6-2 との関係: ADR-013 は「本人に明示せず動画を裏送り」と「YouTube のサーバー側取得」を不採用とし、ブラウザ内推論かハイブリッド (特徴量だけ送る) を本命にしていた。本単位は **明示的な同意つきのアップロード** で、不採用の 2 点には抵触しない。ただしブラウザ内推論の方針からは外れるので、ADR-020 (BL-001、ADR-013 の読み替え) に本単位の方針を含める。理由: 検出は Python (姿勢 + TrackNet + 分類器) で、ブラウザ内に移植すると開発と検証をやり直すことになり、処理も実時間の 13 倍 (M2) で端末では現実的でない。
- ADR-013 §4「動画数制限はコストではなく値付けレバー」は、本単位で Storage と GPU の実費が発生するため前提が変わる。動画分析数の上限 (billing) が実費の回収にも効くようになる。

## 2. 構成案 (kairo-design で確定)

```
ブラウザ ──(再開可能アップロード)──▶ Storage (非公開バケット videos/)
   │                                      │ 署名 URL (期限付き)
   │  analysis_jobs に待機を作成            ▼
   └──────────▶ 本体 (Nuxt サーバー) ──▶ 解析ワーカー (GPU ジョブ基盤)
                      ▲                      │ 候補 JSON + ログ + 処理時間
                      └──── 台帳を更新 ◀─────┘
                 serve-start-assist が候補 JSON を読む
```

- **台帳 `analysis_jobs`**: id, match_id, status (queued/running/done/failed), progress_ms, total_ms, started_at, finished_at, error_kind, error_detail, output_path, worker_version, contract_version, duration_sec, gpu_sec, cost_estimate, created_by, created_at。RLS は `matches.group_id` 経由。
- **原本の記録 `match_videos`** (または `analysis_jobs` に含める): storage_path, size_bytes, duration_ms, fps, width, height, rotation, consent_at, retention (none/30d/learning), deleted_at, delete_reason。
- **ワーカー**: `~/dev/badkichi-ai/` の検出パイプライン (detect_pose → TrackNetV3 → shuttle_track/hitter_from_track → serve_detect + serve_clf + server_slot_clf → serve_combine + rally_clusters) をコンテナにまとめ、入力 (動画 URL、4 隅、区間、fps、向き) と出力 (候補 JSON、ログ) の契約だけで動かす。実行基盤の候補は GPU ジョブを時間課金で動かせるもの (Modal / RunPod / Fly GPU など)。常駐させず、ジョブごとに起動する。
- **起動の経路**: 本体のサーバールートがワーカー基盤の API を叩く (service role はサーバーだけ)。ワーカーは完了時に本体のコールバック (署名つき) を呼ぶか、台帳を直接更新する。どちらにするかは kairo-design。
- **削除の定期ジョブ**: 1 日 1 回、保管期限を過ぎた原本を削除し、削除漏れを運営者に通知する。

## 3. コストと時間の見積 (未実測、設計で実測して置き換える)

| 項目 | 見積 | 根拠 |
|---|---|---|
| 解析時間 (45 分の試合) | GPU で 45〜90 分 | M2 で TrackNet が実時間の 13 倍、姿勢検出が同程度。GPU (T4〜A10 級) で TrackNet が実時間の 1〜2 倍と仮定 |
| GPU 費用 (1 本) | 数十〜数百円 | 時間課金の GPU が 1 時間あたり 数十〜数百円の桁。基盤による |
| Storage (一時) | 1 本 0.5〜1.5 GB × 保管日数 | 既定は成功後すぐ削除なので一時的 |
| 転送量 | アップロード 1 本分 + ワーカーの取得 1 回 | Storage 再生 (serve-start-assist REQ-304) を使うと増える |

- 動画分析数の値付けは、GPU 費用 + Storage + 運営者の確認時間 (初期は結果を確認する運用) を見て決める。
- 1 本あたりの費用が確定するまでは、上限つきプランの「累計 N 本」で露出を抑える。

## 4. 解析の前提条件 (利用者に伝えること)

- **カメラの位置**: コート後方・高さ 120 cm 以上の三脚でコート全体が入る画角 (BL-008 撮影ガイド)。横からの床置き (南区) では成立しない。
- **コートの校正**: 4 隅の画像座標。手前 2 隅が画面外でも線の延長で校正できる方式が要る (video-tap-annotation 側)。
- **精度の保証範囲**: 戸塚 1 試合 (ダブルス、1280×720 30 fps) で検証した数字 (サーブ開始 20/23、スロット 91/100)。別会場では落ちる可能性がある。初期は運営者が結果を確認する。
- **動画の形式**: mp4 / mov / webm、30〜60 fps、720p 以上、縦向き可 (回転情報が要る)。

## 5. ライセンスの注意 (REQ-405)

- TrackNetV3: コード・重みとも MIT (BL-030 で確認済み)。
- YOLO11 (ultralytics): AGPL-3.0。サーバーで動かして結果を提供する形は AGPL の適用範囲になり得るので、商用ではライセンス購入 (Ultralytics Enterprise) か、商用可能な姿勢推定 (例: RTMPose / MediaPipe、Apache-2.0) への置き換えを検討する。置き換えると検出の数字は取り直し。
- 分類器 (serve_clf / server_slot_clf) は自前の学習データ (戸塚) と scikit-learn なので問題ない。

## 6. 設計に残す論点

- ワーカーの実行基盤の選定と、起動・完了通知の方式 (API 呼び出し + コールバック か ポーリング)。
- 再開可能アップロードの実装 (Supabase Storage の TUS) とファイルサイズ上限 (プランで異なる。要確認)。
- 校正の入力 UI を本単位に持つか video-tap-annotation (BL-021) に寄せるか。画面外の隅の扱い。
- 進捗の粒度 (ワーカーが処理済みの秒数を台帳に書く頻度)。
- 原本を保管するプランの有無と期間 (既定 30 日は仮)。学習提供 (REQ-301) の同意文言。
- YOLO11 の扱い (REQ-405)。
- 運営者向けの一覧 (NFR-302) を管理画面にするか SQL で済ませるか。

## 7. 進め方の注意

- 実装の前に、`~/dev/badkichi-ai/` の検出パイプラインを「1 コマンドで動画から候補 JSON を出す」形にまとめる (serve-start-assist note.md §5 の書き出しスクリプト)。これがワーカーの中身になる。
- 最初の利用者は運営者自身 (戸塚・南区の動画で通す)。顧客に開くのは精度の確認運用を決めてから。
- プライバシーポリシー (BL-004) と利用規約 (BL-005) に、動画のサーバー保管・削除・解析の記載を足す。
