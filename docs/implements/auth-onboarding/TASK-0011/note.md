# TASK-0011 TDD 開発ノート: useJoinGroup (RPC composable)

**作成日**: 2026-06-01  
**タスクID**: TASK-0011  
**要件名**: auth-onboarding  
**推定工数**: 8 時間  
**フェーズ**: Phase 2 - ドメインロジック層

---

## 1. 技術スタック

### フレームワーク・ランタイム
- **Nuxt**: 4.4 (Vue 3 + TypeScript strict mode)
  - 参照元: `docs/design/auth-onboarding/architecture.md` §コンポーネント構成、`package.json`

- **@nuxtjs/supabase**: isomorphic composable (`useSupabaseClient<Database>()` / `useSupabaseUser()`)
  - クライアント直結 BaaS (server route 不使用)
  - publishable key (`sb_publishable_*`) のみ使用
  - 参照元: `docs/design/auth-onboarding/architecture.md` §認証・データアクセス

### データベース・RPC
- **PostgreSQL (Supabase RPC)**: `join_group_with_code`
  - 引数: `{ invite_code: string }`
  - 戻り値: `group_id` (string)
  - 例外: `already_in_group` / `invitation_not_found` / `invitation_expired`
  - ADR-006 で 1 user = 1 group を保証、`already_in_group` を最初にチェック
  - 参照元: `docs/design/auth-onboarding/architecture.md` §バックエンド、dataflow.md §4

### 国際化 (i18n)
- **@nuxtjs/i18n**: Vue i18n 11
  - ロケール: ja のみ (en はハコ、dev で `?locale=en` 切替)
  - エラー文言は `i18n/locales/ja.json` の `errors.*` キーで定義
  - 参照元: `docs/design/auth-onboarding/architecture.md` §i18n

### エラー監視
- **@sentry/nuxt**: v10 (本タスクでは unmapped エラー報告のみ)
  - 参照元: `docs/design/auth-onboarding/architecture.md` §エラー監視

### テストフレームワーク
- **Vitest**: vitest.config.ts で alias (`#supabase-client` / `#nuxt-router` / `#async-data` 等) 定義済
  - Tests: `tests/unit/composables/useJoinGroup.test.ts` (mock 戦略: vi.hoisted + vi.mock('#imports'))
  - Alias 参照元: `vitest.config.ts`
  - 参照元: `docs/tasks/auth-onboarding/TASK-0011.md` §単体テスト要件、`tests/unit/composables/useCreateGroup.test.ts` (テストパターン例)

---

## 2. 開発ルール

### アーキテクチャパターン
- **BaaS 直結 + レイヤード**: page は composable 経由のみ、Supabase 直接呼びは禁止
  - ADR-010 D2: server route なし (MVP では RLS + RPC で認可完結)
  - ADR-007 D1: 「1 ユースケース = 1 composable」で UI とドメインロジック分離
  - 参照元: `docs/design/auth-onboarding/architecture.md` §アーキテクチャパターン

### エラーハンドリング規約
- **設計原則 9 項目**: 識別子集約 / 生文字列禁止 / 文言は i18n 集約 / チャネル別 composable 等
- **App 識別子**: APP_ERROR_CODES で const 管理、1:1 マッピング (context 不要)
- **PG SQLSTATE**: context による出し分け (join_group / create_group / generic)
- **識別子追加手順**: (1) DB RAISE EXCEPTION (2) APP_ERROR_CODES に追加 (3) useErrorMessage に分岐 (4) i18n キー追加
- **注意**: ALREADY_IN_GROUP は TASK-0003 で error-codes.ts に既追加、本ノートの時点で有効
- 参照元: `docs/design/cross-cutting/error-handling.md` §3 設計原則、§4.1 ファイル、§4.2 追加手順

### Composition API コーディング規約
- `<script setup lang="ts">` のみ (Options API 不使用)
- `ref<T>()` で state 定義、戻り値に Ref を明示
- async 関数は Promise を返し、await で完了待ち (useAsyncData は不使用、RPC は直接呼び)
- 参照元: `CLAUDE.md` §Coding Conventions

