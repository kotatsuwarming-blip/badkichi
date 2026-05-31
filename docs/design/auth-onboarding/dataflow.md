# auth-onboarding データフロー

**作成日**: 2026-05-30
**関連**: [architecture.md](architecture.md) / [interfaces.ts](interfaces.ts) / [error-handling.md](../cross-cutting/error-handling.md)

**信頼性**: 🔵 *ADR-008 (middleware) + ADR-007 (§補遺含む) + error-handling.md §6 + 既存 API マッピング (architecture.md)*

> 本単位は新規 API を作らない。以下のフローはすべて、UI 層 (page/composable) が
> data-foundation 既存の Auth API / RPC / PostgREST を「消費」する経路を示す。

---

## 1. 認証 middleware 判定フロー (`auth.global.ts`) 🔵

ADR-008 D1: 全分岐を 1 ファイルで判定。データ取得は `useCurrentGroup` の `useAsyncData('current-group')`
キャッシュを共有し、1 ナビゲーション 1 クエリ (ADR-008 D4 / NFR-002)。

```mermaid
flowchart TD
    Start([navigation: to]) --> Pub{to は public path?<br/>/login /confirm /join/**}
    Pub -->|Yes| PubLogin{to == /login<br/>かつ Group 所属済?}
    PubLogin -->|Yes| GoHome[navigateTo '/']
    PubLogin -->|No| Pass1([通過 / page へ])
    Pub -->|No| Auth{ログイン済?<br/>useSupabaseUser}
    Auth -->|No| GoLogin["navigateTo<br/>'/login?redirect=' + encodeURIComponent(to.fullPath)"]
    Auth -->|Yes| Grp{Group 所属?<br/>useCurrentGroup}
    Grp -->|No| OnbCheck{to が未所属許可 path?<br/>/onboarding or /groups/new}
    OnbCheck -->|Yes| Pass2([通過])
    OnbCheck -->|No| GoOnb[navigateTo '/onboarding']
    Grp -->|Yes| OnbRedir{to == /onboarding?}
    OnbRedir -->|Yes| GoHome2[navigateTo '/']
    OnbRedir -->|No| Pass3([通過 / page へ])
```

- **未所属許可 path** (`/onboarding`, `/groups/new`): ログイン済だが Group 未所属でも通す。
  `/groups/new` は「未所属ユーザがここで Group を作って所属する」動線の終点 (ADR-008 D1、2026-05-30 修正)。
- `/login` で Group 所属済 → `/` の分岐は **public path 側** (図上部 `PubLogin`) で処理。認証済ブランチでは `/onboarding` のみ判定。
- public path の `/join/**` は未ログインでも通過させ、**page 内で未認証リダイレクト** (ADR-008 D1 例外)。
- 関連 REQ: REQ-101/108 (未認証→/login+redirect)、REQ-102 (未所属→/onboarding)、REQ-103 (所属済→/)。

---

## 2. ログイン + OAuth コールバック 🔵

REQ-001 / REQ-008 / A2 (redirect クエリ運搬)。`useLogin` 経由 (page から直接 `supabase.auth` を叩かない、ADR-007 D9)。

```mermaid
sequenceDiagram
    actor U as ユーザ
    participant L as /login (useLogin)
    participant SB as Supabase Auth
    participant G as Google
    participant C as /confirm (useCurrentGroup)
    participant MW as auth.global.ts

    U->>L: 「Google でログイン」クリック
    L->>SB: signInWithOAuth({ provider:'google',<br/>options:{ redirectTo:'/confirm?redirect=...' } })
    SB-->>G: OAuth 認可画面へリダイレクト
    U->>G: Google アカウントで承認
    G-->>C: /confirm?redirect=... へ戻る (JWT cookie 確立)
    C->>C: セッション確立待ち (<USkeleton>)
    C->>MW: 確立後 navigateTo(route.query.redirect ?? '/')
    MW->>MW: §1 判定 (Group 有無で /onboarding or 目的地)
    Note over C,MW: Auth エラー時は useLogin.notice → <UAlert> (EDGE-002)
```

---

## 3. Group 作成 (`/groups/new`) 🔵

REQ-004。`useCreateGroup` → `create_group_with_owner` RPC。検証エラーは `useFormErrors` (inline)。

```mermaid
sequenceDiagram
    actor U as ユーザ
    participant P as /groups/new
    participant CG as useCreateGroup
    participant Z as Zod (group-name)
    participant SB as RPC create_group_with_owner
    participant CC as useCurrentGroup

    U->>P: Group 名入力 + 作成
    P->>Z: parse(name) 1〜50 文字/空白不可
    alt Zod 失敗
        Z-->>P: fieldErrors['name'] (<UFormField> inline, NFR-201)
    else Zod 成功
        P->>CG: create(name) — pending=true
        CG->>SB: rpc('create_group_with_owner', { group_name })
        alt RPC 成功
            SB-->>CG: group_id
            CG->>CC: refresh() (D5-4)
            CG-->>P: { data: group_id, error: null }
            P->>P: navigateTo('/')
        else invalid_group_name 例外
            SB-->>CG: error
            CG->>CG: setFieldError('name', error) (REQ-109)
            CG-->>P: { data: null, error }
        end
        Note over CG: pending=false
    end
```

