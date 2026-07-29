# shot-annotation アーキテクチャ設計

**作成日**: 2026-07-25
**関連要件定義**: [requirements.md](../../spec/shot-annotation/requirements.md)
**ヒアリング記録**: [design-interview.md](design-interview.md) / [spec/interview-record.md](../../spec/shot-annotation/interview-record.md)

**【信頼性レベル凡例】**:
- 🔵 **青信号**: EARS要件定義書・確定スキーマ・ADR-017/018・ユーザヒアリング由来の確実な設計
- 🟡 **黄信号**: 上記から妥当な推測による設計
- 🔴 **赤信号**: 出典のない推測による設計

---

## システム概要 🔵

**信頼性**: 🔵 *requirements.md 概要 + ADR-017 §3*

shot-annotation は、記録済み試合に後付けで注釈するアノテーションスタジオ
（`/groups/[id]/matches/[matchId]/annotate`）。3モード（クイック / 種別 / 打点）で
`shots` の注釈列と `rallies` の決着列を **UPDATE のみ**行う（行の新規作成・削除はしない）。

- **video-playback**（`useVideoPlayer`）: 再生・シーク・速度。ループ再生と静止フレーム表示の土台
- **rule-engine の出力（denormalize 済み rallies 列）**: プレフィルの源泉（サーバー/レシーバー/偶奇）。
  rule-engine 本体は**呼ばない**（読み取るのは保存済み結果のみ）
- **Supabase PostgREST**: 既存 UPDATE RLS ポリシーの範囲内で注釈列を更新

データエンジニア的構造: shot-annotation は**既存ファクトテーブルへの列エンリッチメント
（バックフィル UI）**。行構造・キーは match-recording が確定済みで、本単位は属性列を
後から埋めるだけ。だから undo は単純（連鎖効果ゼロ、REQ-108）で、進捗も null 有無から
導出できる（REQ-013）。

## アーキテクチャパターン 🔵

**信頼性**: 🔵 *ADR-007 + NFR-402（6分割確定）+ match-recording の集約オーケストレータ前例*

- **パターン**: **集約オーケストレータ + モード別 composable**。`useAnnotationSession` が
  対象試合の全データ（sets/rallies/shots + players）と現在モード・現在位置を所有し、
  モード固有ロジックは `useQuickPass` / `useTypePass` / `usePositionPass` に委譲、
  永続化は `useAnnotationSave` に集約する。
- **純ロジックは `app/utils/annotation/` に分離**（NFR-401 の単体テスト対象）:
  座標変換・順番マッチング・決定打/勝敗導出・オフセット計算・taxonomy 定義。
  composable はこれらを呼ぶだけにし、実プレーヤー・実 DB なしでテスト可能にする。

## コンポーネント構成

### ページ / コンポーネント層 🔵

**信頼性**: 🔵 *REQ-001/405 + match-recording の pages 構造踏襲*

- **ルート**: `app/pages/groups/[id]/matches/[matchId]/annotate.vue`（CSR、REQ-405）
- record.vue と同様に page が `useVideoPlayer` を所有し、`getCurrentTimeMs` / `seekToMs` /
  `setPlaybackRate` を session に注入する。**record 画面のファイルには一切触れない**（REQ-407）

```
annotate.vue（page・CSR・orchestration）
├─ AnnotationModeBar.vue     モード切替タブ + モード別進捗チップ（REQ-003/013）
├─ AnnotationVideoPane.vue   useVideoPlayer + ループ制御 + 静止フレーム/サムネ帯表示
│   ├─ ThumbStrip.vue        ±0.5秒 5〜7枚のサムネイル帯（ローカルのみ、REQ-011）
│   └─ OffsetCalibrator.vue  冒頭数ショットのフレーム合わせウィザード（REQ-010）
├─ QuickPassPanel.vue        end_reason ボタン群 + 決定打種別パレット + 落下点入力
├─ TypePassPanel.vue         種別キーパレット + ラリー内ショットチップ列 + handトグル
├─ PositionPassPanel.vue     打点入力の進行 + 打者二択チップ
├─ CourtDiagramInput.vue     入力用コート図（ライン外領域込み・タップ→正規化座標）
└─ AnnotationRallyList.vue   ラリー/ショット一覧（任意位置へ戻って上書き、REQ-108）
```

- `CourtDiagramInput` は record 用 `CourtDiagram`（表示専用）とは別コンポーネント。
  コート外周に out 領域（ライン外）を含めて描画し、タップを正規化座標（範囲外値許容）で返す 🔵 *REQ-005/014*

### Composable 層（NFR-402 の6分割で確定） 🔵

