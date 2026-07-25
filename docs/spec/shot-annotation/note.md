# shot-annotation コンテキストノート

**作成日**: 2026-07-19
**作業規模**: フル機能開発
**位置づけ**: MVP 8ユニット完成後の最初の拡張ユニット。ADR-018「最小実装先行」の中核
（検証の試料 = ショットレベル統計の入力データを作る）。ADR-017 の Stage 0。

## 1. 責務（スコープ境界）

shot-annotation は、**記録済み試合への後付け注釈 UI（スタジオ）と、注釈列への書き込み**。

- **含む**: スタジオ3モード（クイック/種別/打点）、additive migration（注釈列）、
  rule-engine 由来のプレフィル、進捗導出、動画ソース別モード切替
- **含まない**:
  - ライブ記録 → match-recording の責務（**record 画面への変更は禁止**、ADR-017 選択肢 J）
  - 統計の集計・可視化 → stats-dashboard の責務（本単位の直後に拡張要件を別途定義）
  - AI 下書き・`shot_corrections` → Stage 2 以降（第2ゲート後）
  - 再生エンジン → video-playback を利用するのみ

## 2. 技術スタック

- Nuxt 4 (Vue 3) + Nuxt UI + TypeScript strict、CSR 限定（ADR-010。動画 API + canvas）
- Supabase (PostgREST)、FK 経由 RLS（`is_member_of(matches.group_id)`）
- video-playback composable（YouTube / local の再生・シーク）
- ローカル動画のみ: `<video>` + canvas でフレーム抽出（サムネイル帯）。
  YouTube iframe はピクセル取得不可のためループ方式（ADR-017 §4 動画ソース制約）

## 3. データ（追加する列と消費する列）

### additive migration（1本、CI 適用）

| テーブル | 追加列 | 用途 |
|---|---|---|
| `shots` | `hit_player_id` / `shot_type`(16種 CHECK) / `hand` / `hit_x` `hit_y` / `annotated_timestamp_ms` / `annotation_source` / `ai_model_version` / `ai_confidence` | 注釈本体（ショット単位の属性のみ）。AI 3列は Stage 2 用の先行定義（MVP は 'human' 固定）。打点の高さ（z）は MVP 対象外（Stage 3 で自動導出） |
| `rallies` | `end_reason`(7値 CHECK) / `land_x` `land_y`(決着の落下点) / `out_direction`(side/back/both) | 決着注釈。落下点は1ラリーに高々1点のラリー属性のため rallies 側。out_direction は落下点未入力時のフォールバック |

### 消費する既存データ（変更しない）

| テーブル | 使う列 | 用途 |
|---|---|---|
| `shots` | `video_timestamp_ms`, `shot_number` | パスの巡回順・フレーム位置（押下遅延込みの生値として保持） |
| `rallies` | `server_player_id`, `receiver_player_id`, `serving_team`, `point_winner`, `is_let`, `is_point_confirmed`, `video_start_timestamp_ms` | プレフィル・整合チェック・クイックパスのループ位置 |
| `sets` / `set_player_positions` | セット構成・立ち位置 | 巡回・二択候補の表示 |
| `matches` / `players` | 動画ソース・選手 | モード切替・チップ表示 |

## 4. 設計上の重要な前提

1. **タイムスタンプは押下遅延を含む生値**。打点パスは一律オフセット + ナッジで補正し、
   訂正結果は `annotated_timestamp_ms` に別保存（`video_timestamp_ms` は不変）。
   このペアが Stage 2（スナッピング）の教師データになる。
2. **全ラケット接触がショット行**（ヒアリング 2026-07-17）。最終接触者 + end_reason で
   勝敗を導出でき、point_winner との整合チェックが可能。
3. **座標は連続値・範囲外許容**で保存し、ゾーン化・ミラー正規化は集計側の責務。
4. **進捗テーブルは持たない**。null 有無からの導出のみ（リロード耐性・分担対応）。
5. **検証フェーズの主経路は YouTube ループ方式**（ユーザー決定 2026-07-19）。
   サムネ帯はローカル動画の強化パスとして実装する。YouTube では `annotated_timestamp_ms`
   を保存しない（フレーム精度の確認不可）ため、**教師データ（時刻ペア）はローカル動画の
   注釈からのみ蓄積**される（requirements.md 付録マトリクス参照）。
6. **ループ窓は非対称**: 決着を見るクイックパス = 後ろ長め（前1秒/後2.5秒）、
   打球瞬間を探す打点ループ = 前長め（前1.2秒/後0.3秒）。押下が実打より遅れる同じ事実から、
   見たい対象によって向きが逆になる。

## 5. 後続ユニット / 残課題

- **stats-dashboard 拡張**（別要件、次に定義）: 配球ヒートマップ・決定打/エラー傾向の
  2〜3枚。「捨てる前提の安い探針」（ADR-018 §3）
- **kairo-design で確定**: サムネイル帯の描画実装（canvas / requestVideoFrameCallback）、
  UI レイアウト詳細（座標系・undo・同時注釈・composable 分割は 2026-07-19 に要件で確定済み）
- **ADR 追補済み**: `annotated_timestamp_ms` を ADR-017 §5 へ追補（2026-07-19、本ブランチ内）
- **運用**: 作者チームの試合でドッグフーディング（QA + ラベル蓄積）→ テスター限定代行
  （ADR-018 §2）が本スタジオの最初の実利用
