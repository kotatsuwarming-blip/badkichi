# match-recording 設計ヒアリング記録

**作成日**: 2026-06-05
**ヒアリング実施**: step4 既存情報ベースの差分ヒアリング

## ヒアリング目的

要件定義（スコープ・挙動は確定済）を踏まえ、技術実現の「背骨」となる設計判断を確定するためのヒアリングを実施した。お任せモード（[[feedback_claude_lead_with_pros_cons]]）に従い、一般的な技術決定は Claude が pros/cons で主導し、データエンジニアの分析観点・信頼性に直結する2点のみユーザーに委ねた。

## 質問と回答

### Q1: 録画中の状態の所有とオーケストレーション

**質問日時**: 2026-06-05
**カテゴリ**: アーキテクチャ
**背景**: rule-engine の `GameState` + 蓄積ラリー/ショットをどこが保持するかで、テスト容易性（NFR-303）と理解負債の返済しやすさ（[[feedback_understanding_debt]]）が変わる。

**回答**: **useRecordingSession 集約（推奨）**

**信頼性への影響**:
- アーキテクチャを「集約オーケストレータ + 操作別 composable」に確定（🔵）。`useRecordingSession` が GameState を所有し、page から `getCurrentTimeMs` を注入してテスト可能化。

---

### Q2: Supabase への永続化タイミング

**質問日時**: 2026-06-05
**カテゴリ**: パフォーマンス / データ整合性
**背景**: 「打った」は NFR-001 で押下→記録 100ms 以内が要件。同期書き込みはレイテンシが UX に乗る。一方データエンジニアとして整合性（DB が真実）を好む可能性もあり、トレードオフの提示が必要だった。

**経過**: 初回は「意味がわからない」との回答 → 同期/楽観+非同期/ハイブリッドの3方式をデータエンジニア文脈（同期COMMIT vs write-behind）で具体例つき再説明（[[feedback_tech_decisions]]）。

**回答**: **③ ハイブリッド（推奨）** — ショット/得点/override=楽観ローカル+非同期 write-behind、セット作成/立ち位置/セット決着(winner)/ラリー行生成=同期 await。

**信頼性への影響**:
- 永続化戦略を確定（🔵）。ホットパス（高頻度）は 100ms 要件を満たし、トランザクション境界（FK 親）は整合性を保つ。
- ラリー行の「遅延生成（初ショット時に1回同期 insert）」設計が導出された（shots の FK 親 id 確定のため）。

---

## Claude が主導で決定した事項（pros/cons 提示済・要件/実装から導出）

| 決定 | 内容 | 出典 |
|---|---|---|
| ルート | `/groups/[id]/matches/[matchId]/record`（CSR） | 既存規約 `/groups/[id]/` + REQ-408 |
| 動画プレーヤー所有 | page が `useVideoPlayer` を所有し session へ `getCurrentTimeMs` 注入 | NFR-303 テスト容易性 |
| ラリー行ライフサイクル | 遅延生成→ショット楽観→得点で point_winner 楽観 update + engine 前進 | rallies スキーマ + GameState 意味論 |
| GameState→rallies 写像 | `map-game-state.ts` 純関数に集約、修正/override も同写像で上書き | REQ-410 denormalize 一貫性 |
| override_type 決定 | トグル回数の偶奇で swapped/restored を決定、engine へは applyOverride(team) | REQ-105 不整合解消（PRD §F-02 2アクション） |
| composable 分割 | Read 3 + Write 8（操作別） | ADR-007 / NFR-302 / 既存 useCreateMatch・useMatches 準拠 |
| DBスキーマ/API | 新規生成なし（録画系テーブル確定済 + PostgREST/rule-engine 利用） | REQ-406/403 |

## ヒアリング結果サマリー

### 確認できた事項
- 状態所有 = useRecordingSession 集約
- 永続化 = ハイブリッド（ホットパス楽観 / 境界同期）

### 設計方針の決定事項
- 集約オーケストレータ + 操作別 composable（Read 3 / Write 8）
- ラリー行の遅延生成 + GameState denormalize 写像の純関数化
- 動画プレーヤーは page 所有・session へ時刻注入（テスト容易性）

### 残課題（kairo-tasks / 実装時に確定）
- 試合勝者の先取セット数ルール（REQ-011 / matchWinner）🟡
- override 入力フローのプロトタイプ検証（NFR-203 / [[project_override_ux]]）🟡
- 楽観書込の「未同期」可視化と離脱前ガードの具体 UI 🟡

### 信頼性レベル分布

**ヒアリング前**: 永続化戦略・状態所有が未確定（🟡）

**ヒアリング後**: architecture 🔵95% / dataflow 🔵100% / interfaces 🔵95%

## 関連文書

- **アーキテクチャ設計**: [architecture.md](architecture.md)
- **データフロー**: [dataflow.md](dataflow.md)
- **型定義**: [interfaces.ts](interfaces.ts)
- **要件定義**: [requirements.md](../../spec/match-recording/requirements.md)
