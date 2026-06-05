# match-recording 受け入れ基準

**作成日**: 2026-06-05
**関連要件定義**: [requirements.md](requirements.md)
**関連ユーザストーリー**: [user-stories.md](user-stories.md)
**ヒアリング記録**: [interview-record.md](interview-record.md)

**【信頼性レベル凡例】**:
- 🔵 **青信号**: PRD・確定スキーマ・ADR・上流実装・ユーザヒアリングを参考にした確実な基準
- 🟡 **黄信号**: 上記から妥当な推測による基準
- 🔴 **赤信号**: 出典のない推測による基準

---

## REQ-002/003: セット設定 + 初期立ち位置の作成 🔵

**信頼性**: 🔵 *sets / set_player_positions 定義 + rule-engine SetConfig*

### Given（前提条件）
- 録画画面を開いており、対象セットが未作成

### When（実行条件）
- 目標点・デュース・上限点・先攻・カメラ手前チームを設定し、4選手の左右を入力して保存する

### Then（期待結果）
- `sets` に1行（`camera_near_team_at_start` 含む）、`set_player_positions` に4行が作成される
- rule-engine `createInitialState` で初期 GameState（最初のサーバー/レシーバー）が得られる

### テストケース

#### 正常系
- [ ] **TC-002-01**: 目標21・デュース有・上限30・先攻A・カメラ手前A + 立ち位置4件 → `sets` 1行 + `set_player_positions` 4行 🔵
- [ ] **TC-002-02**: createInitialState の出力（先攻Aの最初のサーバー）が立ち位置から正しく決まる 🔵 *rule-engine REQ-001/003*

#### 異常系・境界値
- [ ] **TC-002-E01**: 同一 (team, position) に2選手 → UNIQUE(set_id, team, position) 違反、UI 段階で拒否 🔵 *EDGE-002*
- [ ] **TC-002-E02**: 立ち位置が4件未満で保存 → 拒否（ダブルス4選手必須） 🔵
- [ ] **TC-002-B01**: デュース無効（enable_deuce=false）・目標15 → 延長なしで保存可 🟡 *rule-engine REQ-102 から*

---

## REQ-005/101: ショットタイミング記録 🔵

**信頼性**: 🔵 *PRD §F-02 + shots 定義 + video-playback REQ-004/201*

### Given（前提条件）
- 動画が再生可能（ロード済）で、現在ラリーが進行中

### When（実行条件）
- 「打った」を押す

### Then（期待結果）
- video-playback の現在 ms を取得し `shots`（video_timestamp_ms / shot_number / input_source='manual'）に記録
- タイムラインのオーバーレイに痕跡が表示される

### テストケース

#### 正常系
- [ ] **TC-005-01**: 再生中に「打った」3回 → 同一ラリーに shot_number 1/2/3 が ms 付きで記録 🔵
- [ ] **TC-005-02**: 記録までの遅延が 100ms 以内 🔵 *NFR-001*

#### 異常系
- [ ] **TC-005-E01**: 動画未ロード（現在時刻 null）で「打った」 → 記録されない（無効化 or no-op） 🔵 *EDGE-001 / REQ-101*

---

## REQ-006/007/410: ラリー結果入力とサーバー/レシーバー自動特定 🔵

**信頼性**: 🔵 *PRD §F-02/§F-03 + rule-engine GameState + ② B-7 denormalize*

### Given（前提条件）
- 初期立ち位置入力済で GameState が確定している

### When（実行条件）
- 「チームA得点」を押す

### Then（期待結果）
- rule-engine `applyRally` が次のサーバー/レシーバー・サーバー位置・スコアを算出
- `rallies` に denormalize 保存（serving_team / server_position / server_player_id / receiver_player_id）
- スコア・次サーバー/レシーバーがリアルタイム表示される（100ms 以内）

### テストケース

#### 正常系
- [ ] **TC-007-01**: A 得点 → サービング維持・同サーバーが左右入替（rule-engine REQ-010） → rallies に保存 🔵
- [ ] **TC-007-02**: B 得点（レシーブ側得点） → サーブ権が B に移り、得点偶奇に応じた選手がサーバー（REQ-011） → rallies に保存 🔵
- [ ] **TC-007-03**: rallies の状態列5項目が GameState 出力と一致（SQL 集計可能な状態） 🔵 *REQ-410 / [[project_state_storage]]*

#### 境界値
- [ ] **TC-007-B01**: スコア偶数→サーバー右コート / 奇数→左コート 🔵 *rule-engine REQ-003*

---

## REQ-103/104: スキップと後確定 🔵

**信頼性**: 🔵 *PRD US-05 + rallies is_point_confirmed + rule-engine REQ-403*

### Given（前提条件）
- 得点者が判断できないラリーがある

### When（実行条件）
- 「スキップ」を押し、後で得点者を確定する

### Then（期待結果）
- スキップ時: `point_winner=NULL` / `is_point_confirmed=false` で保留、推論は保留
- 確定時: `is_point_confirmed=true` とし engine に渡してサーバー/レシーバーを確定保存

### テストケース

#### 正常系
- [ ] **TC-104-01**: スキップ → 当該ラリーが未確定として保存され、サーバー/レシーバーは保留 🔵
- [ ] **TC-104-02**: 後から A 確定 → is_point_confirmed=true + engine 推論結果を保存 🔵

#### 異常系
- [ ] **TC-104-E01**: 未確定ラリーを残したまま次ラリー記録 → engine に未確定を渡さず推論保留、UI で未確定明示 🔵 *EDGE-003*

---

