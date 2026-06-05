# match-management データフロー図

**作成日**: 2026-06-05
**関連アーキテクチャ**: [architecture.md](architecture.md)
**関連要件定義**: [requirements.md](../../spec/match-management/requirements.md)

**【信頼性レベル凡例】**:
- 🔵 確実なフロー / 🟡 妥当な推測 / 🔴 出典のない推測

---

## 画面到達フロー 🔵

**信頼性**: 🔵 *auth.global.ts middleware / REQ-202*

```mermaid
flowchart TD
    A["/groups/[id]/matches へアクセス"] --> B{auth.global.ts}
    B -->|未認証| C["/login?redirect=..."]
    B -->|認証済・未所属| D["/onboarding"]
    B -->|認証済・所属済| E["matches.vue 表示"]
    E --> F["useMatches() で一覧取得"]
    E --> G["usePlayers() で選手選択肢取得"]
```

> 本 page は非 public path。到達時点で「認証済み・Group 所属済み」が middleware により保証される。

## 機能1: 試合一覧取得 🔵

**信頼性**: 🔵 *user-stories 3.1 / TC-001 / NFR-203 / EDGE-007*

**関連要件**: REQ-001, REQ-201, NFR-001, NFR-203

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant P as matches.vue
    participant L as useMatches
    participant G as useCurrentGroup
    participant DB as matches (PostgREST)

    U->>P: 画面を開く
    P->>L: useMatches()
    L->>G: group_id を取得
    L->>DB: select(...,players埋め込み)<br/>.eq(group_id).is(deleted_at,null)<br/>.order(match_date desc).order(created_at desc)
    DB-->>L: MatchListItem[]（RLS 通過分・選手名解決済）
    alt 0 件
        L-->>P: []
        P-->>U: 空状態 + 「試合を追加」CTA
    else 1 件以上
        L-->>P: MatchListItem[]
        P-->>U: 試合名(or対戦カード)+試合日付 を新しい順に表示
    end
```

**詳細ステップ**:
1. `useMatches()` が `useCurrentGroup()` の `group_id` を読む 🔵
2. `deleted_at IS NULL` で未削除のみ、`match_date` 降順→`created_at` 降順で SELECT 🔵
3. 4 選手名を PostgREST 埋め込みで解決（削除済 player も名前維持、EDGE-007）🟡
4. RLS `is_member_of` により自 Group の試合のみ返る 🔵
5. 0 件なら空状態（REQ-201）、1 件以上なら一覧 🔵

## 機能2: 試合の追加 🔵

**信頼性**: 🔵 *user-stories 1.1 / TC-002 / EDGE-001〜005,011,012*

**関連要件**: REQ-002, REQ-006, REQ-007, REQ-008, REQ-101, REQ-102, REQ-103, REQ-106, REQ-107, REQ-108, REQ-109

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant M as UModal フォーム
    participant Z as match-form.ts (Zod)
    participant C as useCreateMatch
    participant DB as matches (PostgREST)
    participant T as useToast

    U->>M: 「試合を追加」→ 試合名/日付/4選手/動画ソース 入力
    U->>M: 保存
    M->>Z: name(任意1-50) / match_date(必須) / 動画ソース / 4選手相異 を検証
    alt 検証 NG
        Z-->>M: フィールドエラー
        M-->>U: UFormField inline (EDGE-001/003/011/012)
    else 検証 OK
        M->>C: createMatch(input)
        Note over C: local→file名ラベル / youtube→ID抽出URL
        C->>DB: insert(group_id, 4player, video_source_*, name, match_date)
        alt 成功（同カードでも成功 REQ-104）
            DB-->>C: { data }
            C-->>M: 成功 → モーダル閉じ + useMatches().refresh()
        else 失敗（RLS / 通信 / 複合FK / distinct CHECK）
            DB-->>C: { error }
            C->>T: toast 通知 (EDGE-010)
        end
    end
```

