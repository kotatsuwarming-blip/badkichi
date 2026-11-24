# video-analysis-job コンテキストノート

**作成日**: 2026-11-24 (親 video-upload-analysis から分割。分割の経緯は親の note.md)
**関連**: [requirements.md](requirements.md) / [../video-upload/note.md](../video-upload/note.md) / [../serve-start-assist/note.md](../serve-start-assist/note.md)

## 1. 構成案 (kairo-design で確定)

```
video-upload (ready, 署名 URL, 4 隅, 区間, fps/向き)
        │
        ▼
 本体 (Nuxt サーバー) ── analysis_jobs に待機を作成 ──▶ 解析ワーカー (GPU ジョブ基盤)
        ▲                                                │ 候補 JSON + 下書き JSON + ログ + 処理時間
        └──────────── 台帳を更新 ◀───────────────────────┘
   候補 JSON → serve-start-assist (ラリー確認)
   下書き JSON → ai-draft-loop の取り込み経路 (#102)
```

- **台帳 `analysis_jobs`**: id, match_id, match_video_id, status (queued/running/done/failed), progress_ms, total_ms, requested_outputs, started_at, finished_at, error_kind, error_detail, output_paths, worker_version, contract_version, duration_sec, gpu_sec, cost_estimate, segment (部分再推論のとき), created_by, created_at。RLS は `matches.group_id` 経由。
- **ワーカー**: `~/dev/badkichi-ai/` の検出パイプライン (detect_pose → TrackNetV3 → shuttle_track/hitter_from_track → serve_detect + serve_clf + server_slot_clf → serve_combine + rally_clusters) をコンテナにまとめ、入力と出力の契約だけで動かす。実行基盤の候補は GPU ジョブを時間課金で動かせるもの (Modal / RunPod / Fly GPU など)。常駐させず、ジョブごとに起動する。
- **起動の経路**: 本体のサーバールートがワーカー基盤の API を叩く (service role はサーバーだけ)。ワーカーは完了時に本体のコールバック (署名つき) を呼ぶか、台帳を直接更新する。どちらにするかは kairo-design。
- **部分再推論 (REQ-107)**: 入力の区間を 1 ラリー分に絞った同じ契約のジョブ。出力の下書き JSON は該当ラリーの predictions だけを含み、ai-draft-loop 側で batch_id ごとに差し替える。

## 2. コストと時間の見積 (未実測、設計で実測して置き換える)

| 項目 | 見積 | 根拠 |
|---|---|---|
| 解析時間 (45 分の試合) | GPU で 45〜90 分 | M2 で TrackNet が実時間の 13 倍、姿勢検出が同程度。GPU (T4〜A10 級) で TrackNet が実時間の 1〜2 倍と仮定 |
| GPU 費用 (1 本) | 数十〜数百円 | 時間課金の GPU が 1 時間あたり数十〜数百円の桁 |
| 転送量 | ワーカーの取得 1 回 | Storage の保管費用は video-upload 側 |

- 動画分析数の値付けは、GPU 費用 + Storage (video-upload) + 運営者の確認時間 (初期は結果を確認する運用) を見て決める。課金は保留中 (ADR-020 §8)。
- ADR-013 §4「動画数制限はコストではなく値付けレバー」は、GPU の実費が発生するため前提が変わる。

## 3. 解析の前提条件 (利用者に伝えること)

- **カメラの位置**: コート後方・高さ 120 cm 以上の三脚でコート全体が入る画角 (BL-008 撮影ガイド)。横からの床置き (南区) では成立しない。
- **精度の保証範囲**: 戸塚 1 試合 (ダブルス、1280×720 30 fps) で検証した数字 (サーブ開始 20/23、スロット 91/100)。別会場では落ちる可能性がある。初期は運営者が結果を確認する。

## 4. ライセンスの注意 (REQ-403)

- TrackNetV3: コード・重みとも MIT (BL-030 で確認済み)。
- YOLO11 (ultralytics): AGPL-3.0。サーバーで動かして結果を提供する形は AGPL の適用範囲になり得るので、商用ではライセンス購入 (Ultralytics Enterprise) か、商用可能な姿勢推定 (例: RTMPose / MediaPipe、Apache-2.0) への置き換えを検討する。置き換えると検出の数字は取り直し。
- 分類器 (serve_clf / server_slot_clf) は自前の学習データ (戸塚) と scikit-learn なので問題ない。

## 5. 設計に残す論点

- ワーカーの実行基盤の選定と、起動・完了通知の方式 (API 呼び出し + コールバック か ポーリング)。
- 進捗の粒度 (ワーカーが処理済みの秒数を台帳に書く頻度)。
- 部分再推論 (REQ-107) の要求元と、1 ラリー分の区間をどう渡すか (ラリー確認の確定値から)。
- プロキシの生成 (REQ-304) をワーカーが担うか (video-upload REQ-301 の採否と連動)。
- YOLO11 の扱い (REQ-403)。
- 運営者向けの一覧 (NFR-302) を管理画面にするか SQL で済ませるか。

## 6. 進め方の注意

- 実装の前に、`~/dev/badkichi-ai/` の検出パイプラインを「1 コマンドで動画からサーブ候補 JSON (と、できればショット層の下書き JSON) を出す」形にまとめる (serve-start-assist note.md §5 の書き出しスクリプト、ADR-020 §4 L1)。これがワーカーの中身になる。
- 最初の利用者は運営者自身 (戸塚・南区の動画で通す)。顧客に開くのは精度の確認運用を決めてから。
- 本単位の最初の実装は「ジョブの台帳 + 運営者が手元で作った候補の手動登録 (REQ-302)」でよい。ワーカー基盤は後から差し込める (契約だけ先に固める)。
