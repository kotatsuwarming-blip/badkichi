# video-playback データフロー図

**作成日**: 2026-06-01
**関連アーキテクチャ**: [architecture.md](architecture.md)
**関連要件定義**: [requirements.md](../../spec/video-playback/requirements.md)

**【信頼性レベル凡例】**:
- 🔵 **青信号**: EARS要件定義書・設計文書・ADR・ユーザヒアリングを参考にした確実なフロー
- 🟡 **黄信号**: 妥当な推測によるフロー
- 🔴 **赤信号**: 上記資料にない推測によるフロー

---

## システム全体のデータフロー 🔵

**信頼性**: 🔵 *architecture.md / requirements.md*

```mermaid
flowchart TD
    Parent[上位ユニット<br/>match-recording / stats-dashboard]
    Comp[VideoPlayer.client.vue]
    CB[useVideoPlayer composable]
    Adapter[YouTubeAdapter / Html5Adapter]
    API[YouTube IFrame API / HTML5 Video API]

    Parent -->|source 渡し / controls 呼び出し| CB
    CB -->|attach el| Comp
    Comp -->|mount el| Adapter
    Adapter --> API
    API -->|状態/duration/error イベント| Adapter
    Adapter -->|on イベント| CB
    CB -->|reactive state| Parent
    CB -->|getCurrentTimeMs 即時| Parent
```

## 主要フロー

### フロー1: YouTube 動画のロードと再生 🔵

**信頼性**: 🔵 *user-stories 1.1 / REQ-101 / EDGE-001,002*
**関連要件**: REQ-001, REQ-101, EDGE-001, EDGE-002

```mermaid
sequenceDiagram
    participant P as 上位ページ
    participant C as VideoPlayer.client.vue
    participant H as useVideoPlayer
    participant Y as YouTubeAdapter
    participant L as youtube-api-loader
    participant API as YouTube IFrame API

    P->>H: useVideoPlayer({type:'youtube', url})
    Note over H: extractYouTubeId(url)
    alt ID 抽出不可
        H-->>P: state.error = youtube-invalid-url (EDGE-002)
    else ID 取得
        C->>H: attach(el)  (onMounted)
        H->>Y: mount(el)
        Y->>L: ensureApiLoaded()  (初回のみ script 注入)
        L-->>Y: API ready
        Y->>API: new YT.Player(el, {videoId})
        API-->>Y: onReady / onStateChange / onError
        alt onError (2/5/100/101/150)
            Y->>H: emit error
            H-->>P: state.error = youtube-load-failed (EDGE-001)
        else onReady
            Y->>H: emit statuschange/durationchange
            H-->>P: state.status, state.durationMs 更新
        end
    end
    P->>H: controls.play()
    H->>Y: play()
    Y->>API: playVideo()
```

### フロー2: ローカル動画のロードと再選択 🔵

**信頼性**: 🔵 *user-stories 1.2 / REQ-102,103 / EDGE-003*
**関連要件**: REQ-102, REQ-103, EDGE-003, NFR-101

```mermaid
sequenceDiagram
    participant P as 上位ページ
    participant H as useVideoPlayer
    participant V as Html5Adapter
    participant El as HTMLVideoElement

    alt local source に file あり
        H->>V: mount(el)
        V->>V: objectUrl = URL.createObjectURL(file)
        V->>El: video.src = objectUrl
        El-->>V: loadedmetadata → durationMs
        El-->>V: error → emit (local-decode-failed, EDGE-003)
        V-->>H: status/duration 反映
    else file なし（再読み込みで失効）
        H-->>P: state.needsReselect = true (REQ-103)
        Note over P: 「同じ動画を選び直してください」UI<br/>長時間記録は YouTube 推奨誘導(REQ-301)
        P->>H: 再選択された file を再供給
        H->>V: mount(el) で復帰
    end
    Note over V,El: destroy() で URL.revokeObjectURL(objectUrl)
```

### フロー3: 「打った」瞬間の現在時刻取得（記録経路） 🔵

