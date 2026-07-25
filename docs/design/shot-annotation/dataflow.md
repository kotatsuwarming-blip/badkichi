# shot-annotation データフロー図

**作成日**: 2026-07-25
**関連アーキテクチャ**: [architecture.md](architecture.md)
**関連要件定義**: [requirements.md](../../spec/shot-annotation/requirements.md)

**【信頼性レベル凡例】**: 🔵 確定文書由来 / 🟡 妥当な推測 / 🔴 出典なし

---

## システム全体のデータフロー 🔵

```mermaid
flowchart TD
    U[ユーザー] -->|モード選択/キー/タップ| Page[annotate.vue]
    Page -->|seek/loop/rate| VP[useVideoPlayer]
    Page --> AS[useAnnotationSession<br/>データ + 現在位置所有]
    AS --> QP[useQuickPass]
    AS --> TP[useTypePass]
    AS --> PP[usePositionPass]
    QP & TP & PP -->|純関数| UT[utils/annotation/*]
    QP & TP & PP -->|UPDATE 要求| SV[useAnnotationSave<br/>楽観・直列キュー]
    SV -->|PATCH| DB[(Supabase<br/>shots / rallies)]
    AS -->|null 有無| PG[useAnnotationProgress]
    PG -->|進捗/再開位置| Page
```

## 機能1: クイックパス（決着注釈） 🔵

**関連要件**: REQ-004 / 005 / 006 / 102

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant QP as useQuickPass
    participant VP as useVideoPlayer
    participant UT as utils(derive/courtCoords)
    participant SV as useAnnotationSave

    QP->>VP: seekToMs(最終shot押下時刻-1s), ループ[−1s, +2.5s]
    Note over VP: 非対称窓 (REQ-004)
    U->>QP: end_reason タップ
    QP->>UT: checkConsistency(最終接触者, end_reason, point_winner)
    UT-->>QP: ok / 矛盾警告 (REQ-102, 保存は拒否しない)
    alt end_reason が in / out
        U->>QP: 落下点タップ (ライン外含むコート図)
        QP->>UT: toNormalized() → deriveOutDirection()
        Note over QP: 座標スキップ時のみ out_direction サブ選択
    end
    QP->>UT: decisiveShotOf(rally) → 決定打を特定
    U->>QP: 決定打の shot_type タップ
    QP->>SV: rallies UPDATE(end_reason, land_x/y, out_direction)<br/>shots UPDATE(決定打の shot_type)
    QP->>QP: 次のラリーへ (レットはスキップ, REQ-106)
```

## 機能2: 種別パス（順番マッチング） 🔵

**関連要件**: REQ-007 / 008 / 103 / 104 / 109

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant TP as useTypePass
    participant VP as useVideoPlayer
    participant UT as utils(orderMatching/taxonomy)
    participant SV as useAnnotationSave

    Note over TP: パス開始時に hand トグルを宣言 (REQ-104)
    TP->>VP: ラリー開始位置へ seek, 再生 (可変速)
    loop ラリー内
        U->>TP: 種別キー (Shift = backhand)
        TP->>UT: matchKeyToShot(k番目) → 対象 shot 特定
        UT-->>TP: shot / 超過なら無視+警告 (EDGE-003)
        TP->>UT: keyToShotType(1打目はサーブ三択に制限, REQ-109)
        TP->>SV: shots UPDATE(shot_type, hand※トグルON時は無印=forehand)
        TP-->>U: <100ms でチップ反映 (NFR-002)
    end
    TP->>VP: ラリー境界で自動一時停止 → 次ラリーへ自動スキップ (REQ-008)
    Note over TP: 直前ショットがスマッシュ/プッシュ/ドライブなら<br/>レシーブ3種をハイライト (REQ-103, キーは固定)
```

## 機能3: 打点パス（ローカル動画） 🔵

**関連要件**: REQ-009 / 010 / 011 / 012 / 014

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant PP as usePositionPass
    participant TH as ThumbStrip(抽出用 video+canvas)
    participant UT as utils(offset/courtCoords)
    participant SV as useAnnotationSave

    Note over PP,UT: 校正: 冒頭数ショットを手動合わせ → averageOffset() (REQ-010)
    loop ショットごと (レット除外)
        PP->>TH: 補正後時刻 ±0.5s の 5〜7 フレーム生成 (先読み済み)
        U->>PP: 正しいフレームをクリック
        PP->>SV: shots UPDATE(annotated_timestamp_ms)  ※video_timestamp_ms は不変
        U->>PP: コート図タップ (打点)
        PP->>UT: toNormalized() → hit_x / hit_y
        alt 打者が二択 (3打目以降, REQ-012)
            U->>PP: 選手チップ二択タップ
        end
        PP->>SV: shots UPDATE(hit_x, hit_y, hit_player_id)
        PP->>TH: 次ショットのサムネ帯を背景生成 (NFR-001)
    end
```

- YouTube モード: TH の代わりに `seekTo` + タイマーのスローループ（窓 = 前1.2s/後0.3s、
  REQ-101）。`annotated_timestamp_ms` は書かない 🔵

## 機能4: プレフィル（rule-engine 出力の読み取りのみ） 🔵

**関連要件**: REQ-012 / 109

```mermaid
flowchart LR
    R[(rallies<br/>server/receiver/serving_team)] --> D{shot_number}
    D -->|1| S1[hit_player_id = server_player_id<br/>shot_type = サーブ三択]
    D -->|2| S2[hit_player_id = receiver_player_id]
    D -->|3以上| S3[偶奇でチーム確定<br/>→ ペア2人の二択のみ提示]
```

- プレフィル値も保存時は通常の UPDATE（`annotation_source='human'`）。
  rule-engine 本体は呼ばず、denormalize 済み列だけを読む 🔵

## 機能5: 保存・undo・進捗 🔵

**関連要件**: REQ-003 / 013 / 108 / EDGE-001 / EDGE-007

- **保存**: `useAnnotationSave` が UPDATE を直列キューで送出（楽観 = UI は即時反映、
  失敗は `useToast()` + ローカル状態保持）。対象は shots 注釈列 / rallies 決着列のみ
- **undo（1段）**: 直前の {テーブル, 行id, 列, 旧値} を保持 → Backspace で逆 UPDATE + 位置を戻す。
  2手以上前は AnnotationRallyList から該当ショットを開いて上書き（REQ-108）
- **進捗**: `useAnnotationProgress` が読込済みデータの null 有無から導出
  （種別 = shot_type 非null率 / 打点 = hit_x 非null率 / クイック = end_reason 非null率、
  いずれもレット除外）。リロード後も同じ計算で再現（REQ-013）

## エラー・境界 🔵

| ケース | フロー |
|---|---|
| 保存失敗（RLS / ネットワーク） | キュー停止 → useToast() → リトライ導線。入力済みローカル状態は保持（EDGE-007） |
| out なのに落下点がコート内 | deriveOutDirection() が null → ソフト警告表示（EDGE-002） |
| キー入力がショット数超過 | matchKeyToShot() が null → 無視 + 警告、ラリーやり直し可（EDGE-003） |
| 補正後時刻が負値 | loopWindowFor() 内で 0 に clamp（EDGE-004） |
| ローカル動画未再選択 | 方式 A の再選択プロンプト（REQ-107）。注釈データの閲覧・一覧は可能 |
