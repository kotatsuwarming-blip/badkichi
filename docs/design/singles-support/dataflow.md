# singles-support データフロー図

**作成日**: 2026-08-28
**関連**: [architecture.md](architecture.md) / [requirements.md](../../spec/singles-support/requirements.md)

**【信頼性レベル凡例】** 🔵 確実 / 🟡 妥当な推測

## システム全体のデータフロー 🔵

形式の分岐点は「フォーム入力」「セット開始」「表示」の 3 箇所だけ。中央の記録・注釈・統計は形式を意識しない。

```mermaid
flowchart LR
    F[試合フォーム<br/>match_type 選択] -->|player2 = null| M[(matches)]
    M -->|match_type / roster| R[record.vue]
    R --> S[SetSetupForm<br/>singles: ファースト省略]
    S -->|各チーム right 1 行| P[(set_player_positions)]
    P --> C[createInitialState<br/>fillSingleSlot]
    C --> E[applyRally 等<br/>無変更]
    E --> D[CourtDiagram<br/>serverPosition 側のみ描画]
    M -->|roster 2 人| A[useAnnotationSession] --> T[useTypePass<br/>候補 1 人なら自動確定]
    M -->|player2 null| ST[stats RPC] --> V[統計ビュー<br/>ペア除外 / ペア別非表示]
```

## 機能1: 試合の作成（シングルス） 🔵

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant FM as MatchFormModal
    participant SC as matchFormSchema
    participant CM as useCreateMatch
    participant DB as matches (PostgREST)

    U->>FM: 対戦形式 = シングルス
    FM->>FM: player2 の select を v-if で非表示
    U->>FM: 選手 A / 選手 B を選択 → 保存
    FM->>SC: safeParse({ matchType:'singles', teamAPlayer1Id, teamAPlayer2Id?, ... })
    SC->>SC: doubles なら player2 必須 / 相異判定 (singles=2名)
    SC-->>FM: transform: teamAPlayer2Id=null, teamBPlayer2Id=null
    FM->>CM: createMatch(input)
    CM->>DB: INSERT { match_type:'singles', team_a_player2_id:null, team_b_player2_id:null, ... }
    DB->>DB: matches_match_type_players_check / matches_players_distinct_check
    DB-->>CM: row
    CM-->>FM: ok → emit('saved')
```

## 機能2: セット開始（立ち位置）とルールエンジン初期化 🔵

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant SF as SetSetupForm
    participant BI as buildSetInput
    participant RS as useRecordingSession
    participant CI as createInitialState
    participant DB as sets / set_player_positions

    U->>SF: セット設定を入力 (ファースト欄なし)
    SF->>SF: isSingles = A 1人 && B 1人
    SF->>BI: buildSetInput(roster, { aFirstPlayerId: A1, bFirstPlayerId: B1, ... })
    BI-->>SF: positions = [{A1,A,right},{B1,B,right}]
    SF->>RS: configureAndStartSet(setup, positions)
    RS->>CI: createInitialState(config, positions)
    CI->>CI: teamA = {left:'', right:A1} → fillSingleSlot → {left:A1, right:A1}
    CI-->>RS: GameState { server:A1, receiver:B1, serverPosition:'right' }
    Note over RS,DB: 最初の記録操作で遅延作成 (既存挙動)
    RS->>DB: INSERT sets, INSERT set_player_positions ×2
```

## 機能3: ラリー進行（サーブ位置の偶奇） 🔵

```mermaid
flowchart TD
    S0["0-0 A サーブ<br/>server=A1 right / receiver=B1"] -->|A 得点| S1["1-0 A サーブ<br/>positions.teamA 入替 (A1↔A1 = 不変)<br/>serverPosition = 1%2 → left"]
    S1 -->|B 得点| S2["1-1 B サーブ<br/>serverPosition = 1%2 → left<br/>server=B1 / receiver=A1"]
    S2 -->|B 得点| S3["1-2 B サーブ<br/>serverPosition = 2%2 → right"]
```

`applyRally` は無変更。`rallies` の denorm 列（`server_position` / `server_player_id` / `receiver_player_id`）もダブルスと同じ写像で保存される。

## 機能4: 再開（リロード） 🔵

```mermaid
sequenceDiagram
    participant R as record.vue (onMounted)
    participant SP as useSetPositions
    participant SR as useSetRallies
    participant RS as useRecordingSession

    R->>SP: set_player_positions (set_id)
    SP-->>R: 2 行 (A right / B right)
    R->>SR: rallies
    R->>R: hasBothTeams = some(A) && some(B) → true
    R->>RS: resumeSet(set, positions, rallies)
    RS->>RS: createInitialState (補完) → 確定ラリーを applyRally で replay
```

## 機能5: 注釈（種別パス）の打者自動確定 🔵

```mermaid
flowchart TD
    K[種別キー入力 3打目以降] --> C{hitterCandidates.length}
    C -->|2 doubles| W[awaitingHitter = true<br/>1/2 キーで選択]
    C -->|1 singles| P[patch { shotType, hitPlayerId: 唯一の選手 }] --> A[advance]
    W --> SH[selectHitter] --> A
```

`hitterTeam` は従来どおり打順の偶奇（奇数打 = サーブ側）で確定。ロスターが 2 人なので候補が 1 人になる。

## 機能6: 統計（player2 NULL の扱い） 🔵

```mermaid
flowchart LR
    M[(matches<br/>player2 = null)] --> PR[stats_pair_rates<br/>match_pairs: player2 IS NOT NULL → 除外]
    M --> RE[stats_rally_endings / tempo<br/>4 列を出力 (player2 = null)]
    RE --> CL[endings.ts / flow.ts<br/>filter(id !== null) → teamA = [A1]]
    M --> SH[shot_stats 系<br/>hit_player_id IN (a1, NULL) → a1 のみ一致]
    PR --> UI1[Group 統計 ペア別: ダブルスのみ]
    CL --> UI2[選手別: 通常どおり]
```

## 状態管理フロー（形式の伝播） 🔵

```mermaid
flowchart TD
    DB[(matches.match_type)] --> UM[useMatches → MatchListItem.matchType]
    DB --> UF[useMatchForRecording → MatchForRecording.matchType + roster]
    DB --> UA[useAnnotationSession → AnnotationMatchInfo.matchType + roster]
    UM --> L[一覧: 形式バッジ / 編集プリフィル]
    UF --> RV[record.vue: isSingles]
    RV --> CD[CourtDiagram :singles :server-position]
    RV --> PC[PositionControls :show-override]
    UF --> SS[SetSetupForm: roster 人数で isSingles]
    UA --> TP[useTypePass: roster 人数で候補 1 人]
    UF --> STp[試合統計: StatsGlobalFilterBar :show-pair-mode]
```

## 信頼性レベルサマリー

🔵 青信号: 全フロー（プロトタイプ実装で検証済み）
