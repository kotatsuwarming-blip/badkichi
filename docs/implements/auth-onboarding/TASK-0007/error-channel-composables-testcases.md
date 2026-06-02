# TDDテストケース定義書: cross-cutting エラーチャネル composable 4本

- **機能名**: error-channel-composables（useErrorMessage / useFormErrors / useNoticeErrors / useToastErrors）
- **タスクID**: TASK-0007
- **要件名**: auth-onboarding
- **作成日**: 2026-06-01
- **対象ファイル**:
  - `app/composables/useErrorMessage.ts`
  - `app/composables/useFormErrors.ts`
  - `app/composables/useNoticeErrors.ts`
  - `app/composables/useToastErrors.ts`

---

## 0. テスト戦略サマリー（最小カバレッジ）

🔵 *memory `feedback_test_coverage` + ADR-012 D2/D4 + TASK-0007.md §単体テスト要件*

本タスクは「最小カバレッジ」を厳守する。`useErrorMessage` の分岐に検証を集中させ、3 チャネルラッパは state 反映のみ各 1 ケースに絞る。

| TC | 対象 | 観点 | 区分 | テストファイル |
|----|------|------|------|----------------|
| TC1 | useErrorMessage | App 識別子 1:1 分岐の代表（`INVALID_GROUP_NAME`） | 正常系 | `tests/unit/composables/useErrorMessage.test.ts` |
| TC2 | useErrorMessage | 未マッピング fallthrough → `errors.generic` + Sentry 報告 | 異常系 | `tests/unit/composables/useErrorMessage.test.ts` |
| TC3 | useErrorMessage | PG SQLSTATE context 出し分け（`UNIQUE_VIOLATION`、`te` 真/偽の分岐境界） | 境界値 | `tests/unit/composables/useErrorMessage.test.ts` |
| TC4 | 3 チャネルラッパ | `errorToMessage` の戻りを各 state に載せる + clear | 正常系 | `tests/unit/composables/useFormErrors.test.ts` / `useNoticeErrors.test.ts` / `useToastErrors.test.ts` |

**意図的に除外したケース（冗長禁止）**:
- App 識別子 7 種の個別テスト（`NOT_AUTHENTICATED` 等 6 種）→ 1:1 分岐の代表 1 件（TC1）で代表。
- PG SQLSTATE 4 種の個別テスト（`FK_VIOLATION` / `CHECK_VIOLATION` / `RLS_REJECTED`）→ context 出し分けロジックは `UNIQUE_VIOLATION`（TC3）で代表。
- `error-codes.ts` の境界値テスト（`isAppError` / `isPgError` 判定）→ TASK-0003 / group-name.test.ts で検証済（本タスク対象外）。
- 統合テスト → DB を触らない純クライアントロジックのため不要（ADR-012 D2）。

---

## 1. 正常系テストケース

### TC1: App 識別子 → 対応文言（1:1 分岐の代表）

- **テスト名**: App 識別子 INVALID_GROUP_NAME が 1:1 で i18n キーに変換される
  - **何をテストするか**: `isAppError` が App 識別子に一致したとき、`t('errors.{code}')`（flat キー、context 不使用）の文言が返ることを確認する。
  - **期待される動作**: `errorToMessage` が App 識別子分岐に入り、`t('errors.invalid_group_name')` の戻りをそのまま返す。
- **入力値**: `errorToMessage({ message: 'invalid_group_name' })`
  - **入力データの意味**: `isAppError` は `error.message.includes(code)` で判定するため、`message` に識別子文字列を含むオブジェクトが App 識別子エラーの最小代表。`INVALID_GROUP_NAME` を 7 種の代表として選定（1:1 分岐ロジックは全識別子で同一構造のため 1 件で十分）。
- **期待される結果**: 戻り値が `t('errors.invalid_group_name')` の値（mock の `t` がキー透過のため `'errors.invalid_group_name'`）。
  - **期待結果の理由**: App 識別子は context を取らず flat キーで 1:1 変換する設計（error-handling.md §5.4）。`pgContext` 引数は App 識別子分岐では無視される。
- **テストの目的**: App 識別子 → flat i18n キーの 1:1 変換分岐が正しく動くことの確認。
  - **確認ポイント**: `t` が `'errors.invalid_group_name'` というキーで呼ばれること。`te`（context 判定）が呼ばれないこと。Sentry が呼ばれないこと（マッピング済のため）。
