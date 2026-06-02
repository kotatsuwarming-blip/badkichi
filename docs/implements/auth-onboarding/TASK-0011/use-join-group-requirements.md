# TDD要件定義書: useJoinGroup（RPC composable）

**機能名**: useJoinGroup（招待コードによる Group 参加）
**タスクID**: TASK-0011
**要件名**: auth-onboarding
**作成日**: 2026-06-01
**フェーズ**: Phase 2 - ドメインロジック層
**出力ファイル**: `docs/implements/auth-onboarding/TASK-0011/use-join-group-requirements.md`

---

## 1. 機能の概要（EARS要件定義書・設計文書ベース）

🔵 **青信号**: TASK-0011.md §タスク概要、interfaces.ts §5 UseJoinGroupReturn、dataflow.md §4 を直接参照

- **何をする機能か**: 招待コード（`inviteCode`）を受け取り、Supabase RPC `join_group_with_code` を呼び出してログイン中ユーザを Group に参加させる **Write 系 composable**。成功時は所属グループの global state を更新し、失敗時はエラー文言を永続通知チャネルに流す。
- **どのような問題を解決するか**: 招待リンクに着地したユーザが「グループに参加する」ユースケースを、UI から分離されたドメインロジックとして提供する（ADR-007 D1「1 ユースケース = 1 composable」）。特に DB 側の例外メッセージ（`invitation_not_found`）と App 識別子（`invitation_not_found_by_link`）の **文字列不一致**を吸収し、ユーザに正しい日本語文言を表示する。
- **想定されるユーザー**: 招待リンク（`/join/[code]`）に着地したログイン済みアプリ利用者（チームメンバー）。
- **システム内での位置づけ**: BaaS 直結レイヤードアーキテクチャのドメインロジック層。page（TASK-0018 `join/[code].vue`）と Supabase RPC の間に位置し、エラー変換（useNoticeErrors / useErrorMessage）と global state 更新（useCurrentGroup.refresh）を仲介する。server route は経由しない（ADR-010 D2: RLS + RPC で認可完結）。

- **参照したEARS要件**: REQ-005 / REQ-105 / REQ-106 / REQ-107
- **参照した設計文書**:
  - `docs/design/auth-onboarding/architecture.md` §既存 API の利用マッピング 注2 / 注3 / 注4
  - `docs/design/auth-onboarding/dataflow.md` §4（Group 作成・参加 sequence）
  - `docs/design/auth-onboarding/interfaces.ts` §5 UseJoinGroupReturn

---

## 2. 入力・出力の仕様（EARS機能要件・TypeScript型定義ベース）

🔵 **青信号**: interfaces.ts §3 ActionResult / §5 UseJoinGroupReturn、error-codes.ts を直接参照

### 入力パラメータ
- `join(inviteCode: string)`:
  - 型: `string`（招待コード文字列）
  - 制約: 形式バリデーションは本 composable の責務外（DB 側で `invitation_not_found` として判定される）。空文字でも RPC に渡されうる。
  - 🔵 信頼性: interfaces.ts §5、TASK-0011.md §完了条件

### 出力値
- **戻り値（composable）**: `UseJoinGroupReturn`
  - `join: (inviteCode: string) => Promise<ActionResult<string>>`
  - `pending: Ref<boolean>` — 二重送信防止（EDGE-003）。実行中 `true`、完了で `false`。
  - `notice: Ref<string | null>` — 永続エラー通知文言（`<UAlert>` 表示用）。エラーなしは `null`。
  - 🔵 信頼性: interfaces.ts §5 UseJoinGroupReturn と完全一致

- **`join` の戻り値**: `ActionResult<string>` = `{ data: string | null, error: unknown }`
  - 成功: `{ data: 'group_id', error: null }`
  - 失敗: `{ data: null, error: { message: 'error_code', ... } }`
  - page は `error` を「成功/失敗の分岐」にのみ使い、表示は `notice` を見る（ADR-007 §補遺）。
  - 🔵 信頼性: interfaces.ts §3 ActionResult、note.md §6 RPC 戻り値

