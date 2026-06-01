# TASK-0008: useLogin（Auth）— TDDテストケース定義書

**機能名**: useLogin（Auth composable）
**タスクID**: TASK-0008
**要件名**: auth-onboarding
**フェーズ**: Phase 2 - ドメインロジック層
**作成日**: 2026-06-01
**実装ファイル**: `app/composables/useLogin.ts`
**テストファイル**: `tests/unit/composables/useLogin.test.ts`

---

## 信頼性レベル凡例

- 🔵 **青信号**: EARS要件定義書・設計文書を参考にしてほぼ推測していない
- 🟡 **黄信号**: EARS要件定義書・設計文書から妥当な推測
- 🔴 **赤信号**: EARS要件定義書・設計文書にない推測

---

## テスト方針（最小カバレッジ）

> memory `feedback_test_coverage` に従い **境界値＋branch coverage のみ**。冗長ケースは作らない。
> `useLogin` は副作用（OAuth リダイレクト / notice セット / navigateTo）を持つ薄い Write composable のため、
> 分岐は「`login` 成功経路」「`logout` 成功経路」「Auth エラー経路」の 3 つに集約される。
> これを TC1 / TC2 / TC3 で 1:1 にカバーする（要件定義書 §6 単体テスト要件・TASK-0008.md 単体テスト要件と一致）。

### mock 戦略（ADR-012 D4 / `tests/unit/composables/useNoticeErrors.test.ts` 踏襲）

- `vi.hoisted()` で mock 変数（`signInWithOAuthMock` / `signOutMock` / `navigateToMock` / `setNoticeMock` / 共有 `noticeRef`）を先に定義し TDZ エラーを回避する。
- `vi.mock('#imports')` で以下を差し替える:
  - `ref` → `importOriginal` 経由の **vue の実物 ref**（state は本物を使う）
  - `useSupabaseClient` → `{ auth: { signInWithOAuth: signInWithOAuthMock, signOut: signOutMock } }`
  - `navigateTo` → `navigateToMock`
  - `useNoticeErrors` → `{ notice: noticeRef, setNotice: setNoticeMock, clear: vi.fn() }`
- `beforeEach(() => vi.clearAllMocks())` でスパイをリセット。`noticeRef.value` も `null` に戻す。

---

## 1. 正常系テストケース（基本的な動作）

### TC1: login が provider:'google' で signInWithOAuth を呼ぶ

- **テスト名**: login が Google OAuth を `/confirm?redirect=` 付き redirectTo で開始する
  - **何をテストするか**: `login(redirect)` が `supabase.auth.signInWithOAuth` を `provider: 'google'` かつ `options.redirectTo` に `/confirm?redirect=` を含む引数で **1 回だけ** 呼ぶこと。
  - **期待される動作**: page から直叩きせず composable 経由で OAuth が開始され、A2（redirect クエリ運搬）のため目的地が `/confirm` の `redirect` クエリに載る。
- **入力値**: `login('/groups/new')`
  - **入力データの意味**: ログイン後の最終遷移先を持つ典型ケース（dataflow.md §2 のシーケンスで `/groups/new` 等の保護ページに着地するパターンを代表）。`encodeURIComponent('/groups/new')` で `%2Fgroups%2Fnew` にエンコードされる前提。
- **期待される結果**:
  - `signInWithOAuthMock` が **1 回** 呼ばれる。
  - 呼び出し引数が `provider: 'google'` を持つ。
  - 呼び出し引数の `options.redirectTo` が文字列 `'/confirm?redirect='` を **含む**（部分一致）。
  - `setNoticeMock` は呼ばれない（成功経路のため）。
  - **期待結果の理由**: REQ-001（`signInWithOAuth({ provider: 'google' })`）と A2（redirect クエリ運搬）の双方を満たすため。redirectTo の絶対/相対 URL 扱いは実装時確定（要件 §3 🟡）なので **部分一致**で検証し過剰結合を避ける。
- **テストの目的**: OAuth 開始の provider 指定と redirect クエリ運搬の検証。
  - **確認ポイント**: `toHaveBeenCalledTimes(1)`、`provider: 'google'`、`options.redirectTo` の `/confirm?redirect=` 部分一致。完全一致（`%2Fgroups%2Fnew` まで）は実装の URL 組み立て仕様に過度に依存するため避ける。