**信頼性**: 🔵 *user-stories 2.1 / REQ-004,202 / NFR-001*
**関連要件**: REQ-004, REQ-202, REQ-201, NFR-001

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant MR as match-recording (上位)
    participant H as useVideoPlayer
    participant A as Adapter

    U->>MR: 「打った」ボタン押下
    MR->>H: controls.getCurrentTimeMs()
    H->>A: getCurrentTimeMs()  (同期・ポーリングなし)
    Note over A: YouTube: round(getCurrentTime()*1000)<br/>HTML5: round(video.currentTime*1000)
    alt 未ロード
        A-->>MR: null  (UI は記録操作を無効化, REQ-201)
    else 再生中
        A-->>MR: ms 整数  (100ms 以内, NFR-001)
    end
```

### フロー4: 指定位置へのジャンプ（シーク） 🔵

**信頼性**: 🔵 *user-stories 2.2 / REQ-005,104 / EDGE-101*
**関連要件**: REQ-005, REQ-104, EDGE-101

```mermaid
sequenceDiagram
    participant SD as stats-dashboard (上位)
    participant H as useVideoPlayer
    participant A as Adapter

    SD->>H: controls.seekToMs(targetMs)
    H->>A: seekToMs(targetMs)
    Note over A: clampMs(targetMs, durationMs)<br/>負値→0 / 超過→duration (REQ-104)
    A->>A: YouTube: seekTo(sec, true) / HTML5: video.currentTime = sec
```

### フロー5: 「打った痕跡」のオーバーレイ表示（責務境界） 🔵

**信頼性**: 🔵 *requirements.md REQ-008/009/405/406 / ユーザヒアリング 2026-06-01*
**関連要件**: REQ-008, REQ-009, REQ-405, REQ-406

video-playback はスロットと slot props（durationMs/currentTimeMs）だけを提供し、match-recording がショット意味づけと描画を担う。依存は一方向。

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant MR as match-recording
    participant H as useVideoPlayer
    participant VP as VideoPlayer.client.vue

    Note over MR: shots: {ms}[] を保持（video-playback は知らない）
    U->>MR: 「打った」押下
    MR->>H: controls.getCurrentTimeMs() → ms
    MR->>MR: shots に追加 + DB 保存（rule-engine 連携）
    MR-->>MR: ① overlay スロットに「記録しました」フラッシュ (REQ-406)
    MR-->>MR: ② timeline スロットにマーカー追加 (left = ms / durationMs, REQ-009)
    VP-->>MR: slot props { durationMs, currentTimeMs, status } を供給
    Note over VP,MR: VideoPlayer は中身を知らずスロットを描画するだけ (REQ-405)
```

## 状態遷移 🔵

**信頼性**: 🔵 *REQ-007 / EDGE-004*

```mermaid
stateDiagram-v2
    [*] --> unstarted
    unstarted --> buffering: ロード開始
    buffering --> playing: 再生開始
    playing --> paused: pause()
    paused --> playing: play()
    playing --> buffering: ネットワーク遅延(EDGE-004)
    buffering --> playing: バッファ充足
    playing --> ended: 終端到達
    ended --> playing: seekToMs() で巻き戻し後 play()
    note right of buffering
        buffering 中も他操作を阻害しない(EDGE-004)
        現在時刻取得は null を返しうる(REQ-201)
    end note
```

## エラーハンドリングフロー 🔵

**信頼性**: 🔵 *cross-cutting/error-handling カテゴリ D・決定木*

```mermaid
flowchart TD
    E[エラー発生] --> K{発生源}
    K -->|URL 検証失敗| C1[youtube-invalid-url]
    K -->|IFrame onError| C2[youtube-load-failed]
    K -->|video error イベント| C3[local-decode-failed]
    K -->|local file 失効| C4[local-reselect-needed]
    C1 --> M[state.error に code+messageKey 設定]
    C2 --> M
    C3 --> M
    C4 --> R[state.needsReselect=true]
    M --> UI[プレーヤー領域に inline/banner 提示<br/>文言は locale JSON で解決]
    C2 --> ALT[別動画指定の導線を併設]
    R --> RS[再選択 UI / YouTube 推奨誘導]
```

## 関連文書

- **アーキテクチャ**: [architecture.md](architecture.md)
- **型定義**: [interfaces.ts](interfaces.ts)
- **要件定義**: [requirements.md](../../spec/video-playback/requirements.md)

## 信頼性レベルサマリー

- 🔵 青信号: 全フロー（要件 🔵 100% から導出）
- 🟡 黄信号: 0
- 🔴 赤信号: 0

**品質評価**: 高品質