### 入出力の関係性
- RPC `join_group_with_code({ invite_code: inviteCode })` の戻りを `{ data, error }` として受け、
  - `error === null` → `useCurrentGroup().refresh()` を await し、`notice` は `null` のまま。
  - `error !== null` → エラーを（必要に応じて詰め替えて）`setNotice` し、`notice` に i18n 文言を反映。`refresh()` は呼ばない。

### データフロー（dataflow.md §4）
```
join/[code].vue
  → useJoinGroup.join(inviteCode)
    → clear() / pending=true
    → supabase.rpc('join_group_with_code', { invite_code })
      ├─ 成功 → useCurrentGroup().refresh()（global state 更新, D5-4）
      └─ 失敗 → 識別子変換 → setNotice(mapped)（<UAlert> 永続通知）
    → pending=false
    → return { data, error }
```

- **参照したEARS要件**: REQ-005, REQ-105, REQ-106
- **参照した設計文書**: interfaces.ts §3 ActionResult / §5 UseJoinGroupReturn、dataflow.md §4

---

## 3. 制約条件（EARS非機能要件・アーキテクチャ設計ベース）

🔵 **青信号**: architecture.md / error-handling.md / error-codes.ts を直接参照、🟡 一部は規約からの妥当推測

### アーキテクチャ制約
- 🔵 BaaS 直結レイヤード: page は composable 経由のみ、Supabase 直接呼びは禁止（ADR-010 D2 / ADR-007 D1）。
- 🔵 `useSupabaseClient<Database>()` で型付きクライアントを取得し `rpc(...)` を呼ぶ。server route なし。
- 🔵 Composition API のみ（`<script setup>` / Options API 不使用）、state は `ref<T>()` で定義し戻り値に `Ref` を明示（CLAUDE.md §Coding Conventions）。

### エラーハンドリング制約（最重要・本タスクの非自明点）
- 🔵 **DB メッセージの明示変換（注2 / EDGE-005）**: DB が返す `invitation_not_found` と App 識別子 `invitation_not_found_by_link` は **文字列が異なる**。`isAppError(error, INVITATION_NOT_FOUND_BY_LINK)`（= `message.includes('invitation_not_found_by_link')`）では DB メッセージに一致しない。そのため useJoinGroup 内で **明示判定**し、`APP_ERROR_CODES.INVITATION_NOT_FOUND_BY_LINK` へ **詰め替えてから** `setNotice` する。
  - 判定論理式: `msg.includes('invitation_not_found') && !msg.includes('invitation_not_found_by_link')`
  - 詰め替え: `{ ...error, message: APP_ERROR_CODES.INVITATION_NOT_FOUND_BY_LINK }`
- 🔵 `already_in_group` → `ALREADY_IN_GROUP`、`invitation_expired` → `INVITATION_EXPIRED` は App 識別子と **文字列一致**するため、詰め替え不要で `setNotice(error)` がそのまま解決する。
- 🔵 エラー文言は i18n 集約（`errors.*` キー）、文字列リテラル禁止（error-handling.md §3 / §7）。
- 🔵 エラーチャネルは `useNoticeErrors`（`<UAlert>` 永続）。招待リンク着地はフィールド特定不能のため inline でなく `<UAlert>`（error-handling.md §6.3 代表例 #3）。

### データベース・RPC 制約
- 🔵 `join_group_with_code(invite_code text) → group_id(string)`。例外: `already_in_group` / `invitation_not_found` / `invitation_expired`。
- 🔵 ADR-006 により `join_group_with_code` は `already_in_group` を **最初に**チェックする。1 user = 1 group 違反は PG 23505（UNIQUE_VIOLATION）を待たず `already_in_group` 例外で早期失敗する（注4）。
- 🔵 `ALREADY_IN_GROUP: 'already_in_group'` は TASK-0003 で `APP_ERROR_CODES` に追加済（注3 / interfaces.ts §1）。

### i18n 制約
- 🔵 文言は `i18n/locales/ja.json` の `errors.*` に登録済:
  - `errors.already_in_group` / `errors.invitation_not_found_by_link` / `errors.invitation_expired`
- 🟡 en はハコ（dev で `?locale=en` 切替）。本タスクは ja のみ検証対象。

### パフォーマンス / 二重送信
- 🔵 `pending` で二重送信防止（EDGE-003）。`join` 冒頭で `true`、成功・失敗を問わず終了時に `false`。