```
useAnnotationSession(matchId, videoBridge)   ← 集約（データ読込・現在位置・直前1段undo）
├─ useQuickPass(session)      ラリー巡回・非対称ループ窓(前1s/後2.5s)・end_reason/落下点/決定打
├─ useTypePass(session)       連続再生・順番マッチング・キー捕捉・handトグル・ラリーやり直し
├─ usePositionPass(session)   オフセット校正・フレーム/ループ提示・打点/打者入力
├─ useAnnotationSave()        PostgREST UPDATE（楽観・直列キュー）: shots 注釈列 / rallies 決着列
└─ useAnnotationProgress(session)  null 有無からモード別進捗・次の未注釈位置を導出
```

- **読込**: session が `matches`(1件・4選手・動画ソース) / `sets` / `rallies`(全列) /
  `shots`(全列) を一括取得。レットラリーとそのショットは巡回・進捗から除外（REQ-106）
- **undo**: 「直前の入力を取り消して1つ戻る」1段のみ（REQ-108）。直前に書いた
  {行, 列, 旧値} を1件だけ保持し、Backspace で逆 UPDATE + 位置を1つ戻す
- **同時注釈**: last-write-wins（EDGE-001）。競合検出はしない

### 純ロジック層（`app/utils/annotation/`） 🔵

**信頼性**: 🔵 *NFR-401（単体テスト高優先の対象を module 化）*

| module | 内容 | 主要関数 |
|---|---|---|
| `taxonomy.ts` | 16種の定義・キー割当・レシーブハイライト規則・サーブ三択 | `SHOT_TYPES` / `keyToShotType()` / `isReceiveContext()` |
| `courtCoords.ts` | 描画座標⇔正規化座標（範囲外値許容）・out 細分導出 | `toNormalized()` / `fromNormalized()` / `deriveOutDirection()` |
| `derive.ts` | 決定打・(最終接触者, end_reason)→勝者・整合チェック | `decisiveShotOf()` / `deriveWinner()` / `checkConsistency()` |
| `orderMatching.ts` | ラリー内 k 番目対応・超過検出・やり直し | `matchKeyToShot()` |
| `offset.ts` | 校正平均・負値 clamp・窓計算（非対称） | `averageOffset()` / `loopWindowFor()` |

## サムネイル帯の実装方式（kairo-design 決定事項） 🟡

**信頼性**: 🟡 *spec 残課題。ローカル動画の Web API 特性からの技術選定*

- **非表示の `<video>` 要素（同一オブジェクト URL）を抽出専用に1本持ち**、
  `currentTime` セット → `seeked` イベント → `canvas.drawImage` でフレームを切り出す。
  表示中のプレーヤーとは分離し、再生位置を汚さない。
- `requestVideoFrameCallback` が使えるブラウザでは提示フレームの精緻化に利用（漸進的強化）。
- **先読みパイプライン**: 現在ショットの入力中に次ショットのサムネ帯（5〜7枚）を
  背景で生成し、遷移を体感即時にする（NFR-001 の 300ms 目標の実現手段）。
- YouTube はピクセル取得不可のためこの機構は起動せず、`seekTo` + タイマーの
  スローループ制御に切り替える（REQ-101、付録マトリクス）。

## データベース 🔵

**信頼性**: 🔵 *REQ-002/406 + ADR-017 §5*

- additive migration 1本（[database-schema.sql](database-schema.sql)）: `shots` 8列 +
  `rallies` 4列の ADD COLUMN のみ。
- **新規 RLS ポリシー不要**: 注釈は既存行の UPDATE のみで、shots / rallies の UPDATE
  ポリシー（FK 経由 `is_member_of`）は data-foundation で定義済み。INSERT / DELETE を行わない。
- 適用は CI 経由 db:push（REQ-406、[[feedback_db_password_ci_only]]）。

## データエンジニアのアナロジー 🔵

- **スタジオ = バックフィル用の人力 UPDATE ジョブ**: 行は増やさず列を埋める。
  リラン安全（何度でも上書き可）・部分実行可（nullable）・進捗はデータから導出
- **順番マッチング = シーケンス番号 join**: タイムスタンプのクロックスキューを避け、
  ラリー内 sequence で突き合わせる
- **プレフィル = 制約からの導出列**: 入力 UI は「制約で決まらない自由度」だけを人に聞く
- **サムネ先読み = プリフェッチ付きカーソル**: 次行の取得を現在行の処理と重ねる

## 品質サマリー

- 🔵: 上記ほぼ全項目（要件・ADR で確定済みの具体化）
- 🟡: サムネイル帯の実装方式（本書で決定、プロトタイプで検証）・コンポーネント名の細部
- 🔴: 0件
