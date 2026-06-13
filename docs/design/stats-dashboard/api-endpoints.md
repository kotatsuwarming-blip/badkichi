# stats-dashboard API / RPC 仕様

**作成日**: 2026-06-08
**関連設計**: [architecture.md](architecture.md) / [database-schema.sql](database-schema.sql)
**関連要件定義**: [requirements.md](../../spec/stats-dashboard/requirements.md)

**【信頼性レベル凡例】**:
- 🔵 **青信号**: 要件定義・確定スキーマ・ヒアリングを参考にした確実な定義
- 🟡 **黄信号**: 妥当な推測による定義
- 🔴 **赤信号**: 出典のない推測

---

## 共通仕様 🔵

**信頼性**: 🔵 *既存 @nuxtjs/supabase 利用パターン（useJoinGroup / useMatches）*

- **新規 REST API は作らない**。Supabase の **RPC（読み取り専用関数）** と **PostgREST** を `useSupabaseClient<Database>()` 経由で利用する。
- 認証: 既存 Supabase Auth（middleware で Group 所属を担保）。RPC は `SECURITY INVOKER` で RLS を継承。
- スコープ: 各 RPC は `p_match_id` / `p_group_id` の**いずれか一方のみ**指定。両方 NULL / 両方指定は `invalid_scope` エラー。
- 型: `app/types/supabase.ts`（gen-types CI で migration から自動再生成, [[project_gen_types_automation]]）に RPC シグネチャが反映される。

## エラー 🔵

**信頼性**: 🔵 *cross-cutting error-handling + useNoticeErrors*

| エラー | 発生条件 | UI 対応 |
|---|---|---|
| `invalid_scope` | スコープ引数の指定誤り（実装バグ） | 開発時に検出。ユーザーには汎用エラートースト |
| RLS による空配列 | 他 Group / 未所属 | 空状態（REQ-103/201）。エラーにしない |
| local URL 失効 | 再生時（RPC ではなくプレーヤー） | 再選択を促す（REQ-102） |

---

## RPC 一覧

### 1. `stats_player_rates(p_match_id, p_group_id)` 🔵

**信頼性**: 🔵 *REQ-003 / database-schema.sql*
**関連要件**: REQ-003, REQ-101, REQ-202

選手別のサービス/レシーブ得点率の母数・分子。確定ラリーのみ集計。

**呼び出し（試合単位）**:
```ts
const { data, error } = await client.rpc('stats_player_rates', { p_match_id: matchId })
// data: { player_id, serve_total, serve_won, receive_total, receive_won }[]
```
**呼び出し（Group 横断）**: `{ p_group_id: groupId }`

**クライアント後処理**: `computePlayerRate(total, won)` で `rate|null + 母数`（0 除算→null, EDGE-001 / NFR-201）。

---

### 2. `stats_pair_rates(p_match_id, p_group_id)` 🔵

**信頼性**: 🔵 *REQ-012 / ヒアリング2026-06-08*
**関連要件**: REQ-012

ペア別（同一チーム 2 選手）の得点率。`player1_id < player2_id` に正規化。

```ts
const { data } = await client.rpc('stats_pair_rates', { p_group_id: groupId })
// data: { player1_id, player2_id, serve_total, serve_won, receive_total, receive_won }[]
```

**用途**: 「ペア別」表示・クロスフィルタ（REQ-012）。per-match では当該試合の 2 ペア（旧「チーム視点」＝A/B ラベルではなく実際の 2 人）として表示し、ペア→個人へドリルダウン（REQ-004）。

---

### 3. `stats_rally_length(p_match_id, p_group_id)` 🔵

**信頼性**: 🔵 *REQ-005 / ヒアリング2026-06-08（本数分布 + 勝率）*
**関連要件**: REQ-005, EDGE-102

ラリー長別の本数分布 + サーブ側勝数。`shot_count = 0` は除外。

```ts
const { data } = await client.rpc('stats_rally_length', { p_match_id: matchId })
// data: { shot_count, rallies, serve_won }[]
```