> `groups.name` に UNIQUE 制約は無く「同名重複」エラーは存在しない (architecture.md §既存 API マッピング 注1)。
> create のエラーは `invalid_group_name` のみ。

---

## 4. 招待リンク参加 (`/join/[code]`) 🔵

REQ-005 / REQ-105。public path のため未認証は page 内で `/login` へ。`useJoinGroup` → `join_group_with_code`。
永続通知は `useNoticeErrors` (`<UAlert>`)。

```mermaid
sequenceDiagram
    actor U as ユーザ
    participant P as /join/[code]
    participant JG as useJoinGroup
    participant SB as RPC join_group_with_code
    participant CC as useCurrentGroup

    U->>P: 招待 URL を開く
    P->>P: useSupabaseUser 未ログイン?
    alt 未ログイン
        P->>P: navigateTo('/login?redirect=/join/[code]') (REQ-108)
    else ログイン済
        P->>JG: join(code) — pending=true
        JG->>SB: rpc('join_group_with_code', { invite_code })
        alt 成功
            SB-->>JG: group_id
            JG->>CC: refresh()
            JG-->>P: 成功 → navigateTo('/')
        else already_in_group (最初にチェック, ADR-006)
            SB-->>JG: error → setNotice → ALREADY_IN_GROUP
        else invitation_not_found
            SB-->>JG: error → 明示変換 → INVITATION_NOT_FOUND_BY_LINK
        else invitation_expired
            SB-->>JG: error → setNotice → INVITATION_EXPIRED
        end
        Note over JG,P: notice → <UAlert> 永続表示, pending=false
    end
```

> DB メッセージ `invitation_not_found` と App 識別子 `INVITATION_NOT_FOUND_BY_LINK` は文字列が異なるため、
> `useJoinGroup` 内で**明示判定して変換**する (素朴な includes に頼らない、architecture.md §既存 API マッピング 注2)。

---

## 5. 招待リンク発行 (`/groups/[id]/settings`) 🔵

REQ-006 / REQ-007。`useGenerateInvitation` → `generate_invitation_code`、発行後 `useListInvitations.refresh()`。
一過性通知は `useToast`。

```mermaid
sequenceDiagram
    actor U as ユーザ
    participant P as /groups/[id]/settings
    participant LI as useListInvitations
    participant GI as useGenerateInvitation
    participant SB as RPC generate_invitation_code
    participant T as useToast

    P->>LI: 初期表示: useAsyncData('invitations-list:{id}')
    LI-->>P: Invitation[] (一覧)
    U->>P: 「招待リンク発行」クリック
    P->>GI: generate(groupId) — pending=true
    GI->>SB: rpc('generate_invitation_code', { target_group_id })
    alt 成功
        SB-->>GI: 8 hex code
        GI->>LI: refresh() (D5-4) → 一覧自動更新
        GI-->>P: code
        P->>T: 「招待リンクを発行しました」
    else not_a_member
        SB-->>GI: error → useToastErrors.showError (NOT_A_MEMBER)
    else collision_after_retry
        SB-->>GI: error → showError (INVITATION_CODE_COLLISION_AFTER_RETRY)
    end
    Note over GI: pending=false
    U->>P: URL コピー → useToast「コピーしました」2 秒 (NFR-203)
```

---

## 6. エラーチャネルの集約ビュー 🔵

各フローのエラーがどのチャネルに流れるか (error-handling.md §6.2 決定木の本単位への適用):

| 発生源 | App 識別子 | チャネル | composable |
|--------|-----------|---------|-----------|
| Group 名検証 (Zod / RPC) | `INVALID_GROUP_NAME` | `<UFormField>` inline | `useFormErrors` |
| 招待リンク参加失敗 | `ALREADY_IN_GROUP` / `INVITATION_NOT_FOUND_BY_LINK` / `INVITATION_EXPIRED` | `<UAlert>` 永続 | `useNoticeErrors` |
| 招待発行失敗 / コピー完了 | `NOT_A_MEMBER` / `INVITATION_CODE_COLLISION_AFTER_RETRY` | `useToast()` 一過性 | `useToastErrors` |
| OAuth 失敗 | (Auth エラー) | `<UAlert>` | `useLogin.notice` (EDGE-002) |
| 認証切れ | `NOT_AUTHENTICATED` | `navigateTo('/login')` | middleware |
| 想定外例外 / unmapped | — | `error.vue` + Sentry | `useErrorMessage` fallthrough (NFR-304) |

## 関連文書

- [architecture.md](architecture.md) §認証 middleware / §画面構成 / §既存 API の利用マッピング
- [interfaces.ts](interfaces.ts) — 各 composable の戻り契約
- [error-handling.md](../cross-cutting/error-handling.md) §6 UI チャネル決定木
- ADR: [007](../../decisions/007-composable-naming-conventions.md) / [008](../../decisions/008-middleware-strategy.md) / [011](../../decisions/011-layout-strategy.md)
