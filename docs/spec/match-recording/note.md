# match-recording コンテキストノート

**作成日**: 2026-06-05
**作業規模**: フル機能開発

## 1. このユニットの位置づけ

MVP 最後尾の**統合ユニット（最大）**。上流（rule-engine / video-playback / match-management / player-management）をすべて消費し、録画系テーブルへ書き込む。ADR-002 の依存順では `... → video-playback → match-recording → stats-dashboard`。

データエンジニア向けアナロジー: match-recording は「ストリーム取り込み + 状態計算 + 永続化」を担う ETL の取り込み層。video-playback がソース抽象（再生位置の取得）、rule-engine が純粋な状態遷移関数（副作用なし）、match-recording がそれらをオーケストレーションして DB へ denormalize 保存する。stats-dashboard は保存済みの状態を SQL で集計するだけ（[[project_state_storage]]）。

## 2. 消費する上流（確定済の所与）

| 上流 | 提供物 | 利用形態 |
|---|---|---|
| match-management | `matches` マスタ（4選手 + 動画ソース + 試合名 + 試合日付） | 録画対象の試合として所与。**UI はまだ未実装（pages なし）= 実装上の依存** |
| video-playback | 統一プレーヤー composable（ms 現在時刻取得・シーク・速度・状態・オーバーレイスロット） | composable 経由で利用。依存方向 match-recording → video-playback 一方向 |
| rule-engine | `app/utils/rule-engine/`：`createInitialState` / `applyRally` / `applyOverride` / `determineSetWinner` + `GameState` 型 | 純関数として呼ぶ。DB 保存は match-recording 側の責務 |
| player-management | `players`（選手マスタ、未削除） | 立ち位置・サーバー/レシーバーの選手参照 |

### rule-engine 公開 API（app/utils/rule-engine/index.ts）

- `createInitialState(config: SetConfig, positions: SetPlayerPosition[]) → GameState`
- `applyRally(state: GameState, rally: RallyResult) → GameState`（インクリメンタル）
- `applyOverride(state: GameState, team: Team) → GameState`（状態を持たないトグル）
- `determineSetWinner(...) → SetResult | null`
- `GameState` = `{ score, servingTeam, server, receiver, serverPosition, positions }`

→ `GameState` の各値が `rallies` の denormalize 列に1:1 対応する（後述）。

## 3. 書き込む録画系テーブル（data-foundation で確定済・RLS 済 → DELETE ポリシー追記1本のみ）

| テーブル | 役割 | MVP |
|---|---|---|
| `sets` | セット設定（target_points / enable_deuce / deuce_point_cap / first_serving_team / camera_near_team_at_start / winner） | ✅ |
| `set_player_positions` | セット開始時の4選手立ち位置（team × left/right、4行） | ✅ |
| `rallies` | ラリー（rally_number / serving_team / server_position / server_player_id / receiver_player_id / camera_near_team / video_start_timestamp_ms / point_winner / is_let / is_point_confirmed） | ✅ |
| `shots` | ショット（shot_number / video_timestamp_ms / input_source='manual'） | ✅ |
| `position_overrides` | 左右入れ替わり（team / override_type='swapped'\|'restored'） | ✅ |
| `recording_gaps` | 動画断絶 | ❌ **MVP 対象外**（テーブルは将来利用） |

RLS は全テーブル FK 経由で `is_member_of(matches.group_id)` をチェック（database-schema.sql:367-）。

> **追記マイグレーション1本（2026-06-05）**: undo（REQ-110）を**物理削除**で行う方針に確定。録画系テーブルは現状 DELETE ポリシーが無い（SELECT/INSERT/UPDATE のみ）ため、`rallies` / `shots` / `position_overrides` に **DELETE RLS ポリシー追加の additive migration を1本**加える（data-foundation 側、CI db:push、match-management の name/match_date 追加と同じ前例）。＝「マイグレーション完全不要」ではなく「DELETE ポリシー追記1本」。