### i18n 規約
- **エラー文言**: `t('errors.識別子')` で翻訳、「文字列リテラル禁止」
- **キー命名**: スネークケース (`invitation_not_found_by_link`)
- **ロケール**: `i18n/locales/ja.json` に全キー登録 (en はハコ)
- **@記号エスケープ**: `@` は `{'@'}` でエスケープ (Nuxt i18n interpolation 回避)
- 参照元: `docs/design/cross-cutting/error-handling.md` §7、MEMORY feedback_doc_language.md

---

## 3. 関連実装

### useNoticeErrors (TASK-0007 実装済)
- **責務**: `useNoticeErrors()` は error-handling.md §6.4 の実装コードそのまま
- **API**: `{ notice, setNotice, clear }`
  - `notice`: Ref<string | null> (通知文言、null = 通知なし)
  - `setNotice(error, pgContext?)`: errorToMessage 経由で notice に文言を書き込む
  - `clear()`: notice.value = null
- **内部**: useErrorMessage の errorToMessage を薄くラップ (変換ロジックは持たない)
- 参照元: `app/composables/useNoticeErrors.ts`, `docs/design/cross-cutting/error-handling.md` §6.4

### useErrorMessage (TASK-0007 実装済)
- **責務**: エラーオブジェクトを i18n 文言に変換する中核 composable
- **API**: `{ errorToMessage(error, pgContext?) }`
  - App 識別子 → flat i18n キー (ALREADY_IN_GROUP / INVITATION_NOT_FOUND_BY_LINK / INVITATION_EXPIRED 等)
  - PG SQLSTATE → tWithContext (context キー存在なら context 版、なければ .generic フォールバック)
  - fallthrough (unmapped) → Sentry 報告 + `errors.generic`
- **分岐**: `isAppError()` / `isPgError()` で識別 (素朴 includes は使わない)
- 参照元: `app/composables/useErrorMessage.ts`

### useCurrentGroup (TASK-0009 実装済)
- **責務**: ログイン中ユーザが所属する Group を 1 件読み取る (Select)
- **API**: `AsyncState<CurrentGroup | null>` の戻り
  - `refresh()`: 非同期でクエリを再実行
  - `data.value`: CurrentGroup | null
  - `pending.value`: Ref<boolean>
- **実装詳細**: useAsyncData('current-group') の固定キーでラップ、middleware と page が同一キーを共有 (NFR-002)
- **使用シーン**: 成功時に `useCurrentGroup().refresh()` を呼んで global state を更新
- 参照元: `app/composables/useCurrentGroup.ts`, `docs/design/auth-onboarding/dataflow.md` §4

### useCreateGroup (TASK-0010 実装済)
- **テストパターン参考**: `tests/unit/composables/useCreateGroup.test.ts`
  - vi.hoisted で mock 変数先行定義
  - vi.mock('#imports') で useSupabaseClient / useCurrentGroup / useFormErrors を差し替え
  - vi.mock('#supabase-client') で Nuxt Vite transform 対応
  - vi.mock('~/composables/useCurrentGroup') で直接 mock
  - beforeEach で vi.clearAllMocks()
- 参照元: `tests/unit/composables/useCreateGroup.test.ts`

---

## 4. 設計文書

### アーキテクチャ・フロー設計
- **architecture.md**: BaaS 直結レイヤード / コンポーネント構成 / 認証・データアクセス / バックエンド
  - §既存 API の利用マッピング 注2: DB `invitation_not_found` vs App `INVITATION_NOT_FOUND_BY_LINK` の文字列不一致
  - §既存 API マッピング 注3: ALREADY_IN_GROUP は本単位で追加済 (interfaces.ts §1)
  - §既存 API マッピング 注4: join_group_with_code は already_in_group を最初にチェック (1 user = 1 group 違反を PG 23505 待たず識別)
- **dataflow.md**: 全 6 フロー中 §4「Group 作成」に useJoinGroup が登場
  - Sequence diagram: join/[code].vue → useJoinGroup → RPC join_group_with_code → useCurrentGroup.refresh()
  - D5-4: 成功時は refresh() でグローバル state 更新
- **interfaces.ts**: UseJoinGroupReturn = { join, pending, notice }
  - join: (inviteCode) => Promise<ActionResult<string>>
  - pending: Ref<boolean> (EDGE-003: 二重送信防止)
  - notice: Ref<string | null> (招待リンク着地の永続通知)