- 🔵 *error-handling.md §5.1（実装コードそのまま）+ TASK-0007.md TC1 + error-codes.ts `isAppError` 実測*

---

### TC4-a: useFormErrors が文言を fieldErrors に載せ、clear で削除する

- **テスト名**: setFieldError で fieldErrors に文言が載り、clear で削除される
  - **何をテストするか**: `useErrorMessage` を mock して固定文言を返させ、`setFieldError(field, err)` が `fieldErrors.value[field]` に文言を書き込み、`clear(field)` が当該キーを削除することを確認する。
  - **期待される動作**: state Ref `fieldErrors` に文言が反映され、`clear` でリセットされる薄いラッパとして機能する。
- **入力値**:
  - 初期状態: `fieldErrors.value` は `{}`。
  - `setFieldError('name', err)` を呼ぶ（`err` は任意、`errorToMessage` mock が固定文言 `'mocked_message'` を返す）。
  - その後 `clear('name')` を呼ぶ。
  - **入力データの意味**: ラッパが `useErrorMessage().errorToMessage` の戻りを state に流すだけの薄い層であることを検証するため、変換ロジックは mock で固定化し、state 操作のみに集中する。
- **期待される結果**:
  - `setFieldError` 後: `fieldErrors.value['name'] === 'mocked_message'`。
  - `clear('name')` 後: `fieldErrors.value['name'] === undefined`（キー削除）。
  - **期待結果の理由**: interfaces.ts §4 `FormErrorsApi`（`fieldErrors` / `setFieldError` / `clear`）に従い、`clear(field)` は当該キーのみ `delete` する設計（error-handling.md §6.4）。
- **テストの目的**: useFormErrors の state 反映（set）とリセット（clear 単一）が正しいことの確認。
  - **確認ポイント**: `errorToMessage` mock が呼ばれること（引数 `err` を渡す）。`fieldErrors` が Ref であること。clear 単一指定が当該フィールドのみ消すこと。
- 🔵 *error-handling.md §6.4 + interfaces.ts §4 `FormErrorsApi` + TASK-0007.md TC4*

---

### TC4-b: useNoticeErrors が文言を notice に載せ、clear で null に戻す

- **テスト名**: setNotice で notice に文言が載り、clear で null になる
  - **何をテストするか**: `useErrorMessage` を mock して固定文言を返させ、`setNotice(err)` が `notice.value` に文言を書き込み、`clear()` が `null` に戻すことを確認する。
  - **期待される動作**: state Ref `notice` に文言が反映され、`clear` で `null` にリセットされる。
- **入力値**:
  - 初期状態: `notice.value` は `null`。
  - `setNotice(err)` を呼ぶ（`errorToMessage` mock が `'mocked_message'` を返す）。
  - その後 `clear()` を呼ぶ。
  - **入力データの意味**: `<UAlert>` 表示用の単一通知 state にラッパが文言を流すだけであることを検証する。
- **期待される結果**:
  - `setNotice` 後: `notice.value === 'mocked_message'`。
  - `clear()` 後: `notice.value === null`。
  - **期待結果の理由**: interfaces.ts §4 `NoticeErrorsApi`（`notice` / `setNotice` / `clear`）に従う。初期値 `null`、`clear()` は `null` 復帰（error-handling.md §6.4）。
- **テストの目的**: useNoticeErrors の state 反映とリセットが正しいことの確認。
  - **確認ポイント**: 初期値が `null` であること。`errorToMessage` mock が呼ばれること。`clear()` が `null` を返すこと（`''` や `{}` ではない）。
- 🔵 *error-handling.md §6.4 + interfaces.ts §4 `NoticeErrorsApi` + TASK-0007.md TC4*

---

### TC4-c: useToastErrors が toast.add を文言と color: 'red' で呼ぶ

- **テスト名**: showError で useToast().add が title: 文言, color: 'red' で呼ばれる
  - **何をテストするか**: `useErrorMessage` と `useToast` を mock し、`showError(err)` が `toast.add({ title: 文言, color: 'red' })` を呼ぶことを確認する。state は保持しない（一過性）。
  - **期待される動作**: 変換文言を一過性トーストとして表示するため `useToast().add` を 1 回呼ぶ。
- **入力値**:
  - `showError(err)` を呼ぶ（`errorToMessage` mock が `'mocked_message'` を返す、`useToast` mock が `{ add: vi.fn() }` を返す）。
  - **入力データの意味**: トーストは state を保持しない一過性チャネルのため、検証対象は `add` の呼び出し引数のみ。