- 🔵 信頼性レベル: REQ-001 / A2 + dataflow.md §2 + TASK-0008.md TC1 / 要件定義書 §6 TC1 と一致

### TC2: logout が signOut → navigateTo('/login') する

- **テスト名**: logout が signOut 成功後に `/login` へ遷移する（呼び出し順序保証）
  - **何をテストするか**: `logout()` が `supabase.auth.signOut` を呼び、**その後に** `navigateTo('/login')` を呼ぶこと（順序）。
  - **期待される動作**: REQ-008（ログアウト → `signOut()` → `/login` 遷移）の成功経路。
- **入力値**: `logout()`（引数なし）
  - **入力データの意味**: ログアウトは入力を取らない。ヘッダーのログアウトボタン（TASK-0015）からの典型呼び出しを代表する。
- **期待される結果**:
  - `signOutMock` が **1 回** 呼ばれる。
  - `navigateToMock` が `'/login'` を引数に呼ばれる。
  - `signOut` → `navigateTo` の **呼び出し順序**が保たれる（`invocationCallOrder` で検証）。
  - `setNoticeMock` は呼ばれない（成功経路）。
  - **期待結果の理由**: REQ-008 がログアウト後の `/login` 遷移を要求し、`signOut` 完了後でなければ遷移してはならない（セッション破棄前に遷移すると保護ページが見えるリスク）ため順序が load-bearing。
- **テストの目的**: ログアウト成功経路の API 呼び出しと遷移順序の検証。
  - **確認ポイント**: `signOut` と `navigateTo('/login')` の両方が呼ばれること、かつ `signOut` が先に呼ばれること（mock の `invocationCallOrder` 比較）。
- 🔵 信頼性レベル: REQ-008 + interfaces.ts UseLoginReturn + TASK-0008.md TC2 / 要件定義書 §6 TC2 と一致

---

## 2. 異常系テストケース（エラーハンドリング）

### TC3: Auth エラー時に notice をセットし navigateTo を呼ばない

- **テスト名**: login の Auth エラー時に setNotice され、リダイレクトは発生しない（EDGE-002）
  - **エラーケースの概要**: `signInWithOAuth` が `{ error: <Auth エラー> }` を返す（OAuth キャンセル / ネットワークエラー / セッション中断）。
  - **エラー処理の重要性**: Auth エラーは toast でも field error でもなく `<UAlert>`（notice チャネル・永続表示）へ流す必要がある（EDGE-002 / dataflow.md §6 / error-handling.md §6.4）。表示漏れはユーザがログイン失敗に気づけない品質問題に直結する。
- **入力値**: `signInWithOAuthMock` を `{ error: { message: 'oauth_cancelled' } }` を返すよう設定し、`login()`（引数なし）を呼ぶ。
  - **不正な理由**: `signInWithOAuth` の戻りに `error` が含まれる状態は OAuth フローの異常終了を表す。
  - **実際の発生シナリオ**: ユーザが Google 認可画面でキャンセル、ネットワーク断、Supabase 側のセッション確立失敗など。
- **期待される結果**:
  - `setNoticeMock` が `{ message: 'oauth_cancelled' }`（= 返却された error）を引数に **1 回** 呼ばれる。
  - `notice.value`（= `noticeRef.value`）が **非 null** になる（テスト内で `setNotice` 実装の代替として `noticeRef.value` を更新するか、`setNotice` が呼ばれた事実で代替検証）。
  - `navigateToMock` は **呼ばれない**（login はそもそも navigateTo を呼ばない経路だが、エラー時にリダイレクト副作用が発生しないことを明示確認）。
  - **エラーメッセージの内容**: 文言変換は `useNoticeErrors` 内部の `useErrorMessage` 責務のため、本 composable は error オブジェクトをそのまま `setNotice` へ渡すことのみ検証する（責務分離・note.md §3）。
  - **システムの安全性**: エラー時にリダイレクトせず notice を提示するため、ユーザは現在の `/login` に留まり再試行できる。
- **テストの目的**: Auth エラー経路（EDGE-002）のエラーチャネル配線検証。
  - **品質保証の観点**: エラーが silent に握り潰されず、かつ成功時の副作用（リダイレクト）が誤って発火しないことを保証する。