- 参照元: `docs/design/auth-onboarding/architecture.md`, `docs/design/auth-onboarding/dataflow.md`, `docs/design/auth-onboarding/interfaces.ts`

### エラーコード定義
- **error-codes.ts**: APP_ERROR_CODES に ALREADY_IN_GROUP / INVITATION_NOT_FOUND_BY_LINK / INVITATION_EXPIRED 定義済
  - ALWAYS_IN_GROUP: `'already_in_group'` (本単位で採用、interfaces.ts §1)
  - INVITATION_NOT_FOUND_BY_LINK: `'invitation_not_found_by_link'` (MVP: URL 直リンク着地のみ)
  - INVITATION_EXPIRED: `'invitation_expired'`
- **isAppError / isPgError**: 識別者関数 (素朴 includes ではなく厳密判定)
- 参照元: `app/types/error-codes.ts`

### i18n ロケール定義
- **ja.json**: errors キー配下に全文言登録済
  - `errors.already_in_group`: "すでにグループに参加しています"
  - `errors.invitation_not_found_by_link`: "招待リンクが無効です。発行者にご確認ください"
  - `errors.invitation_expired`: "招待コードの有効期限が切れています"
- 参照元: `i18n/locales/ja.json`

---

## 5. テスト関連情報

### テストフレームワーク・設定
- **Vitest**: `vitest.config.ts` で alias 定義済
  - alias: `#nuxt-router` / `#supabase-client` / `#supabase-user` / `#async-data`
  - test.include: `tests/unit/**/*.test.ts`
  - test.exclude: `**/*.integration.test.ts` (integration テストは別 config)
  - test.passWithNoTests: true (テスト 0 件でも pass)
- 参照元: `vitest.config.ts`

### 既存テストのディレクトリ構成・命名パターン
- **ユニットテスト**: `tests/unit/composables/*.test.ts`
  - useCreateGroup.test.ts (ref/RPC mock パターン)
  - useErrorMessage.test.ts (エラー変換パターン)
  - useFormErrors.test.ts
  - useNoticeErrors.test.ts
  - useToastErrors.test.ts
- **統合テスト**: `tests/integration/*.integration.test.ts` (DB 実接続、fileParallelism: false)
- 参照元: `tests/unit/`, `tests/integration/`

### テストユーティリティ・モック設定
- **vi.hoisted**: TDZ 回避で mock 変数を先行定義
- **vi.mock('#imports')**: Nuxt auto-import を丸ごと差し替え (ref は importOriginal で実物)
- **vi.mock('#supabase-client')**: useSupabaseClient の Nuxt Vite transform 対応
- **vi.mock('~/composables/...')**: composable ファイルの直接 mock
- **beforeEach**: vi.clearAllMocks() で TC 間 state 漏れを防止
- **ref 実物**: pending / notice は ref <vue> 実物を使用 (state が Ref<T> として機能するため)
- 参照元: `tests/unit/composables/useCreateGroup.test.ts` (テストパターン例)

### テストケース要件 (最小カバレッジ)
- **TC1**: 成功 → refresh 呼出、notice.value は null のまま
- **TC2**: DB `invitation_not_found` → **明示変換**で `INVITATION_NOT_FOUND_BY_LINK` に詰め替え、notice に文言反映 (EDGE-005 の核心)
- **TC3**: `already_in_group` → `ALREADY_IN_GROUP` notice
- **TC4**: `invitation_expired` → `INVITATION_EXPIRED` notice
- 参照元: `docs/tasks/auth-onboarding/TASK-0011.md` §単体テスト要件

---

## 6. 注意事項・最重要ポイント

### 【最重要】DB メッセージの明示変換 (EDGE-005)

**問題**: DB の RPC `join_group_with_code` は例外メッセージ `invitation_not_found` を返すが、
App 識別子は `INVITATION_NOT_FOUND_BY_LINK` であり、文字列が **異なる**。

```
DB: "invitation_not_found"
App: "invitation_not_found_by_link"
```

素朴な `includes('invitation_not_found_by_link')` では一致しない。

**解決方法**: useJoinGroup 内で、DB メッセージを明示判定し App 識別子へ詰め替える (注2 / EDGE-005)。