- **期待される結果**:
  - `toast.add` が `{ title: 'mocked_message', color: 'red' }` で 1 回呼ばれる。
  - **期待結果の理由**: interfaces.ts §4 `ToastErrorsApi`（`showError` のみ）に従い、`toast.add({ title: errorToMessage(...), color: 'red' })` を呼ぶ設計（error-handling.md §6.4）。`color: 'red'` はエラートーストの規約色。
- **テストの目的**: useToastErrors の toast 連携（引数形式・回数）が正しいことの確認。
  - **確認ポイント**: `add` が `toHaveBeenCalledTimes(1)`。引数オブジェクトが `{ title, color: 'red' }` に厳密一致。`errorToMessage` mock が呼ばれること。
- 🔵 *error-handling.md §6.4 + interfaces.ts §4 `ToastErrorsApi` + TASK-0007.md TC4*

---

## 2. 異常系テストケース

### TC2: 未マッピングエラー → generic + Sentry 報告（fallthrough 分岐）

- **テスト名**: 未マッピングエラーは errors.generic を返し Sentry.captureException を 1 回呼ぶ
  - **エラーケースの概要**: App 識別子にも PG SQLSTATE にも一致しないエラーが入力されたとき、全 if 分岐を素通り（fallthrough）して `errors.generic` を返しつつ Sentry に報告する。
  - **エラー処理の重要性**: 想定外エラーを文言上はユーザに優しい汎用メッセージで吸収しつつ、運用検知のため Sentry に集約する（NFR-304）。取りこぼすと運用時に検知漏れが発生する。
- **入力値**: `errorToMessage(new Error('something unexpected'))`（または `errorToMessage({})` 等、識別子に一致しない任意のオブジェクト）。
  - **不正な理由**: `message` に App 識別子文字列を含まず、`code` も PG SQLSTATE のいずれにも一致しないため、すべての `isAppError` / `isPgError` 判定が偽となる。
  - **実際の発生シナリオ**: ネットワークエラー、想定外の RPC 例外、ライブラリ内部例外など、設計時に識別子化していないエラーが発生したとき。
- **期待される結果**:
  - 戻り値が `t('errors.generic')` の値（mock キー透過で `'errors.generic'`）。
  - `Sentry.captureException` が `(error, { tags: { reason: 'unmapped_error_code' } })` で **1 回** 呼ばれる。
  - **エラーメッセージの内容**: ユーザには汎用エラー文言（`errors.generic`）を提示し、技術詳細は晒さない。
  - **システムの安全性**: 例外を握りつぶさず Sentry に送ることで、文言は安全・監視は確実という二重の安全性を担保。
- **テストの目的**: fallthrough 分岐と Sentry 報告（タグ形式厳密一致）の確認。
  - **品質保証の観点**: 未マッピングエラーの検知漏れを防ぐ運用品質を保証する。タグ `reason: 'unmapped_error_code'` の厳密一致が Sentry ダッシュボードでの分類精度に直結する。
- 🔵 *error-handling.md §5.1 fallthrough + NFR-304 + TASK-0007.md TC2*

---

## 3. 境界値テストケース

### TC3: PG SQLSTATE の context 出し分け（te 真/偽の分岐境界）

- **テスト名**: UNIQUE_VIOLATION の context キー存在で出し分け（te 真→ctx / 偽→generic）
  - **境界値の意味**: `tWithContext` の `te(ctxKey)` 判定が「context キーが i18n に存在するか否か」という真偽の境界を分ける。この境界が `errors.{code}.{ctx}` と `errors.{code}.generic` の出し分けを決定する。
  - **境界値での動作保証**: `te` が真のとき context キー、偽のとき `.generic` フォールバックという両側の動作が一貫することを保証する。
- **入力値**:
  - ケースA（te 真）: `errorToMessage({ code: '23505' }, 'join_group')`、`te` mock が `'errors.unique_violation.join_group'` に対して `true` を返す。
  - ケースB（te 偽 / フォールバック）: `errorToMessage({ code: '23505' }, 'generic')`、`te` mock が context キーに対して `false` を返す。
  - **境界値選択の根拠**: `UNIQUE_VIOLATION`（`code: '23505'`）は context 出し分けを持つ PG SQLSTATE の代表。`te` 真/偽が `tWithContext` の唯一の分岐点であり、両側を 1 件ずつ押さえれば PG context ロジックを完全にカバーできる。
  - **実際の使用場面**: グループ参加時の重複（`join_group`）と汎用文脈（`generic`）で同じ SQLSTATE でも異なる文言を出すケース。