- 🔵 信頼性レベル: EDGE-002 + interfaces.ts UseLoginReturn (notice) + TASK-0008.md TC3 / 要件定義書 §6 TC3 と一致

---

## 3. 境界値テストケース（最小値、最大値、null等）

> **本タスクでは独立した境界値テストを追加しない（最小カバレッジ方針）。**
> 理由: `useLogin` の入力は `login` の任意引数 `redirect?: string` のみで、境界は「未指定（`undefined`）」のケースに尽きる。
> これは TC1 の `redirectTo` 部分一致（`/confirm?redirect=`）と TC3 の `login()`（引数なし呼び出し）で
> 既にカバーされており、別ケースを追加すると冗長になる（memory `feedback_test_coverage` の冗長禁止に抵触）。
> `redirect` 省略時のデフォルト `'/'`（→ `%2F`）は要件 §4.3 で 🟡 の妥当推測であり、
> 完全一致検証は実装の URL 組み立て仕様に過結合するため意図的に検証対象外とする。

| 境界条件 | カバー状況 | カバー元 |
|---|---|---|
| `redirect` 指定あり | ✅ | TC1（`'/groups/new'`） |
| `redirect` 未指定（`undefined`） | ✅ | TC3（`login()` 引数なし） |
| `redirectTo` の `/confirm?redirect=` 前置 | ✅ | TC1（部分一致） |
| Auth `error` あり / なしの分岐 | ✅ | TC3（あり） / TC1・TC2（なし） |

---

## 4. 開発言語・フレームワーク

- **プログラミング言語**: TypeScript（strict mode）
  - **言語選択の理由**: プロジェクト全体が Nuxt 4 + TypeScript strict（CLAUDE.md / note.md §1）。composable の戻り値型 `UseLoginReturn` を型安全に検証できる。
  - **テストに適した機能**: 型推論により mock の戻り値型ミスマッチをコンパイル時に検出。`Ref<boolean>` / `Ref<string | null>` の契約を静的に保証。
- **テストフレームワーク**: Vitest + Vue Test Utils
  - **フレームワーク選択の理由**: プロジェクト標準（note.md §1 テスト環境 / vitest.config.ts）。`vi.hoisted` / `vi.mock('#imports')` による Nuxt auto-import の差し替えが既存 `useNoticeErrors.test.ts` で確立済み。
  - **テスト実行環境**: `tests/unit/**/*.test.ts` を対象（`.integration.test.ts` は除外）。RDB 不要・独立実行のため `fileParallelism` 制約なし（note.md §1）。
- 🔵 信頼性レベル: note.md §1 技術スタック / §5 テスト関連情報 / vitest.config.ts と一致

---

## 5. テストケース実装時の日本語コメント指針

### ファイル冒頭（mock セットアップ）

```typescript
/**
 * useLogin 単体テスト (TC1 / TC2 / TC3)
 *
 * mock 戦略 (ADR-012 D4 / useNoticeErrors.test.ts 踏襲):
 *   - vi.hoisted() で signInWithOAuth / signOut / navigateTo / setNotice mock を先に定義 (TDZ 回避)
 *   - vi.mock('#imports') で useSupabaseClient / navigateTo / useNoticeErrors を差し替え、ref は vue 実物
 *   - beforeEach で vi.clearAllMocks() + noticeRef.value を null に戻す
 *
 * 🔵 REQ-001 / REQ-008 / EDGE-002 + dataflow.md §2 + interfaces.ts UseLoginReturn
 */

// 【vi.hoisted】: vi.mock ファクトリより先に評価される mock 変数ブロック (TDZ 回避)
const { signInWithOAuthMock, signOutMock, navigateToMock, setNoticeMock, noticeRef } = vi.hoisted(() => {
  // 注: ref はここでは使えない (hoisted は import 前評価) ため noticeRef は #imports mock 内で生成し共有する設計でも可
  return {
    signInWithOAuthMock: vi.fn(),
    signOutMock: vi.fn(),
    navigateToMock: vi.fn(),
    setNoticeMock: vi.fn(),
    noticeRef: { value: null as string | null } // ref 互換の最小スタブ (value のみ参照するため)
  }
})
```

### TC1（正常系: login OAuth 開始）