**クライアント後処理**: `toRallyLengthSeries` で 本数（棒）+ サーブ側勝率（線 = `serve_won / rallies`）。

---

### 4. `stats_rallies(p_match_id, p_group_id, filters…, p_limit, p_offset)` 🔵

**信頼性**: 🔵 *REQ-006/007/010/104 / database-schema.sql*
**関連要件**: REQ-006, REQ-007, REQ-010, REQ-104, EDGE-103

ラリー行（テーブル / クロスフィルタ / 再生）。全ライブラリー（レット・未確定含む）。動画ソース同梱。

**引数**:

| 引数 | 型 | 既定 | 用途 |
|---|---|---|---|
| `p_match_id` / `p_group_id` | uuid | – | スコープ（一方のみ） |
| `p_server_player_id` | uuid | null | サーバー絞り込み（選手フィルタ・serve役割） |
| `p_receiver_player_id` | uuid | null | レシーバー絞り込み（選手フィルタ・receive役割） |
| `p_pair_player1_id` / `p_pair_player2_id` | uuid | null | ペア絞り込み（REQ-012） |
| `p_role` | text | null | `'serve'` / `'receive'`。選手・ペアフィルタの役割連動（ヒアリング2026-06-09） |
| `p_shot_ranges` | jsonb | null | ラリー長ビンの和集合。例 `[{"min":1,"max":3},{"min":13,"max":null}]`（複数ビン OR, ヒアリング2026-06-09） |

> チーム A/B はフィルタ軸にしない。集計・絞り込みのキーは選手 / ペア（player_id）。A/B は serve/receive 判定の内部利用のみ（ヒアリング2026-06-09）。
| `p_limit` | int | 200 | 上限（最大 1000） |
| `p_offset` | int | 0 | ページング |

**呼び出し（試合単位・全件取得 → クライアント絞り込み）**:
```ts
const { data } = await client.rpc('stats_rallies', { p_match_id: matchId })
// 以降の絞り込みは filterRallies(rows, filter) でクライアント側（往復なし, REQ-010）
```

**呼び出し（Group 横断・絞り込み後にサーバー側取得）**:
```ts
const { data } = await client.rpc('stats_rallies', {
  p_group_id: groupId,
  p_server_player_id: filter.playerId,    // または pair / team / shots
  p_limit: 200
})
// 初期はチャートのみ。フィルタ確定で本 RPC を発行（大量ロード回避, ヒアリング2026-06-08）
```

---

## PostgREST 補助クエリ 🔵

**信頼性**: 🔵 *既存 useMatches / usePlayers パターン*

集計に含まれない表示用マスタ（選手名・試合名・ロスター）は既存 PostgREST 埋め込みで取得:
- 選手名解決: `players`（`id, name`）を Group 単位で取得しクライアントで join（RallyRow.* の player_id → name）。
- per-match のロスター（ペア → 個人ドリルダウンの選手名解決, REQ-004）: `matches` の複合 FK 埋め込み（**制約名ヒント**, useMatches 既知パターン）または `set_player_positions`。

> 注: 得点率・ラリー長・ラリー行の**集計/抽出は RPC**（NFR-002）。PostgREST は**マスタ名の解決**に限定し、集計ロジックを二重実装しない。

## レート制限 / バージョニング / CORS 🟡

**信頼性**: 🟡 *Supabase 既定に従う*

- Supabase のプロジェクト既定設定に従う（本単位で独自設定は追加しない）。

## 関連文書

- **アーキテクチャ**: [architecture.md](architecture.md)
- **型定義**: [interfaces.ts](interfaces.ts)
- **DBスキーマ（関数本体）**: [database-schema.sql](database-schema.sql)
- **データフロー**: [dataflow.md](dataflow.md)
- **要件定義**: [requirements.md](../../spec/stats-dashboard/requirements.md)

## 信頼性レベルサマリー

- 🔵 青信号: 9 件 (90%)
- 🟡 黄信号: 1 件 (10%)
- 🔴 赤信号: 0 件 (0%)

**品質評価**: 高品質