- **期待される結果**:
  - ケースA: `t` が `'errors.unique_violation.join_group'` で呼ばれ、その戻りが返る。
  - ケースB: `te` が偽のため `t` が `'errors.unique_violation.generic'`（フォールバックキー）で呼ばれ、その戻りが返る。
  - **境界での正確性**: `te` が真のときに context キー、偽のときに `.generic` という分岐が正確に選択される。
  - **一貫した動作**: 境界の内側（キーあり）と外側（キーなし）で出し分けが一貫し、欠落キーでも例外を出さず `.generic` に安全に倒れる。
- **テストの目的**: `tWithContext` の `te()` 存在判定によるキー出し分け境界の確認。
  - **堅牢性の確認**: i18n に context キーが定義されていない場合でも `.generic` にフォールバックしてクラッシュしないこと。
- 🔵 *error-handling.md §5.1 `tWithContext` / §5.3 + TASK-0007.md TC3 + error-codes.ts `isPgError` / `PG_ERROR_CODES.UNIQUE_VIOLATION='23505'` 実測*

---

## 4. 開発言語・フレームワーク

- **プログラミング言語**: TypeScript（strict mode）
  - **言語選択の理由**: プロジェクト全体が Nuxt 4 + Vue 3 + TypeScript strict（CLAUDE.md Coding Conventions）。composable は `<script setup>` 同様 Composition API 前提で TS で書く。
  - **テストに適した機能**: 戻り値型（`ErrorMessageApi` 等）の静的検証、`unknown` 型のエラー入力の安全な絞り込みを型レベルで保証できる。
- **テストフレームワーク**: Vitest + Vue Test Utils（@nuxt/test-utils）
  - **フレームワーク選択の理由**: vitest.config.ts に既設定（`tests/unit/**/*.test.ts` を対象、`*.integration.test.ts` 除外、`passWithNoTests: true`）。既存テスト（group-name.test.ts）も Vitest で統一。
  - **テスト実行環境**: mock unit レイヤー（pre-commit + CI）。`pnpm test` 系で実行。DB 非依存のため CI 専用 integration とは分離。
- **mock 戦略（ADR-012 D4）**:
  - `vi.mock('#imports')` で Nuxt auto-import の `useI18n` を差し替え:
    - `t(key)`: 引数キーをそのまま返す（キー透過）。これにより「どのキーで `t` が呼ばれたか」を戻り値で直接アサートできる。
    - `te(key)`: context 存在判定を制御。TC3 ケースA は `true`、ケースB は `false` を返すよう `mockReturnValue` で切替。
  - `@sentry/nuxt` の `captureException` を `vi.fn()` でスパイ（TC2 で呼び出し引数・回数を検証）。
  - TC4 では `useErrorMessage` 自体を mock し `errorToMessage` が固定文言 `'mocked_message'` を返すよう差し替え（ラッパの state 反映のみに集中）。`useToast` も `{ add: vi.fn() }` で mock。
- 🔵 *vitest.config.ts 実測 + ADR-012 D2/D4 + note.md §5 mock 戦略 + group-name.test.ts 実測*

---

## 5. テストケース実装時の日本語コメント指針

各テストには以下の構造で日本語コメントを必ず付与する（Given / When / Then を明示）。

### TC1 実装コメント例（useErrorMessage.test.ts）

```typescript
// 【テスト目的】: App 識別子 INVALID_GROUP_NAME が 1:1 で i18n flat キーに変換されることを確認
// 【テスト内容】: errorToMessage に App 識別子エラーを渡し、t('errors.invalid_group_name') の戻りが返るか検証
// 【期待される動作】: App 識別子分岐に入り context 不使用で flat キーが引かれる
// 🔵 error-handling.md §5.1 + TASK-0007.md TC1

// 【テストデータ準備】: isAppError が message.includes(code) で判定するため message に識別子文字列を持つオブジェクトを用意
// 【初期条件設定】: useI18n の t はキー透過、te・Sentry は未呼び出しが期待される状態
const error = { message: 'invalid_group_name' }

// 【実際の処理実行】: useErrorMessage().errorToMessage(error) を呼ぶ
// 【処理内容】: App 識別子分岐の評価と t 呼び出し
const { errorToMessage } = useErrorMessage()
const result = errorToMessage(error)

// 【結果検証】: 戻り値が errors.invalid_group_name キーであること、context 判定と Sentry が呼ばれないこと
// 【検証項目】: 1:1 flat キー変換が正しいこと
// 🔵
expect(result).toBe('errors.invalid_group_name') // 【確認内容】: App 識別子が flat キーに 1:1 変換される
expect(captureExceptionSpy).not.toHaveBeenCalled() // 【確認内容】: マッピング済のため Sentry に送らない
```

