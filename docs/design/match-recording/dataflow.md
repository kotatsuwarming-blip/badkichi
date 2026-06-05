# match-recording データフロー図

**作成日**: 2026-06-05
**関連アーキテクチャ**: [architecture.md](architecture.md)
**関連要件定義**: [requirements.md](../../spec/match-recording/requirements.md)

**【信頼性レベル凡例】**:
- 🔵 **青信号**: EARS要件定義書・確定スキーマ・上流実装・ユーザヒアリングを参考にした確実なフロー
- 🟡 **黄信号**: 上記から妥当な推測によるフロー
- 🔴 **赤信号**: 出典のない推測によるフロー

---

## システム全体のデータフロー 🔵

**信頼性**: 🔵 *architecture.md + PRD §5.4 データフロー*

```mermaid
flowchart TD
    U[ユーザー] -->|打った/得点/レット/スキップ/override| Page[record.vue]
    Page -->|getCurrentTimeMs| VP[useVideoPlayer]
    Page -->|アクション| RS[useRecordingSession<br/>GameState 所有]
    RS -->|純関数| RE[rule-engine]
    RE -->|新 GameState| RS
    RS -->|楽観: メモリ即更新| Page
    RS -->|同期/楽観 書込| W[Write composable]
    W --> DB[(Supabase 録画系5テーブル)]
    RS -->|履歴 read| R[useSetRallies]
    R --> DB
    Page -->|スコア/サーバー/履歴/痕跡| U
```

## 主要機能のデータフロー

### 機能1: セットアップ（セット設定 + 初期立ち位置） 🔵

**信頼性**: 🔵 *REQ-002/003 + TC-002 + rule-engine createInitialState*

**関連要件**: REQ-002, REQ-003, REQ-201

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant P as record.vue
    participant RS as useRecordingSession
    participant RE as rule-engine
    participant DB as Supabase

    U->>P: 目標点/デュース/先攻/カメラ手前 + 4選手の左右
    P->>RS: configureSet(config) / setPositions(4件)
    RS->>DB: createSet(同期 await) → sets 1行
    DB-->>RS: set_id
    RS->>DB: createSetPositions(同期 await) → spp 4行
    Note over RS,DB: 重複(team,position)は UNIQUE 違反→ inline error(EDGE-002)
    RS->>RE: createInitialState(config, positions)
    RE-->>RS: state_0（第1ラリーの server/receiver）
    RS-->>P: GameState（スコア0-0/サーバー/レシーバー）
    P-->>U: スコアパネル + コート描画
```

**詳細ステップ**:
1. セット未作成状態（REQ-201）でセットアップフォームを提示。
2. `sets` と `set_player_positions` は **同期 await**（後続 FK 親、整合性優先）。
3. `createInitialState` で第1ラリーの GameState を得て表示。

---

### 機能2: ショット記録（「打った」） 🔵

**信頼性**: 🔵 *REQ-005/101 + TC-005 + NFR-001 + ラリー遅延生成*

**関連要件**: REQ-005, REQ-101, NFR-001

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant P as record.vue
    participant VP as useVideoPlayer
    participant RS as useRecordingSession
    participant DB as Supabase

    U->>P: 「打った」
    P->>VP: controls.getCurrentTimeMs()
    VP-->>P: ms（未ロードなら null）
    alt ms == null（未ロード/バッファ）
        P-->>U: 記録不可（ボタン無効、EDGE-001）
    else ms 取得
        P->>RS: recordShot(ms)
        opt currentRally 行が未生成
            RS->>DB: createRally(同期 await)<br/>serving_team/server/receiver=GameState, video_start_timestamp_ms=ms
            DB-->>RS: rally_id
        end
        RS->>RS: shots[] に楽観追加（UI 痕跡 <16ms）
        RS-->>P: 痕跡表示（オーバーレイスロット）
        RS--)DB: createShot(非同期 write-behind)
        Note over RS,DB: 失敗時のみ toast + 再試行(error-handling §2.A)
    end
```

