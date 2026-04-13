# ADR-002: 要件の分割方針

## ステータス
Accepted (2026-04-07)

## 背景
badkichi の PRD（`.dcs/20260328153038_badminton_analytics/prd.md`）では MVP として 4 つの主要機能（F-01〜F-04）を定義している。tsumiki の `kairo-requirements` ワークフローを実行する前に、この PRD をどの粒度で要件単位に分割するかを決める必要がある。

分割方針は以下に影響する：
- 各要件定義書のサイズとレビューのしやすさ
- 実装順序と依存関係の管理
- テスト境界（特に TDD の単位）
- 動くものをいつ最初にデモできるか
- 各単位が PRD のどの機能に対応するかの明確さ

開発者はデータエンジニアで Web 開発初学者のため、データパイプラインのアナロジーを使って整理する。

## 事前に解決すべき論点

トップレベルの分割方針を決める前に、以下 4 つの論点に答える必要がある：

1. **F-02 の分割粒度**: 「動画再生」と「ラリーデータ入力」を 1 つにするか、2 つに分けるか？
2. **選手管理の位置付け**: 試合管理に含めるか、独立させるか？
3. **データモデルの位置付け**: 独立した単位とするか、ルールエンジンと一緒か、試合管理と一緒か？
4. **左右入れ替わり（PositionOverride）の扱い**: ルールエンジンの責務か、入力UIの責務か、両方にまたがるか？

---

## 論点ごとの議論と結論

### Q1: F-02 の分割粒度

| 方針 | メリット | デメリット |
|------|----------|------------|
| 動画再生と入力をまとめる | PRD F-02 と直接対応。録画画面は1つの UX。 | 単位が大きい。「動画を再生する」（技術基盤）と「ラリーを記録する」（ドメインロジック+UX）が混在。 |
| **video-playback と match-recording に分割** ✅ | 動画プレーヤー抽象は再利用可能（統計画面のラリージャンプ）。各単位が小さい。動画プレーヤーをモック化して match-recording をテストできる。 | ドキュメントが2つになる。事前計画が少し増える。 |

**結論**: **分割する**。動画プレーヤー抽象（VideoPlayer インターフェース）は録画と統計の両方で必要。録画画面側は動画プレーヤーを「黒箱」として使うことで、責務が明確になりテスト容易性が上がる。

データエンジニア的アナロジー: データソースの抽象化レイヤー（S3 でも GCS でも同じインターフェースで読めるようにする）と同じ発想。

---

### Q2: 選手管理の位置付け

| 方針 | メリット | デメリット |
|------|----------|------------|
| 試合管理と一緒（match-management のみ） | 小さい機能なので独立ドキュメント不要。PRD F-01 に対応。 | 選手属性が増えると、単位も膨らむ。 |
| **player-management と match-management に分割** ✅ | 所有権が明確。将来の属性追加（性別、レベル等）に備えやすい。選手は試合とは独立した存在として管理される。 | 単位が1つ増える。 |

**結論**: **分割する**。選手は試合とは独立した「人」として扱いたいため。

---

### Q3: データモデル / インフラの位置付け

データモデル（DB スキーマ）とマルチテナント基盤の議論を経て、以下の事実が判明した：

- **マルチテナント設計**: Group 単位でのデータ共有（共有DB + RLS パターン）を採用
- **Group / GroupMember は全機能の前提**: ユーザー認証とデータスコープに直結
- **同じテーブルが複数の単位で参照される**: 例えば Rally テーブルは match-recording（書き込み）と stats-dashboard（読み込み）と rule-engine（型として）から触られる
- **Supabase セットアップ作業**: プロジェクト作成、認証設定、RLS ポリシー、マイグレーション運用などが必要

| 方針 | メリット | デメリット |
|------|----------|------------|
| 各単位に重複してスキーマを書く | - | スキーマドリフトの典型的なリスク |
| 最初の単位（player-management）が所有 | 単位数が増えない | 所有権が曖昧。後の単位がスキーマ変更を要求した時に責任が不明 |
| **`data-foundation` として独立** ✅ | スキーマの一元管理。Group/RLS などの基盤も含めて1か所で管理。各機能単位は「使う」立場として書ける | 単位が1つ増える（6 → 7） |

**結論**: **`data-foundation` を独立した単位とする**。含まれる作業：

- Supabase プロジェクトの作成・接続設定
- 認証（Supabase Auth）の設定
- 全テーブルのスキーマ定義（CREATE TABLE 群）
- Group / GroupMember を中心としたマルチテナント基盤
- Row Level Security（RLS）ポリシーの設定
- マイグレーション運用ルール
- Nuxt 側の Supabase クライアント設定

データエンジニア的アナロジー: dbt の `models/core/` 層を独立したプロジェクトとして管理する発想。または Snowflake のスキーマ定義を専用リポジトリで管理し、各データプロダクトはそれを参照する形。

---

### Q4: 左右入れ替わり（PositionOverride）の扱い

PositionOverride の議論では以下が確認された：