### TC2 実装コメント例

```typescript
// 【テスト目的】: 未マッピングエラーが errors.generic を返し Sentry に報告されることを確認
// 【テスト内容】: 識別子に一致しないエラーで fallthrough 分岐に入るか、captureException が正しいタグで 1 回呼ばれるか検証
// 【期待される動作】: t('errors.generic') 返却 + Sentry.captureException 呼び出し
// 🔵 error-handling.md §5.1 fallthrough + NFR-304

const error = new Error('something unexpected') // 【テストデータ準備】: 識別子に一致しない想定外エラー

const result = useErrorMessage().errorToMessage(error)

// 【結果検証】: generic 文言と Sentry 報告（タグ厳密一致）
expect(result).toBe('errors.generic') // 【確認内容】: fallthrough で汎用文言を返す
expect(captureExceptionSpy).toHaveBeenCalledTimes(1) // 【確認内容】: Sentry 報告は 1 回のみ
expect(captureExceptionSpy).toHaveBeenCalledWith(error, { tags: { reason: 'unmapped_error_code' } }) // 【確認内容】: タグ形式が NFR-304 に厳密一致
```

### TC3 実装コメント例（te 真/偽の 2 ケース）

```typescript
// 【テスト目的】: PG SQLSTATE の context 出し分け（te 真→ctx キー / 偽→.generic フォールバック）を確認
// 🔵 error-handling.md §5.1 tWithContext / §5.3

// ケースA: te が真 → context キー
teMock.mockReturnValue(true) // 【初期条件設定】: context キー存在を真に制御
const resultA = useErrorMessage().errorToMessage({ code: '23505' }, 'join_group')
expect(resultA).toBe('errors.unique_violation.join_group') // 【確認内容】: te 真で context キーが引かれる

// ケースB: te が偽 → .generic フォールバック
teMock.mockReturnValue(false) // 【状態復元】: context キー不在を偽に制御
const resultB = useErrorMessage().errorToMessage({ code: '23505' }, 'generic')
expect(resultB).toBe('errors.unique_violation.generic') // 【確認内容】: te 偽で .generic にフォールバック
```

### TC4 実装コメント例（3 ファイル共通方針）

```typescript
// 【テスト目的】: ラッパが errorToMessage の戻りを state に載せ、clear でリセットすることを確認
// 🔵 error-handling.md §6.4 + interfaces.ts §4

// 【テストデータ準備】: useErrorMessage を mock し errorToMessage が固定文言を返すよう差し替え
// useFormErrors の例
const { fieldErrors, setFieldError, clear } = useFormErrors()
setFieldError('name', {}) // When: state へ反映
expect(fieldErrors.value.name).toBe('mocked_message') // 【確認内容】: 文言が fieldErrors に載る
clear('name') // When: 単一キー削除
expect(fieldErrors.value.name).toBeUndefined() // 【確認内容】: clear で当該キーが消える
```

### セットアップ・クリーンアップ指針

```typescript
beforeEach(() => {
  // 【テスト前準備】: vi.clearAllMocks() で captureException スパイ等の呼び出し履歴をリセット
  // 【環境初期化】: te のデフォルト返り値・errorToMessage mock 文言を既定状態に戻す
  vi.clearAllMocks()
})
```

---

## 6. 要件定義との対応関係