## 4. ヒアリングで確定した判断（2026-06-05）

1. **ショット記録**: MVP に**含める**（PRD F-02 通り）。「打った」で各ショット ms を `shots` に記録。F-04 の「ショット数 × 得点率」分析の基盤。
2. **recording_gaps**: MVP **対象外**。連続した試合動画を前提とし、断絶入力 UX は実使用後に再検討。
3. **セット進行**: 勝敗検知し**手動で次セット**。rule-engine がセット勝者を検知したら「次のセットへ」を提示（自動遷移しない）。先攻＝前セット勝者を既定提示。
4. **修正範囲**: **直前ラリーのみ**編集可（[[project_rally_correction]]）。engine は内部的にそれ以降を再計算するが、UI は直前ラリーの修正に限定して単純化。
5. **カメラ視点**: **セット開始時に1回設定**（`camera_near_team_at_start` のみ）。ラリー単位の視点変更は MVP 対象外。

## 5. 着手前から見えている論点

- ⚠️ **position_overrides の swapped/restored vs engine のステートレストグル**: DB は `override_type IN ('swapped','restored')` の2値、rule-engine `applyOverride` は状態を持たないトグル。**解消方針**: PRD F-02 が「変わった」→「戻った」の2アクション入力を明記。match-recording が当該チームの現在トグル状態（偶数回目=swapped / 奇数回目=restored）からラベルを決定して `position_overrides` に保存し、engine へは `applyOverride(state, team)` を渡す。DB＝意味ラベル、engine＝トグル適用、で両立する（要件 REQ-105）。
- **override 入力タイミング問題**: 再生しながら「ラリー開始」と「Override」の同時操作が難しい（[[project_override_ux]]）。MVP ではラリー開始後でも override 可能とし、実プロトタイプで再検証（NFR-203、kairo-design）。
- **ルート規約**: PRD は `/matches/:id/record` だが、実コードの規約は `/groups/[id]/...`（player-management 実績）。本ユニットは `/groups/[id]/matches/[matchId]/record` に整合させる。
- **match-management UI 未実装**: 録画への導線（試合一覧→録画開始）は match-management の UI に依存。match-recording 単体でも matchId 直 URL で動作可能にしつつ、導線は match-management 完成を待つ。
- **スキップ ↔ rule-engine の必須制約**: rule-engine は `pointWinner` 必須（null 不可、REQ-403）。スキップ（未確定）ラリーは engine に渡せないため、確定までサーバー/レシーバー保留の扱いが必要（EDGE-003）。

## 6. 規約踏襲

- ルート `/groups/[id]/matches/[matchId]/record`（CSR、ブラウザ専用 API のため）
- 操作別 composable（ADR-007）— 具体分割は kairo-design
- 全文言 i18n（ja/en、キー一致 CI）
- Nuxt UI v4
- テストは Zod schema・composable エラー処理・分岐ロジックに限定（ADR-012 + [[feedback_test_coverage]]）
- エラー処理は cross-cutting/error-handling.md（フォーム=inline、保存失敗=toast）

## 7. 関連文書

- [requirements.md](requirements.md) / [interview-record.md](interview-record.md) / [user-stories.md](user-stories.md) / [acceptance-criteria.md](acceptance-criteria.md)
- PRD §F-02/§F-03/§5.2/§5.4: [badminton_analytics PRD](../../../.dcs/20260328153038_badminton_analytics/prd.md)
- DBスキーマ: [data-foundation/database-schema.sql](../../design/data-foundation/database-schema.sql)
- rule-engine 実装: `app/utils/rule-engine/`
- 上流仕様: [match-management](../match-management/requirements.md) / [video-playback](../video-playback/requirements.md) / [rule-engine](../rule-engine/requirements.md)
- ADR-002 分割 / ADR-007 composable / ADR-010 SSR/CSR / ADR-012 テスト戦略
