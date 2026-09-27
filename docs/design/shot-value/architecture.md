# shot-value アーキテクチャ設計

**作成日**: 2026-09-16
**要件**: [../../spec/shot-value/requirements.md](../../spec/shot-value/requirements.md)（承認済み）
**見た目の正**: [../../spec/shot-value/sv-drilldown-mock.html](../../spec/shot-value/sv-drilldown-mock.html)

## システム概要

SV（Shot Value）= ショット 1 本ごとのポイント貢献採点を、**RPC は役割カウントの返却まで・
点数化はすべてクライアント**という分担で実装する。shot-stats の探針群と同じ
「読み取り専用 RPC（additive migration）+ クライアント純関数 + Vue コンポーネント」構成。

## 設計判断（design 時確定）

| 論点 | 決定 | 理由 |
|---|---|---|
| RPC の返し方 | 役割**カウント**（点数でなく）を grain: 打者 × 球種 × hand × ゾーン で返す | 重み w/b1/b2 はクライアント定数（REQ-002/401）。変更にマイグレーション不要。役割から score が決まるため平均・分散（CI 用）もカウントだけで厳密に計算できる |
| チーム帰属 | **打順の偶奇 × serving_team**（rn 奇数 = サーブ側）で判定。hit_player_id は使わない | REQ-104（pid null でも位置を消費）。derive.ts の「全接触記録」前提と同一 |
| ゾーン割当 | `stats_shot_placement`（20260808140000）の origin_row/col 計算を**そのまま流用** | ミラー・クランプの規則統一（REQ-004/401） |
| camera_near_team null | placement と違い**ラリーごと除外しない**。ゾーンのみ null にする | 未選択（全体）ビューでは採点対象に含めるため（REQ-101） |
| 選択状態 | ゾーン選択（Set）はコンポーネントローカル状態。RPC 再実行なし | NFR-001。全 grain を初回取得しクライアント合算 |
| チャート実装 | **素の HTML/CSS**（モックと同構造。echarts 不使用） | 中央 0 軸の役割積み上げ + ヒゲは div 配置が最短。既存 StatsCourtZones も同方式 |

## コンポーネント構成

### 新規（app/components/stats/）

- **StatsShotValuePanel.vue** — コンテナ。選択状態 `Set<zoneKey>` を保持し、下記 3 つを束ねる
  - **StatsShotValueCourt.vue** — 自陣 3×3 セレクタ（button セル・複数選択・行ラベル一括・セル内 SV/n・aria-pressed）
  - **StatsShotValueSummary.vue** — 等式チップ（稼いだ − 失った = 収支 ±CI）+ 平易文 + 母数
  - **StatsShotValueBreakdown.vue** — 球種別 5 役割積み上げ行（中央 0 軸・ヒゲ・凡例・n 降順・n<5 薄表示）

### 新規（ロジック・純関数）

- **app/types/shot-value.ts** — RPC 行型・集計結果型・重み型
- **app/utils/shot-value/weights.ts** — `SV_WEIGHTS = { induce: 1.0, setback: [0.7, 0.5] }`（調整定数の唯一の置き場, REQ-002）
- **app/utils/shot-value/score.ts** — 役割カウント → SV100 / 稼いだ・失った成分 / 95%CI / 球種別内訳（検算例 = テストフィクスチャ）
- **app/utils/shot-value/rpc.ts** — RPC 呼び出し（stats-rpc.ts の前例に従う）

### 変更（既存）

| ファイル | 変更 |
|---|---|
| `app/pages/groups/[id]/matches/[matchId]/stats.vue` | タブ 4→3。strengths ペインを SV パネル + StatsWeaknessMaps に改組。weakness タブ・ペイン削除 |
| `app/pages/groups/[id]/stats.vue` | 同上（Group 横断） |
| `i18n/locales/{ja,en}.json` | `shotStats.tabs.strengths` → 「強み・課題」/ "Strengths & Issues"。`tabs.weakness`・`strengths.note`（再考中 placeholder）削除。`shotStats.value.*` 新設 |
| `app/components/stats/StatsWeaknessMaps.vue` | 移設のみ（変更なしが目標） |

### バックエンド

- **supabase/migrations/{ts}_shot_value_read_function.sql** — `stats_shot_value` RPC 1 本（additive）。
  詳細: [database-schema.sql](database-schema.sql) / [api-endpoints.md](api-endpoints.md)

## データの流れ（要約）

stats ページ → `stats_shot_value` RPC（試合 or Group スコープ + セット）→ 役割カウント行
→ クライアント: グローバルフィルタ・打者・hand で行を絞る → ゾーン選択で合算
→ score.ts で重み合成・SV100・CI → 3 コンポーネント描画。詳細: [dataflow.md](dataflow.md)

## テスト戦略（ADR-012 準拠）

- **score.ts 単体**: requirements の検算例 2 種 + service_fault + 短ラリー + 分散/CI + 重み差し替え
- **RPC ロジック相当の SQL は migration 内 CTE**: 役割割当の rn 算術は score.ts と同じ検算例で
  integration テスト（既存 stats RPC テストの前例に従う）
- **コンポーネント**: 選択トグル・行一括・未選択=全体・等式表示・n<5 薄表示・空状態
- **ページ**: タブ 3 構成・強み・課題ペインの構成順・i18n キー整合（check-i18n-keys）

## 実装順の制約（note.md §1 再掲）

実装ブランチ `feat/shot-value` は **PR #60（feature/singles）マージ後に main から**切る。
本設計はそのコードベース（タブ画面・placement RPC・mirror.ts が存在する状態）を前提とする。