- **参照したEARS要件**: REQ-005, REQ-105, REQ-106, EDGE-003, EDGE-005, NFR-002
- **参照した設計文書**: architecture.md §既存 API マッピング 注2/注3/注4、error-handling.md §3/§6.3/§6.4/§7、error-codes.ts、interfaces.ts §1/§5

---

## 4. 想定される使用例（EARS Edgeケース・データフローベース）

🔵 **青信号**: TASK-0011.md §単体テスト要件、dataflow.md §4、EDGE-005 を直接参照

### 基本的な使用パターン（正常系）
- **成功（REQ-005）**: 有効な招待コードで `join('abcd1234')` を呼ぶ → `rpc('join_group_with_code', { invite_code: 'abcd1234' })` が呼ばれ、`{ data: 'g1', error: null }` を受け取り、`useCurrentGroup().refresh()` を await。`notice.value` は `null` のまま。戻り値 `{ data: 'g1', error: null }`。

### エラーケース（異常系）
- **EDGE-005 / 注2: DB invitation_not_found → 明示変換（本タスクの核心）**: `rpc` が `{ data: null, error: { message: 'invitation_not_found' } }` を返す → useJoinGroup が明示判定して `INVITATION_NOT_FOUND_BY_LINK` に詰め替え → `notice.value` が `errors.invitation_not_found_by_link` の文言に解決される。素朴 `includes` では一致しないことを担保する。`refresh` は呼ばれない。
- **REQ-105: already_in_group**: `rpc` が `{ data: null, error: { message: 'already_in_group' } }` を返す → 詰め替え不要で `setNotice(error)` → `notice.value` が `errors.already_in_group` の文言に解決される。
- **REQ-106: invitation_expired**: `rpc` が `{ data: null, error: { message: 'invitation_expired' } }` を返す → 詰め替え不要で `setNotice(error)` → `notice.value` が `errors.invitation_expired` の文言に解決される。

### データフロー（dataflow.md §4）
- join/[code].vue が `pending`（送信ボタン disabled）と `notice`（`<UAlert>` 永続表示）を観測。成功で `refresh()` により global state 更新（D5-4）。

### エッジケース補足
- 🟡 unmapped エラー（想定外メッセージ）: `setNotice` 内部の `errorToMessage` が Sentry 報告 + `errors.generic` にフォールバック（useErrorMessage の責務、本 composable は詰め替えのみ）。
- 🔵 `clear()`: `join` 冒頭で前回の `notice` をリセット。

- **参照したEARS要件**: REQ-005, REQ-105, REQ-106, EDGE-003, EDGE-005
- **参照した設計文書**: dataflow.md §4、TASK-0011.md §単体テスト要件 TC1〜TC4

---

## 5. EARS要件・設計文書との対応関係

- **参照したユーザストーリー**: 招待リンクからの Group 参加（チームメンバーがリンクに着地して参加する）
- **参照した機能要件**: REQ-005（参加）, REQ-105（already_in_group）, REQ-106（invitation_expired）, REQ-107
- **参照した非機能要件**: NFR-002（useCurrentGroup 固定キー共有）
- **参照したEdgeケース**: EDGE-003（二重送信防止 pending）, EDGE-005（DB→App 識別子の明示変換）
- **参照した受け入れ基準（TASK-0011.md §完了条件）**:
  1. `join(inviteCode)` が `rpc('join_group_with_code', { invite_code: inviteCode })` を呼ぶ
  2. RPC 成功時に `useCurrentGroup().refresh()` を呼ぶ
  3. DB `invitation_not_found` を明示判定し `INVITATION_NOT_FOUND_BY_LINK` 文言で `notice` をセット
  4. `already_in_group` → `ALREADY_IN_GROUP` 文言で `notice` をセット
  5. `invitation_expired` → `INVITATION_EXPIRED` 文言で `notice` をセット
  6. `join` 実行中は `pending` が `true`、完了で `false`
  7. 戻り値が `UseJoinGroupReturn`（`join` / `pending: Ref<boolean>` / `notice: Ref<string | null>`）と一致