- 通常のラリーでの左右入れ替わり（同じサーバー連続得点、サーブ権移動）はルールエンジンが自動計算するため記録不要
- PositionOverride は **人為的ミス**（本来立つべき位置と違う場所に立った）だけを記録する
- ダブルスではペアの2人が必ず一緒にズレるため、**チーム単位のイベント**で表現する（player_id ではなく team で記録）

| 方針 | メリット | デメリット |
|------|----------|------------|
| ルールエンジンの責務にする | 計算ロジックが集約される | 入力 UI 仕様も rule-engine に書くことになり違和感 |
| 録画 UI の責務にする | 入力 UI 仕様が集約される | ルール推論ロジックが match-recording に染み出す |
| **両方にまたがる** ✅ | 各単位が自分の責務だけを持つ。テーブル定義は data-foundation。 | 単位間の調整が必要 |

**結論**: **両方にまたがる**。具体的な責務分担：

- **data-foundation**: PositionOverride テーブルのスキーマ定義
- **match-recording**: 「入れ替わった」「戻った」ボタンUI、INSERT 操作、ユーザーフィードバック
- **rule-engine**: PositionOverride のデータを引数として受け取り、現在ポジションを計算する純関数

rule-engine の関数シグネチャ（イメージ）:

```typescript
function computeCurrentPositions(
  initialPositions: SetPlayerPosition[],
  rallies: Rally[],
  overrides: PositionOverride[]
): { teamA: { left: PlayerId, right: PlayerId }, teamB: { ... } }
```

rule-engine は DB を一切触らず、引数を受け取って結果を返すだけ。これによりユニットテストが容易になる。インターフェースは PositionOverride テーブル（data-foundation で定義）。

---

## トップレベルの分割方針

サブ論点を解決した結果、以下の選択肢のうち **拡張版D（ハイブリッド）** を採用する：

```
rule-engine（純ロジック）
  → data-foundation（Supabase 基盤 + 全スキーマ）
    → player-management
      → match-management
        → video-playback
          → match-recording
            → stats-dashboard
```

### 採用しなかった選択肢

- **A. PRD機能単位（F-01〜F-04）**: F-02 が肥大化、データモデル所有権が不明確
- **B. ユーザー操作フロー順**: ルールエンジンが埋もれる、純ロジックと UI が混在
- **C. 技術レイヤー**: 実装後半までデモできるものがない

---

## 決定

**7 単位に分割する**。各単位の責務と依存関係：

| # | 単位 | 主な責務 | 依存 |
|---|------|----------|------|
| 1 | **rule-engine** | 純 TypeScript ロジック。サーバー/レシーバー推論、スコア状態、レット処理、PositionOverride 消費 | なし |
| 2 | **data-foundation** | Supabase セットアップ、認証、全テーブルのスキーマ、Group/GroupMember マルチテナント基盤、RLS ポリシー、マイグレーション | なし |
| 3 | **player-management** | 選手 CRUD（名前・利き手） | data-foundation |
| 4 | **match-management** | 試合作成（4人選択、初期立ち位置、動画ソース）、Group 管理 | data-foundation, player-management |
| 5 | **video-playback** | YouTube IFrame API + HTML5 Video API の統一インターフェース。録画と統計の両方で利用 | なし |
| 6 | **match-recording** | 録画画面 UI。ルールエンジン + 動画プレーヤー + 入力コントロール（ショットタイミング、得点、レット、スコア修正、PositionOverride イベント）の統合 | rule-engine, data-foundation, match-management, video-playback |
| 7 | **stats-dashboard** | サービス/レシーブ得点率チャート、ラリー長分析、動画ジャンプ機能付きラリー一覧 | data-foundation, match-recording, video-playback |

### 実装順序

```
1. rule-engine（純ロジック、Day 1 から完全テスト可能）
  ↓
2. data-foundation（Supabase 基盤、全スキーマ確定）
  ↓
3. player-management（選手 CRUD）
  ↓
4. match-management（試合作成、Group 管理）
  ↓
5. video-playback（動画プレーヤー抽象）
  ↓
6. match-recording（録画画面、最大の単位）
  ↓
7. stats-dashboard（分析画面）
```

**並列化の余地**: rule-engine と data-foundation は依存関係がないため、論理的には並列開発可能。video-playback も独立しているため、match-management と並列にできる。実際の開発スピードと余裕に応じて判断する。

## 影響

- 要件定義書は `docs/spec/{単位名}/` 配下に配置
- 各単位は kairo ワークフロー全体（requirements → design → tasks → TDD）を独立して通る
- 単位間の依存は明示的に追跡が必要（特に match-recording は rule-engine、video-playback、match-management、data-foundation のすべてに依存する統合単位）
- `match-recording` は依然として最大の単位。`kairo-tasks` 段階で内部分割が必要になる可能性がある
- データモデルの全体像は `data-foundation` の要件定義書に集約される。各機能単位は「data-foundation で定義された ○○ テーブルを使う」と参照する形で書く