## REQ-102: レット記録 🔵

**信頼性**: 🔵 *PRD §F-02 + rule-engine REQ-006*

### テストケース
- [ ] **TC-102-01**: 「レット」 → is_let=true / point_winner=NULL、ラリー番号採番、スコア不変 🔵
- [ ] **TC-102-E01**: レット連続2回 → 番号は採番されスコアは不変 🔵 *EDGE-010*

---

## REQ-105: 左右入れ替わり（override） 🔵

**信頼性**: 🔵 *PRD §F-02 + rule-engine REQ-104/105 + position_overrides 定義*

### Given（前提条件）
- チームAが左右を間違えた

### When（実行条件）
- override を押す（入れ替わり） → 後で再度押す（戻り）

### Then（期待結果）
- 1回目: `override_type='swapped'` を記録し engine トグルで A の左右反転
- 2回目: `override_type='restored'` を記録し engine トグルで元に戻る

### テストケース

#### 正常系
- [ ] **TC-105-01**: 1回目 override → position_overrides に swapped、engine GameState の A 左右が反転 🔵
- [ ] **TC-105-02**: 2回目 override → position_overrides に restored、engine GameState の A が元に戻る 🔵 *EDGE-008 / rule-engine EDGE-002*

---

## REQ-106: 直前ラリーの修正と再計算 🔵

**信頼性**: 🔵 *PRD §F-03 + ヒアリング2026-06-05 + [[project_rally_correction]]*

### Given（前提条件）
- 直前ラリーの得点者が誤って記録されている

### When（実行条件）
- 直前ラリーの得点者を A→B に修正

### Then（期待結果）
- それ以降のサーバー/レシーバー・スコアを rule-engine で再計算し rallies を再保存

### テストケース
- [ ] **TC-106-01**: 直前ラリーを A→B に修正 → 以降のラリーの denormalize 状態が再計算・再保存される 🔵 *EDGE-005*
- [ ] **TC-106-02**: 修正対象は直前ラリーのみ（履歴からの任意過去ラリー編集 UI は提供しない） 🔵

---

## REQ-010/107/203: セット勝者検知と手動次セット 🔵

**信頼性**: 🔵 *ヒアリング2026-06-05 + rule-engine REQ-007/009*

### Given（前提条件）
- セットがあと1点で決着する状態

### When（実行条件）
- 決着点が入る

### Then（期待結果）
- `determineSetWinner` が勝者を検知し `sets.winner` 更新
- 自動遷移せず「次のセットへ」導線を提示、次セットは先攻＝前セット勝者を既定

### テストケース

#### 正常系
- [ ] **TC-010-01**: 目標到達 → winner 更新 + 「次のセットへ」提示（自動遷移しない） 🔵
- [ ] **TC-010-02**: 次セット開始時、先攻に前セット勝者が既定提示される 🔵 *rule-engine REQ-009*

#### 境界値
- [ ] **TC-010-B01**: デュース 29-29（cap30）→ 次得点でセット決着 🔵 *rule-engine EDGE-101*

#### 異常系
- [ ] **TC-010-E01**: セット決着後にさらに得点入力 → 拒否し次セット/試合終了を提示 🔵 *EDGE-006 / REQ-203*

---

## REQ-108: local 動画の再選択 🔵

**信頼性**: 🔵 *video-playback REQ-103（方式A）*

### テストケース
- [ ] **TC-108-01**: local 動画でページ再読込 → 同一ファイル再選択を促す。記録済みデータ（ms）は保持され再選択後にジャンプ可 🔵 *EDGE-007*

---

## 非機能要件テスト

### NFR-001/002: パフォーマンス 🔵
- [ ] **TC-NFR-001-01**: 「打った」押下→ショット記録 100ms 以内 🔵 *PRD 性能 NFR*
- [ ] **TC-NFR-002-01**: ラリー入力→次サーバー/レシーバー表示 100ms 以内 🔵 *PRD §F-03*

### NFR-101: セキュリティ（RLS） 🔵
- [ ] **TC-NFR-101-01**: 他 Group の試合に紐づく sets/rallies/shots を取得・追加・更新できない 🔵 *FK 経由 RLS*

### NFR-303: テスト方針 🔵
- [ ] **TC-NFR-303-01**: テストは Zod schema・composable エラー処理（成功/失敗/エッジ）・rule-engine 連携の入出力対応に限定し、見た目テストを書かない 🔵 *ADR-012 + [[feedback_test_coverage]]*

---

## テストケースサマリー

### カテゴリ別件数

| カテゴリ | 正常系 | 異常系 | 境界値 | 合計 |
|---------|--------|--------|--------|------|
| 機能要件 | 14 | 6 | 4 | 24 |
| 非機能要件 | 3 | 0 | 0 | 3 |
| **合計** | **17** | **6** | **4** | **27** |

### 信頼性レベル分布

- 🔵 青信号: 26件 (96%)
- 🟡 黄信号: 1件 (4%)
- 🔴 赤信号: 0件 (0%)

**品質評価**: 高品質

### 優先度別

- **Must Have**: TC-002 / TC-005 / TC-007 / TC-104 / TC-010
- **Should Have**: TC-102 / TC-105 / TC-106 / TC-108

---

## テスト実施計画

### Phase 1: セットアップ + ラリー記録（Must）
- REQ-002/003/005/006/007/103/104

### Phase 2: 修正・入れ替わり・セット進行（Should）
- REQ-102/105/106/010/107/203/108

### Phase 3: 非機能・Edge
- NFR-001/002/101/303 + EDGE 一式