**詳細ステップ**:
1. 現在時刻が `null` なら記録しない（video-playback REQ-201 契約、EDGE-001）。
2. ラリー行は**初ショット時に1回だけ同期生成**（shots の FK 親、id 確定が必要）。
3. 以降のショットは楽観：メモリ即反映 → 非同期 insert。

---

### 機能3: 得点入力とサーバー/レシーバー自動特定 🔵

**信頼性**: 🔵 *REQ-006/007/410 + TC-007 + rule-engine applyRally/determineSetWinner*

**関連要件**: REQ-006, REQ-007, REQ-008, REQ-010, REQ-410

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant P as record.vue
    participant RS as useRecordingSession
    participant RE as rule-engine
    participant DB as Supabase

    U->>P: 「チームA得点」
    P->>RS: recordPoint('A')
    opt currentRally 行が未生成（ショット0件）
        RS->>DB: createRally(同期 await)
        DB-->>RS: rally_id
    end
    RS->>RS: rally を楽観 update(point_winner=A, is_point_confirmed=true)
    RS--)DB: updateRally(非同期 write-behind)
    RS->>RE: applyRally(state, {pointWinner:'A', isLet:false})
    RE-->>RS: state_next（次ラリーの server/receiver, score 更新）
    RS->>RE: determineSetWinner(state_next, config)
    alt セット勝者あり
        RE-->>RS: SetResult(winner)
        RS->>DB: updateSet(winner)(同期 await)
        RS-->>P: 「次のセットへ」CTA（自動遷移しない、REQ-107）
    else 継続
        RE-->>RS: null
        RS->>RS: currentRally = 次ラリー（rallyId=null）
        RS-->>P: 新スコア/次サーバー/レシーバー（100ms 以内）
    end
```

**詳細ステップ**:
1. 得点は楽観 update（ホットパス、NFR-001）。
2. `applyRally` で次 GameState を導出 → 表示更新。
3. `determineSetWinner` が勝者を返したら `sets.winner` を**同期 update**し、手動セット遷移 CTA を出す（REQ-010/107、ヒアリング2026-06-05）。

---

### 機能4: スキップと後確定 🔵

**信頼性**: 🔵 *REQ-103/104 + TC-104 + EDGE-003 + rule-engine REQ-403*

**関連要件**: REQ-103, REQ-104

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant RS as useRecordingSession
    participant RE as rule-engine
    participant DB as Supabase

    U->>RS: 「スキップ」
    RS->>RS: ensureRallyRow()
    RS--)DB: updateRally(point_winner=null, is_point_confirmed=false)（楽観）
    Note over RS,RE: engine は前進させない<br/>（pointWinner 必須 REQ-403）→ currentRally=pending
    RS-->>U: 当該ラリーを「未確定」表示（EDGE-003）
    U->>RS: 次のサーブを見て得点者 A を確定
    RS->>RS: confirmSkipped('A')
    RS--)DB: updateRally(point_winner=A, is_point_confirmed=true)（楽観）
    RS->>RE: applyRally(state, {pointWinner:'A'})
    RE-->>RS: state_next → currentRally 前進
```

**備考**: 未確定ラリーがある間は engine が前進できないため、次ラリーの server/receiver は保留。UI で未確定を明示する（EDGE-003）。

---

### 機能5: 左右入れ替わり（override） 🔵

**信頼性**: 🔵 *REQ-105 + TC-105 + EDGE-008 + rule-engine applyOverride（ステートレストグル）*

