# player-management データフロー図

**作成日**: 2026-06-02
**関連アーキテクチャ**: [architecture.md](architecture.md)
**関連要件定義**: [requirements.md](../../spec/player-management/requirements.md)

**【信頼性レベル凡例】**:
- 🔵 確実なフロー / 🟡 妥当な推測 / 🔴 出典のない推測

---

## 画面到達フロー 🔵

**信頼性**: 🔵 *auth-onboarding auth.global.ts middleware*

```mermaid
flowchart TD
    A["/groups/[id]/players へアクセス"] --> B{auth.global.ts}
    B -->|未認証| C["/login?redirect=..."]
    B -->|認証済・未所属| D["/onboarding"]
    B -->|認証済・所属済| E["players.vue 表示"]
    E --> F["usePlayers() で一覧取得"]
```

> 本 page は非 public path。到達時点で「認証済み・Group 所属済み」が middleware により保証される。

## 機能1: 選手一覧取得 🔵

**信頼性**: 🔵 *user-stories 1.1 / TC-001 / NFR-001*

**関連要件**: REQ-001, REQ-201, NFR-001

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant P as players.vue
    participant L as usePlayers
    participant G as useCurrentGroup
    participant DB as players (PostgREST)

    U->>P: 画面を開く
    P->>L: usePlayers()
    L->>G: group_id を取得
    L->>DB: select id,name,handedness<br/>.eq(group_id).is(deleted_at,null).order(name)
    DB-->>L: Player[]（RLS 通過分のみ）
    alt 0 件
        L-->>P: []
        P-->>U: 空状態 + 「選手を追加」CTA
    else 1 件以上
        L-->>P: Player[]
        P-->>U: 一覧表示
    end
```

**詳細ステップ**:
1. `usePlayers()` が `useCurrentGroup()` の `group_id` を読む 🔵
2. `deleted_at IS NULL` で未削除のみ、name 昇順で SELECT（部分インデックス利用）🔵
3. RLS `is_member_of` により自 Group の選手のみ返る 🔵
4. 0 件なら空状態（REQ-201）、1 件以上なら一覧 🔵

## 機能2: 選手の追加 🔵

**信頼性**: 🔵 *user-stories 1.2 / TC-002 / EDGE-001/002/004*

**関連要件**: REQ-002, REQ-101, REQ-102

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant M as UModal フォーム
    participant Z as player-name.ts (Zod)
    participant C as useCreatePlayer
    participant DB as players (PostgREST)
    participant T as useToastErrors

    U->>M: 「選手を追加」→ name 入力 / handedness 選択
    U->>M: 保存
    M->>Z: name を trim().min(1).max(50) 検証
    alt 検証 NG
        Z-->>M: フィールドエラー
        M-->>U: UFormField inline error (EDGE-001/002)
    else 検証 OK
        M->>C: createPlayer({ name, handedness })
        C->>DB: insert(group_id, name, handedness)
        alt 成功（同名でも成功）
            DB-->>C: { data }
            C-->>M: 成功 → モーダル閉じ + 一覧 refresh()
        else 失敗（RLS / 通信）
            DB-->>C: { error }
            C->>T: toast 通知 (EDGE-008)
        end
    end
```

**詳細ステップ**:
1. name はクライアント Zod で先に検証（DB CHECK と一致）🔵
2. 検証エラーは UFormField inline（error-handling §6①）🔵
3. insert は group_id を `useCurrentGroup` から付与 🔵
4. 同名選手が既存でも成功（REQ-102 / EDGE-004）🔵
5. RLS・通信エラーは toast（error-handling §6④）🔵
6. 成功後はモーダルを閉じ `usePlayers().refresh()` で一覧更新 🔵

## 機能3: 選手の編集 🔵

**信頼性**: 🔵 *user-stories 1.3 / TC-003*

**関連要件**: REQ-003, REQ-101

機能2 と同型（モーダルに既存値をプリフィル → `useUpdatePlayer` で update → refresh）。
name の境界検証（1〜50字）が編集時も再適用される（TC-003-B01）🔵。

## 機能4: 選手のソフト削除 🔵

**信頼性**: 🔵 *user-stories 1.4 / TC-004 / REQ-103/104*

**関連要件**: REQ-004, REQ-103, REQ-104

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant P as players.vue
    participant D as useDeletePlayer
    participant DB as players (PostgREST)

    U->>P: 選手の削除を実行
    Note over P: 確認ダイアログなし (REQ-103)
    P->>D: deletePlayer(id)
    D->>DB: update(deleted_at = now()).eq(id)
    DB-->>D: { data }（試合参照中でも成功）
    D-->>P: 成功 → 一覧 refresh()
    P-->>U: 一覧から消える（過去 matches の参照は player.id 経由で維持）
```

**詳細ステップ**:
1. 確認ダイアログを出さず即実行（REQ-103、ヒアリング2026-06-01）🔵
2. `deleted_at` を now() に UPDATE（物理削除はしない、REQ-402）🔵
3. 試合参照中の選手でも成功し、履歴は維持（REQ-104 / EDGE-006）🔵
4. `usePlayers().refresh()` で一覧から除外（`deleted_at IS NULL` フィルタ、EDGE-005）🔵

## エラーハンドリングフロー 🔵

**信頼性**: 🔵 *error-handling.md §2 / §6*

```mermaid
flowchart TD
    A[エラー発生] --> B{種別}
    B -->|name 検証 NG（必須/文字数）| C["UFormField inline (§6①)"]
    B -->|RLS 拒否 / PostgREST / 通信| D["useToast() (§6④)"]
    B -->|想定外例外| E["error.vue + Sentry (§6⑦)"]
```

## 状態管理フロー 🔵

**信頼性**: 🔵 *ADR-007 D4 / useAsyncData*

```mermaid
stateDiagram-v2
    [*] --> 取得中: usePlayers() 初回
    取得中 --> 表示: Player[] 取得
    取得中 --> エラー: 取得失敗
    表示 --> 取得中: create/update/delete 後 refresh()
    表示 --> 空状態: 0 件
```

## 関連文書

- **アーキテクチャ**: [architecture.md](architecture.md)
- **型定義**: [interfaces.ts](interfaces.ts)

## 信頼性レベルサマリー

- 🔵 青信号: 全フロー
- 🟡 黄信号: 0
- 🔴 赤信号: 0

**品質評価**: 高品質