**詳細ステップ**:
1. クライアント Zod で先に検証（DB CHECK / 制約と一致）🔵
2. 4 選手の相異は Zod refine で送信前に検証（REQ-101 / EDGE-001）🔵
3. 動画ソース: local は `file.name` をラベルとして保存、youtube は動画 ID 抽出後の URL を保存 🔵
4. insert は group_id を `useCurrentGroup` から付与 🔵
5. 同カード（同 4 選手・同動画）でも成功（REQ-104 / EDGE-005）🔵
6. RLS・通信・複合FK・distinct CHECK 違反は toast（error-handling §6④）🔵
7. 成功後はモーダルを閉じ `useMatches().refresh()` で一覧更新 🔵

## 機能3: 試合の編集 🔵

**信頼性**: 🔵 *user-stories 2.1 / TC-003 / REQ-003*

機能2 と同型（モーダルに既存値をプリフィル → `useUpdateMatch` で全項目 update → refresh）。
4 選手相異・name 境界・match_date 必須の検証が編集時も再適用される 🔵。

## 機能4: 試合のソフト削除（確認ダイアログ付き） 🔵

**信頼性**: 🔵 *user-stories 2.2 / TC-004 / REQ-105*

**関連要件**: REQ-004, REQ-105, REQ-402

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant P as matches.vue
    participant Cf as UModal 削除確認
    participant D as useDeleteMatch
    participant DB as matches (PostgREST)

    U->>P: 試合の削除を選ぶ
    P->>Cf: 確認ダイアログ表示 (REQ-105)
    alt キャンセル
        Cf-->>P: 何もしない
    else 承認
        Cf->>D: deleteMatch(id)
        D->>DB: update(deleted_at = now()).eq(id)
        DB-->>D: { data }
        D-->>P: 成功 → useMatches().refresh()
        P-->>U: 一覧から消える（物理削除しない REQ-402）
    end
```

**詳細ステップ**:
1. 削除前に確認ダイアログを表示（REQ-105、player の無警告と差分）🔵
2. 承認時のみ `deleted_at` を now() に UPDATE（物理削除しない、REQ-402）🔵
3. `useMatches().refresh()` で一覧から除外（`deleted_at IS NULL` フィルタ、EDGE-006）🔵

## 選手 4 人未満時のフロー 🟡

**信頼性**: 🟡 *REQ-203（具体UIは本設計で確定）*

```mermaid
flowchart TD
    A["matches.vue 表示"] --> B["usePlayers() 件数を確認"]
    B -->|player >= 4| C["「試合を追加」有効"]
    B -->|player < 4| D["「試合を追加」disabled<br/>+ /groups/[id]/players への導線・説明"]
```

## エラーハンドリングフロー 🔵

**信頼性**: 🔵 *error-handling.md §2 / §6*

```mermaid
flowchart TD
    A[エラー発生] --> B{種別}
    B -->|入力検証NG（名前/日付/動画ソース/選手重複）| C["UFormField inline (§6①)"]
    B -->|RLS拒否 / 複合FK / distinct CHECK / 通信| D["useToast() (§6④)"]
    B -->|想定外例外| E["error.vue + Sentry (§6⑦)"]
```

## 状態管理フロー 🔵

**信頼性**: 🔵 *ADR-007 D4 / useAsyncData*

```mermaid
stateDiagram-v2
    [*] --> 取得中: useMatches() 初回
    取得中 --> 表示: MatchListItem[] 取得
    取得中 --> エラー: 取得失敗
    表示 --> 取得中: create/update/delete 後 refresh()
    表示 --> 空状態: 0 件
```

## 関連文書

- **アーキテクチャ**: [architecture.md](architecture.md)
- **型定義**: [interfaces.ts](interfaces.ts)
- **DBスキーマ(migration)**: [database-schema.sql](database-schema.sql)

## 信頼性レベルサマリー

- 🔵 青信号: 大半のフロー（選手4人未満フローの挙動は REQ-203 で確定）
- 🟡 黄信号: 1（選手名埋め込み解決 = 実装時に実地検証）
- 🔴 赤信号: 0

**品質評価**: 高品質