```ts
const msg = (error as { message?: string }).message ?? ''
const mapped = msg.includes('invitation_not_found') && !msg.includes('invitation_not_found_by_link')
  ? { ...error, message: APP_ERROR_CODES.INVITATION_NOT_FOUND_BY_LINK }
  : error
setNotice(mapped)  // 詰め替え後のエラーを setNotice に渡す
```

- `already_in_group` → `ALREADY_IN_GROUP` (文字列一致するため素朴 includes で OK)
- `invitation_expired` → `INVITATION_EXPIRED` (文字列一致するため素朴 includes で OK)

参照元: `docs/tasks/auth-onboarding/TASK-0011.md` §実装詳細、§注意事項

### RPC 戻り値
- 成功: `{ data: 'group_id', error: null }` (ActionResult 形)
- 失敗: `{ data: null, error: { message: 'error_code' | 'SQLSTATE', ... } }`
- 参照元: `docs/design/auth-onboarding/dataflow.md` §4

### pending 二重送信防止 (EDGE-003)
- `join` 冒頭で `pending.value = true`
- `join` 終了時 (成功・失敗を問わず) `pending.value = false`
- UI は `pending.value` に基づいて送信ボタンを disabled
- 参照元: `docs/tasks/auth-onboarding/TASK-0011.md` §完了条件 4

### clear() 呼び出し
- `join` 冒頭で `clear()` を呼び、前回のエラー通知をリセット
- 参照元: `docs/tasks/auth-onboarding/TASK-0011.md` §実装詳細

### 統合テスト不要
- join_group_with_code の RPC 本体 (already_in_group / invitation_not_found / invitation_expired 発火) は data-foundation で検証済 (ADR-012 D2)
- 本タスクは App 側の識別子変換ロジック (注2) のみを mock unit で検証
- 参照元: `docs/tasks/auth-onboarding/TASK-0011.md` §統合テスト要件

### 型契約
- 戻り値: `UseJoinGroupReturn { join, pending, notice }` (interfaces.ts で定義済)
- `join`: (inviteCode: string) => Promise<ActionResult<string>>
- `pending`: Ref<boolean>
- `notice`: Ref<string | null>
- 参照元: `docs/design/auth-onboarding/interfaces.ts` §5

---

## 7. 実装ファイルパス

| ファイル | 責務 |
|---|---|
| `app/composables/useJoinGroup.ts` | 新規実装対象 (RPC composable) |
| `app/composables/useNoticeErrors.ts` | TASK-0007 実装済 (チャネル) |
| `app/composables/useCurrentGroup.ts` | TASK-0009 実装済 (refresh 呼び出し先) |
| `app/composables/useErrorMessage.ts` | TASK-0007 実装済 (エラー変換) |
| `app/types/error-codes.ts` | TASK-0003 実装済 (APP_ERROR_CODES + ALREADY_IN_GROUP) |
| `app/types/supabase.ts` | 生成型 (RPC 引数・戻り) |
| `i18n/locales/ja.json` | 全エラー文言登録済 |
| `tests/unit/composables/useJoinGroup.test.ts` | 新規テストファイル (TC1-4) |
| `tests/unit/composables/useCreateGroup.test.ts` | テストパターン参考 |
| `vitest.config.ts` | alias / exclude 定義済 |

---

## 次フェーズ (requirements → testcases) への注意点

### 明示変換ロジック (EDGE-005) の厳密性
- DB メッセージ値を実装時に最新 RPC コードで確認 (現在の想定値が変わる可能性)
- 明示判定は `msg.includes('invitation_not_found') && !msg.includes('invitation_not_found_by_link')` の論理式で確保
- errorToMessage の分岐は素朴 `includes` のままで OK (詰め替え後のエラーが渡されるため)

### error-codes.ts 定義確認
- `ALREADY_IN_GROUP: 'already_in_group'` が既に定義済か確認 (TASK-0003 で追加予定)
- `INVITATION_NOT_FOUND_BY_LINK: 'invitation_not_found_by_link'` は既に定義済
- useErrorMessage に上記分岐が実装済か確認 (TASK-0007)

### i18n キー整備
- `errors.already_in_group` / `errors.invitation_not_found_by_link` / `errors.invitation_expired` が全て `i18n/locales/ja.json` に登録済

---

**開発開始準備**: 上記を確認のうえ、`/tsumiki:tdd-requirements auth-onboarding TASK-0011` から開始してください。