```typescript
it('TC1: login が provider:google で signInWithOAuth を /confirm?redirect= 付きで呼ぶ', async () => {
  // 【テスト目的】: login(redirect) が Google OAuth を redirect クエリ運搬付きで 1 回開始することを確認
  // 【テスト内容】: signInWithOAuth の呼び出し回数・provider・redirectTo 部分一致を検証
  // 【期待される動作】: provider:'google' かつ options.redirectTo に '/confirm?redirect=' を含む
  // 🔵 REQ-001 / A2 + dataflow.md §2

  // 【テストデータ準備】: 成功経路のため signInWithOAuth は { error: null } を返す
  // 【初期条件設定】: setNotice は呼ばれないはず
  signInWithOAuthMock.mockResolvedValue({ error: null })

  const { login } = useLogin()

  // 【実際の処理実行】: 最終遷移先 '/groups/new' を渡して login を実行
  await login('/groups/new')

  // 【結果検証】: signInWithOAuth が 1 回・正しい引数で呼ばれたか
  expect(signInWithOAuthMock).toHaveBeenCalledTimes(1) // 【検証項目】: 1 回だけ呼ばれる 🔵
  const arg = signInWithOAuthMock.mock.calls[0][0]
  expect(arg.provider).toBe('google') // 【検証項目】: provider が google 🔵
  expect(arg.options.redirectTo).toContain('/confirm?redirect=') // 【検証項目】: redirect クエリ運搬 (部分一致) 🔵
  expect(setNoticeMock).not.toHaveBeenCalled() // 【検証項目】: 成功経路では notice をセットしない 🔵
})
```

### TC2（正常系: logout → /login 遷移順序）

```typescript
it('TC2: logout が signOut の後に navigateTo(/login) する', async () => {
  // 【テスト目的】: logout が signOut 成功後に /login へ遷移する順序を確認
  // 【テスト内容】: signOut → navigateTo('/login') の呼び出しと順序を検証
  // 【期待される動作】: signOut が先、navigateTo('/login') が後
  // 🔵 REQ-008

  // 【テストデータ準備】: 成功経路のため signOut は { error: null } を返す
  signOutMock.mockResolvedValue({ error: null })

  const { logout } = useLogin()

  // 【実際の処理実行】: ログアウト実行
  await logout()

  // 【結果検証】: signOut と navigateTo の呼び出しと順序
  expect(signOutMock).toHaveBeenCalledTimes(1) // 【検証項目】: signOut が呼ばれる 🔵
  expect(navigateToMock).toHaveBeenCalledWith('/login') // 【検証項目】: /login へ遷移 🔵
  // 【期待値確認】: signOut → navigateTo の順序保証 (セッション破棄前の遷移を防ぐ)
  expect(signOutMock.mock.invocationCallOrder[0])
    .toBeLessThan(navigateToMock.mock.invocationCallOrder[0]) // 【検証項目】: 呼び出し順序 🔵
})
```

### TC3（異常系: Auth エラー → notice セット / 遷移なし）

```typescript
it('TC3: login の Auth エラー時に setNotice され navigateTo は呼ばれない', async () => {
  // 【テスト目的】: Auth エラー時に error を setNotice へ渡し、リダイレクト副作用を起こさないことを確認
  // 【テスト内容】: signInWithOAuth が { error } を返すケースで setNotice 呼び出しと navigateTo 未呼び出しを検証
  // 【期待される動作】: setNotice(error) が呼ばれ、navigateTo は呼ばれない
  // 🔵 EDGE-002

  // 【テストデータ準備】: OAuth キャンセル等を表す error を返す
  const authError = { message: 'oauth_cancelled' }
  signInWithOAuthMock.mockResolvedValue({ error: authError })

  const { login } = useLogin()

  // 【実際の処理実行】: 引数なし login (デフォルト redirect 経路も兼ねる)
  await login()

  // 【結果検証】: error がそのまま setNotice へ渡るか / リダイレクトしないか
  expect(setNoticeMock).toHaveBeenCalledWith(authError) // 【検証項目】: error をそのまま setNotice へ (責務分離) 🔵
  expect(navigateToMock).not.toHaveBeenCalled() // 【検証項目】: エラー時にリダイレクトしない 🔵
})
```

### セットアップ・クリーンアップ