- **参照した機能概要**: requirements.md §1（4 composable の責務、5 層モデルの層3変換・層4提示）
- **参照した入力・出力仕様**: requirements.md §2.1〜§2.4（`ErrorMessageApi` / `FormErrorsApi` / `NoticeErrorsApi` / `ToastErrorsApi` の入出力）、§2.5 データフロー
- **参照した制約条件**: requirements.md §3（NFR-204 文言リテラル禁止 / NFR-304 Sentry / i18n キー構造 / Composition API・strict mode）
- **参照した使用例**: requirements.md §4.1（基本パターン）/ §4.2（PG context 出し分け）/ §4.3（fallthrough・context 欠落フォールバック・pgContext 省略・clear 二系統）
- **参照した受け入れ基準**: TASK-0007.md §単体テスト要件 TC1〜TC4、§完了条件
- **参照した設計文書**: error-handling.md §5.1 / §5.3 / §5.4 / §6.4、interfaces.ts §4、ADR-012 D2/D4、error-codes.ts 実測（`isAppError` / `isPgError` / `APP_ERROR_CODES` / `PG_ERROR_CODES`）

---

## 7. 品質判定

```
✅ 高品質:
- テストケース分類: 正常系（TC1 / TC4×3）・異常系（TC2）・境界値（TC3）を網羅
- 期待値定義: 各テストケースの期待値・mock 挙動・アサート対象が明確
- 技術選択: TypeScript + Vitest + Vue Test Utils（vitest.config.ts 実測で確定）
- 実装可能性: error-handling.md §5.1/§6.4 に実装コードが確定済、mock 戦略も ADR-012 D4 で確定
- 信頼性レベル: 全 6 テストケース項目が 🔵（設計文書・実測 100% 裏付け、推測なし）
- 冗長性: 最小カバレッジ厳守（App 識別子 7 種・PG 4 種を代表 1 件ずつに集約、除外理由を明記）
```

**信頼性サマリー**: 全テストケース 🔵（青信号）。TASK-0007.md §単体テスト要件 TC1〜TC4、error-handling.md §5.1/§6.4、interfaces.ts §4、error-codes.ts 実測に直接裏付けられており推測項目なし。

| 区分 | 件数 | テストケース |
|------|------|--------------|
| 正常系 | 4 | TC1（App 識別子 1:1）、TC4-a（useFormErrors）、TC4-b（useNoticeErrors）、TC4-c（useToastErrors） |
| 異常系 | 1 | TC2（fallthrough + Sentry） |
| 境界値 | 1 | TC3（PG context te 真/偽の出し分け境界） |
| **合計** | **6** | 4 テストファイル（useErrorMessage に TC1/TC2/TC3 集約 + 3 ラッパ各 1） |

---

## 8. 次フェーズ（tdd-red）への引き継ぎ事項

- **テストファイル構成**: `useErrorMessage.test.ts` に TC1/TC2/TC3 を集約、`useFormErrors.test.ts` / `useNoticeErrors.test.ts` / `useToastErrors.test.ts` に TC4 を 1 件ずつ。計 4 ファイル。
- **mock セットアップの注意**:
  - `vi.mock('#imports')` で `useI18n` を返すよう factory を定義。`t` はキー透過（`(key) => key`）、`te` は `vi.fn()` で各 TC で `mockReturnValue` 切替。
  - `@sentry/nuxt` の `captureException` は `vi.fn()` スパイ。`vi.mock('@sentry/nuxt', ...)` で `captureException` を export する factory にする。
  - TC4 では `vi.mock('#imports')`（または対象 composable パス）で `useErrorMessage` を mock し `errorToMessage: () => 'mocked_message'` を返す。`useToast` は `{ add: vi.fn() }`。
  - `beforeEach` で `vi.clearAllMocks()` を呼び、TC2 の `captureException` 呼び出し回数・TC3 の `te` 返り値がテスト間で汚染されないようにする。
- **TC3 は 1 ファイル内 2 アサート**: `te` 真/偽の両側を `mockReturnValue` 切替で同一 `it` 内または 2 つの `it` で検証（最小カバレッジのため過度な分割はしない）。
- **`#imports` 解決**: Nuxt auto-import 経由のため、`useI18n` / `useToast` / `ref` / `useErrorMessage` が `#imports` から取得される前提。vitest 環境で `#imports` を mock するか、`@nuxt/test-utils` の環境を用いる（既存 group-name.test.ts は `~/schemas` 直接 import のため、composable 側は auto-import mock の追加設定が必要になる可能性あり → Red で実際に失敗させて確認）。
- **Red で確認すべき失敗**: 実装ファイル（`useErrorMessage.ts` 等 4 本）が未作成のため、import エラーまたは関数未定義で全テストが失敗することを確認する。
- **文言リテラル禁止の検証**: `t` キー透過 mock により「キーで `t` を呼んでいるか」を間接検証できる（直書き文言なら `t` を経由しないため検出可能）。
```
