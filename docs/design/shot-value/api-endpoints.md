# shot-value API 仕様（Supabase RPC）

**作成日**: 2026-09-16
REST エンドポイントは追加しない。Supabase RPC 1 本のみ（読み取り専用, REQ-401）。

## stats_shot_value

SV 採点の**役割カウント**を grain（打者 × 球種 × hand × ゾーン）で返す。
点数化（重み合成・SV100・CI）はクライアント（`app/utils/shot-value/score.ts`）。

### 引数

| 名前 | 型 | 既定 | 意味 |
|---|---|---|---|
| p_match_id | uuid | NULL | 試合単位スコープ（p_group_id と排他。両方/どちらも無しは `invalid_scope` 例外） |
| p_group_id | uuid | NULL | Group 横断スコープ |
| p_match_ids | uuid[] | NULL | グローバルフィルタの試合絞り込み（Group 横断時） |
| p_set_number | smallint | NULL | セット絞り込み |
| p_zones | int | 3 | ゾーン分割数（3×3 固定運用。placement と同じ引数形） |

打者・hand の絞り込みは**引数にしない**（grain に含まれるためクライアント側。
ゾーン選択/フィルタ切替で RPC を再実行しない = NFR-001）。

### 返却行

```
hit_player_id uuid      -- null の打者は出力されない（REQ-104。役割の位置消費は済み）
shot_type     text      -- null は 'unknown'（REQ-103）
hand          text|null
zone_row      int|null  -- 0=自陣バック〜2=ネット際。null=座標なし/camera_near_team null
zone_col      int|null  -- 0=打者視点左
n             bigint    -- 総打数（分母）
kime / yuhatsu / fuseki1 / fuseki2 / miss / yurushi1 / yurushi2  bigint  -- 役割カウント
```

### 対象ラリーの条件（scoped CTE）

- `is_let = false` / `is_point_confirmed = true` / `point_winner IS NOT NULL`
- `end_reason IN ('floor','body','net','not_over','service_fault')`（REQ-102: null/unknown は分母にも入れない）
- `camera_near_team IS NULL` は**除外しない**（ゾーンのみ null。REQ-101 — placement との差分）

### クライアント利用（app/utils/shot-value/rpc.ts）

```ts
const { data, error } = await client.rpc('stats_shot_value', {
  p_match_id: matchId // または p_group_id + p_match_ids
})
// error は stats-dashboard の前例どおり useStatsView 系のエラーパスへ
```

### 呼び出しタイミング

- stats ページ表示時（試合単位 / Group 横断）に 1 回。セット切替時のみ再実行
- ゾーン選択・打者/hand フィルタ・重み変更では再実行しない