**関連要件**: REQ-105

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant RS as useRecordingSession
    participant MG as map-game-state（純関数）
    participant RE as rule-engine
    participant DB as Supabase

    U->>RS: override（チームA）
    RS->>MG: 当該チームの現在トグル回数から override_type 決定
    MG-->>RS: 偶数回目=swapped / 奇数回目=restored
    RS--)DB: createOverride(rally_id, team='A', override_type)（楽観）
    RS->>RE: applyOverride(state, 'A')
    RE-->>RS: state'（A の左右トグル）
    opt currentRally 行が既存
        RS--)DB: updateRally(server/receiver/server_position を state' で update)（楽観）
    end
    RS-->>U: コート描画 + サーバー/レシーバー更新
```

**詳細ステップ**:
1. DB は意味ラベル（swapped/restored）を保存、engine はステートレストグルを適用（REQ-105 の不整合解消）。
2. 2回連続で元に戻る（DB は2行、engine 状態は元、EDGE-008）。
3. override が現在ラリー行の生成後なら、その server 系列を update（rule-engine REQ-104: 当該ラリーに反映）。

---

### 機能6: 直前ラリーの修正 🔵

**信頼性**: 🔵 *REQ-106 + TC-106 + [[project_rally_correction]] + EDGE-005*

**関連要件**: REQ-106

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant RS as useRecordingSession
    participant RE as rule-engine

    U->>RS: 直前ラリーの得点者を A→B に修正
    RS->>RS: 直前 rally を楽観 update(point_winner=B)
    RS->>RE: applyRally(state_before_prev, {pointWinner:'B'})
    RE-->>RS: 現在 GameState を再導出（直前のみ、それ以降=現在ラリー）
    RS-->>U: 再計算後のスコア/サーバー/レシーバー
```

**備考**: 修正対象は直前ラリーのみ（[[project_rally_correction]]）。現在ラリーはまだ未得点なので、再計算は「直前 state からの applyRally 1回」で現在 GameState が更新される最小コスト。

---

## 状態管理フロー（録画セッション） 🔵

**信頼性**: 🔵 *architecture.md ラリー行ライフサイクル*

```mermaid
stateDiagram-v2
    [*] --> セット未設定
    セット未設定 --> ラリー進行中: configureSet + setPositions → createInitialState
    ラリー進行中 --> ラリー進行中: 打った（shots 楽観追加）
    ラリー進行中 --> ラリー進行中: override（applyOverride）
    ラリー進行中 --> 次ラリー: 得点（applyRally, セット継続）
    次ラリー --> ラリー進行中: currentRally 更新
    ラリー進行中 --> 未確定保留: スキップ
    未確定保留 --> 次ラリー: confirmSkipped（applyRally）
    ラリー進行中 --> セット決着: 得点（determineSetWinner≠null）
    セット決着 --> セット未設定: 「次のセットへ」（先攻=前勝者）
    セット決着 --> 試合終了: 先取セット数到達（REQ-011）
    試合終了 --> [*]
```

## エラーハンドリングフロー 🔵

**信頼性**: 🔵 *cross-cutting/error-handling.md §2 + EDGE-009*

```mermaid
flowchart TD
    A[エラー発生] --> B{種別}
    B -->|入力検証<br/>立ち位置重複/必須未入力| C[UFormField inline error]
    B -->|楽観書込の失敗<br/>shots/rally/override| D[useToast + 未同期マーク + 再試行]
    B -->|同期書込の失敗<br/>set/positions/winner| E[useToast + 処理中断<br/>（FK 親未確定のため続行不可）]
    B -->|RLS 拒否 / PostgREST / ネットワーク| D
    C --> F[ユーザー修正]
    D --> G[再試行 or 続行]
    E --> H[再操作要求]
```

**信頼性**: 🔵 *EDGE-009（inline / toast の使い分け）+ ハイブリッド永続化の失敗処理*

## データ整合性の保証 🔵

**信頼性**: 🔵 *ハイブリッド永続化 + FK 制約*

- **FK 順序保証**: set → set_player_positions / rally → shots / rally → override の親は**同期生成**で id 確定後に子を書く（楽観の子が先行しない）。
- **楽観の整合性窓**: 録画は単独ユーザー操作で並行書き込みが無いため、メモリ→DB の追従順序は単調。失敗時は toast + 再試行で収束。
- **denormalize の一貫性**: rallies の状態列は GameState 出力をそのまま写すため、再計算（修正/override）時は同じ写像（`map-game-state.ts`）で上書きし二重管理しない。

## 関連文書

- **アーキテクチャ**: [architecture.md](architecture.md)
- **型定義**: [interfaces.ts](interfaces.ts)
- **要件定義**: [requirements.md](../../spec/match-recording/requirements.md)

## 信頼性レベルサマリー

- 🔵 青信号: 14件 (100%)
- 🟡 黄信号: 0件 (0%)
- 🔴 赤信号: 0件 (0%)

**品質評価**: 高品質
