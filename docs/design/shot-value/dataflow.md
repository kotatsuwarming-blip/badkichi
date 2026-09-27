# shot-value データフロー図

**作成日**: 2026-09-16

## 全体フロー

```mermaid
flowchart TD
    A[stats ページ<br>試合単位 / Group 横断] -->|scope + set| B[RPC stats_shot_value]
    B -->|役割カウント行<br>打者×球種×hand×ゾーン| C[useShotValue 集計層<br>utils/shot-value/score.ts]
    F[グローバルフィルタ<br>期間・試合・選手/ペア] --> C
    G[打者・セット・hand フィルタ] --> C
    S[ゾーン選択 Set<br>StatsShotValueCourt] --> C
    W[SV_WEIGHTS 定数<br>w=1.0 b1=0.7 b2=0.5] --> C
    C --> D1[StatsShotValueCourt<br>セル別 SV/n]
    C --> D2[StatsShotValueSummary<br>稼いだ−失った=収支 ±CI]
    C --> D3[StatsShotValueBreakdown<br>球種別5役割積み上げ]
    A --> E[StatsWeaknessMaps<br>ミスした打点 / 決められた落下点<br>既存・移設のみ]
```

## 採点の割当（RPC 内・ラリー単位）

```mermaid
flowchart TD
    R[対象ラリー<br>is_let=false / confirmed / winner非null<br>end_reason ∈ 5値] --> K{決着種別}
    K -->|service_fault| F1[rn=1 に miss<br>他は none]
    K -->|body または floor×最終=勝者| A1[エース決着]
    K -->|net / not_over / floor×最終=敗者| M1[ミス決着]
    A1 --> A2["last: kime / last−1: yurushi1 / last−2: fuseki1<br>last−3: yurushi2 / last−4: fuseki2"]
    M1 --> M2["last: miss / last−1: yuhatsu / last−2: yurushi1<br>last−3: fuseki1 / last−4: yurushi2 / last−5: fuseki2"]
    A2 --> Z[チーム帰属 = rn 偶奇 × serving_team<br>存在しない打順はスキップ]
    M2 --> Z
```

## 画面インタラクション

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant P as StatsShotValuePanel
    participant C as Court(3×3)
    participant S as score.ts

    Note over P: 初回: RPC 1回で全 grain 取得済み
    U->>C: セルをタップ（複数可 / 行ラベル一括）
    C->>P: update:selection (Set<zoneKey>)
    P->>S: 選択ゾーンの行を合算(RPC 再実行なし)
    S-->>P: 合計(稼いだ/失った/SV100/CI) + 球種別内訳
    P-->>U: 合計タイル・内訳を即時更新
    U->>C: 全選択解除
    P-->>U: コート全体(座標なし・向き不明ショット含む)を表示
```

## ゾーン割当と除外（REQ-101/102 の境界）

| ショットの状態 | 採点 | 分母 n | ゾーン |
|---|---|---|---|
| 通常（座標あり・向きあり） | する | 入る | 割当（placement と同一ミラー・クランプ） |
| 打点座標 null | する | 入る（全体時） | null → ゾーン選択中は対象外 |
| camera_near_team null | する | 入る（全体時） | null → 同上 |
| hit_player_id null | 位置のみ消費 | 入らない | —（RPC 出力から除外） |
| end_reason null / unknown | しない | **入らない** | — |