```typescript
beforeEach(() => {
  // 【テスト前準備】: 各テスト前にスパイ呼び出し履歴をクリアし相互干渉を防ぐ
  // 【環境初期化】: noticeRef も初期 null に戻し、TC 間で notice 状態が漏れないようにする
  vi.clearAllMocks()
  noticeRef.value = null
})
```

---

## 6. 要件定義との対応関係

- **参照した機能概要**: `useLogin-requirements.md` §1（Google OAuth ログイン/ログアウトを内包する Write composable）
- **参照した入力・出力仕様**: `useLogin-requirements.md` §2（`login(redirect?)` / `logout()` / `pending` / `notice`、§2.1〜§2.4、入出力関係表）
- **参照した制約条件**: `useLogin-requirements.md` §3（REQ-406 直叩き禁止、EDGE-002 notice チャネル、redirectTo URL 扱い 🟡）
- **参照した使用例**: `useLogin-requirements.md` §4（§4.1 ログイン / §4.2 ログアウト / §4.3 デフォルト / §4.4 Auth エラー）
- **参照した単体テスト要件**: `useLogin-requirements.md` §6（TC1 / TC2 / TC3）、`TASK-0008.md` 単体テスト要件（TC1〜TC3）
- **参照した mock パターン**: `tests/unit/composables/useNoticeErrors.test.ts`（`vi.hoisted` + `vi.mock('#imports')` + `beforeEach(vi.clearAllMocks)`）

---

## テストケース一覧サマリー

| 区分 | テスト名 | 件数 | 信頼性 | 対応要件 |
|---|---|---|---|---|
| 正常系 | TC1: login が OAuth を `/confirm?redirect=` 付きで開始 | 1 | 🔵 | REQ-001 / A2 |
| 正常系 | TC2: logout が signOut → navigateTo('/login') 順序 | 1 | 🔵 | REQ-008 |
| 異常系 | TC3: Auth エラー時に setNotice / navigateTo なし | 1 | 🔵 | EDGE-002 |
| 境界値 | （独立追加なし: TC1/TC3 でカバー） | 0 | — | A2（redirect 省略） |
| **合計** | | **3** | 🔵 3(100%) | |

---

## 品質判定

✅ **高品質**

- **テストケース分類**: 正常系 2（TC1/TC2）・異常系 1（TC3）。境界値は最小カバレッジ方針により正常系/異常系へ統合（冗長禁止）。`login` 成功 / `logout` 成功 / Auth エラー の全 branch を網羅。
- **期待値定義**: 各 TC の期待値が明確（呼び出し回数・引数・部分一致・順序・未呼び出し）。
- **技術選択**: TypeScript strict + Vitest + Vue Test Utils で確定。mock 戦略は既存 `useNoticeErrors.test.ts` を踏襲済み。
- **実装可能性**: 確実（TASK-0008.md に実装サンプルあり、依存 TASK-0007 完了、mock パターン確立済み）。
- **信頼性レベル分布**: 🔵 3 / 🟡 0 / 🔴 0（コア 3 ケースは全 🔵）。

**次フェーズ（tdd-red）への注意点**:
1. **mock の `noticeRef`**: `setNotice` は mock 化されており実際の state 更新は行われない。`notice.value` 非 null の直接検証ではなく **`setNoticeMock` が error 引数で呼ばれた事実** で代替検証する（責務分離。文言変換は `useNoticeErrors` 担当でスコープ外）。
2. **redirectTo は部分一致**: `/confirm?redirect=` の `toContain` で検証し、完全一致（`%2Fgroups%2Fnew`）は実装の URL 組み立て・絶対/相対 URL 仕様（要件 §3 🟡）に過結合するため避ける。
3. **呼び出し順序（TC2）**: `mock.invocationCallOrder` で `signOut` → `navigateTo` の順序を検証。`toHaveBeenCalledWith` だけでは順序を保証できない点に注意。
4. **`#imports` mock の ref**: `importOriginal` で vue 実物 ref を取得する。`useNoticeErrors` を mock するため `noticeRef` は hoisted スタブ（`{ value }`）でも可だが、`pending` を将来検証する場合は実 ref が必要になる点を留意。
5. **`pending` は 3 ケースで未検証**: 最小カバレッジのため `pending` の true/false 遷移は本 3 ケースの対象外（要件 §6 / TASK-0008.md と一致）。green 実装では try/finally 相当で確実に false へ戻す実装を行うが、テスト追加は冗長判断で見送る。