- **参照した設計文書**:
  - **アーキテクチャ**: `docs/design/auth-onboarding/architecture.md` §既存 API マッピング 注2/注3/注4
  - **データフロー**: `docs/design/auth-onboarding/dataflow.md` §4
  - **型定義**: `docs/design/auth-onboarding/interfaces.ts` §3 ActionResult / §5 UseJoinGroupReturn / §4 NoticeErrorsApi
  - **エラー定義**: `app/types/error-codes.ts`（APP_ERROR_CODES）, `docs/design/cross-cutting/error-handling.md` §3/§6.3/§6.4/§7
  - **i18n**: `i18n/locales/ja.json`（`errors.already_in_group` / `errors.invitation_not_found_by_link` / `errors.invitation_expired`）

---

## 実装ファイル

| ファイル | 責務 |
|---|---|
| `app/composables/useJoinGroup.ts` | **新規実装対象**（RPC composable） |
| `app/composables/useNoticeErrors.ts` | TASK-0007 実装済（notice / setNotice / clear） |
| `app/composables/useCurrentGroup.ts` | TASK-0009 実装済（refresh 呼び出し先） |
| `app/composables/useErrorMessage.ts` | TASK-0007 実装済（errorToMessage 変換） |
| `app/types/error-codes.ts` | TASK-0003 実装済（APP_ERROR_CODES + ALREADY_IN_GROUP） |
| `i18n/locales/ja.json` | 全エラー文言登録済 |
| `tests/unit/composables/useJoinGroup.test.ts` | **新規テストファイル**（TC1〜TC4） |
| `tests/unit/composables/useCreateGroup.test.ts` | テストパターン参考 |

---

## 品質判定

```
✅ 高品質:
- 要件の曖昧さ: なし（完了条件 7 項目が明確、最重要点 EDGE-005 も論理式まで確定）
- 入出力定義: 完全（interfaces.ts §5 UseJoinGroupReturn / §3 ActionResult と一致）
- 制約条件: 明確（注2 明示変換ロジック・注4 already_in_group 最優先・i18n 集約）
- 実装可能性: 確実（依存 composable は全て実装済、mock 戦略確立済）
- 信頼性レベル: 🔵 が大多数（タスクサマリー 5/5 🔵 100%）
```

**信頼性レベル分布**: 🔵 大多数（全項目が設計文書・タスクファイルに直接根拠あり）／ 🟡 少数（en ロケール・unmapped フォールバックの周辺補足）／ 🔴 なし

---

## 次フェーズ（testcases）への注意点

1. **EDGE-005 明示変換が最大の検証ポイント**: TC2（`invitation_not_found` → `INVITATION_NOT_FOUND_BY_LINK`）は「素朴 `includes` では一致しない」ことを担保する核心ケース。詰め替え後のエラーが `setNotice` に渡り、`notice.value` が `errors.invitation_not_found_by_link` の文言に解決されることを検証する。
2. **最小カバレッジ 4 ケース**: TC1（成功 + refresh）/ TC2（invitation_not_found 変換）/ TC3（already_in_group）/ TC4（invitation_expired）。冗長ケースは追加しない（feedback: 最小境界 + 分岐網羅）。
3. **mock 戦略**: `vi.mock('#imports')` で `useSupabaseClient` を差し替え `rpc` をスパイ、`useCurrentGroup` を mock して `refresh` をスパイ。`useNoticeErrors` は **実物**を使い（内部 `errorToMessage` も実物 or `t` を mock）、`notice.value` の結果文言を検証（ADR-012 D4）。`pending` / `notice` の `ref` は実物。参考: `tests/unit/composables/useCreateGroup.test.ts`。
4. **検証観点**: 成功時 `notice.value === null` かつ `refresh` 呼出、エラー時 `refresh` 非呼出 を各ケースで確認。RPC 呼出引数 `('join_group_with_code', { invite_code: ... })` も TC1 で検証。
5. **統合テストは不要**: RPC 本体（例外発火）は data-foundation で検証済（ADR-012 D2）。本タスクは App 側の識別子変換ロジックのみ mock unit で検証。
6. **DB メッセージ値の確認**: 実装時に最新 RPC コードで DB メッセージの厳密値を確認（現在の想定値が変わる可能性）。「素朴 includes に頼らない」原則は維持。
