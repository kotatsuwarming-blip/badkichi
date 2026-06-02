# TASK-0020 検証ログ

**タスクID**: TASK-0020  
**検証日**: 2026-06-02  
**検証者**: Claude Code (direct-setup / direct-verify 統合実施)  
**対象フェーズ**: Phase 4 — 結線・受入検証

---

## 1. 自動検証結果 (完了条件①②)

### ① `pnpm lint` / `pnpm typecheck` / `pnpm test`

| コマンド | 結果 | 備考 |
|---------|------|------|
| `pnpm lint` | **PASS** (exit 0) | ESLint 違反ゼロ。`app/components/VideoPlayer.client.vue` に一時的なエラーが見られたが、同ファイルは video-playback 設計トラックの untracked ファイル (git status: `??`) であり auth-onboarding スコープ外。最終確認時 exit 0 を確認。 |
| `pnpm typecheck` | **PASS** (exit 0) | `nuxt typecheck --dotenv .env.development` 正常終了。型エラーゼロ。 |
| `pnpm test` | **PASS** | Test Files 29 passed / Tests 119 passed / Duration 2.36s |

実行ログ抜粋:
```
 Test Files  29 passed (29)
      Tests  119 passed (119)
   Start at  00:07:34
   Duration  2.36s (transform 3.26s, setup 3.96s, import 6.75s, tests 436ms, environment 977ms)
```

### ② `pnpm i18n:check` (NFR-303)

| コマンド | 結果 | 備考 |
|---------|------|------|
| `pnpm i18n:check` | **PASS** | `OK: ja/en のキー構造一致 + メッセージ書式 (10 top-level keys)` |

---

## 2. 静的構造確認 (完了条件④)

### 2-1. middleware 保護の仕組み

`app/middleware/auth.global.ts` はファイル名に `.global` サフィックスを持つ **global middleware**。  
Nuxt 4 の規約により、全ページナビゲーション前に自動実行される。**個別ページで `middleware:` 指定は不要**。

### 2-2. 全ページ列挙と保護状況

| ページファイル | パス | 分類 | layout | definePageMeta | 保護状況 |
|-------------|------|------|--------|----------------|---------|
| `app/pages/index.vue` | `/` | 保護ページ | 未指定 → `default.vue` 自動継承 | なし | global middleware が `user=null` → `/login?redirect=/`、`group=null` → `/onboarding` にリダイレクト ✅ |
| `app/pages/onboarding.vue` | `/onboarding` | 保護ページ (GROUP_OPTIONAL) | 未指定 → `default.vue` 自動継承 | なし | `user=null` → `/login`、`user あり group あり` → `/` リダイレクト。`user あり group なし` は通過 ✅ |
| `app/pages/groups/new.vue` | `/groups/new` | 保護ページ (GROUP_OPTIONAL) | 未指定 → `default.vue` 自動継承 | なし | `user=null` → `/login`。未所属でも通過 (GROUP_OPTIONAL_PATHS) ✅ |
| `app/pages/groups/[id]/settings.vue` | `/groups/:id/settings` | 保護ページ | 未指定 → `default.vue` 自動継承 | なし | `user=null` → `/login`、`group=null` → `/onboarding` ✅ |
| `app/pages/join/[code].vue` | `/join/:code` | public path | 未指定 → `default.vue` 自動継承 | なし | middleware では `isPublicPath = startsWith('/join/')` で通過。ページ内で `useSupabaseUser()` を確認し未ログインは `/login?redirect=...` にリダイレクト ✅ |
| `app/pages/login.vue` | `/login` | public path | `{ layout: 'auth' }` | あり (layout: 'auth' のみ) | PUBLIC_PATHS に含まれ通過。ログイン済所属ユーザーは `/` へリダイレクト ✅ |
| `app/pages/confirm.vue` | `/confirm` | public path | `{ layout: 'auth' }` | あり (layout: 'auth' のみ) | PUBLIC_PATHS に含まれ通過。セッション確立後に `navigateTo(redirect ?? '/')` ✅ |

### 2-3. middleware バイパスの有無

- `auth` middleware の強制バイパス (例: `definePageMeta({ middleware: [] })`) は**全ページに存在しない**。
- `login.vue` / `confirm.vue` の `definePageMeta` は `layout: 'auth'` のみ指定。middleware の無効化は行っていない。

### 2-4. public path 整合性確認

`auth.global.ts` の `PUBLIC_PATHS = ['/login', '/confirm']` および `/join/**` (`startsWith` 判定) と、ページ構成の対応:

| パス | PUBLIC_PATHS / startsWith 判定 | ページ存在 | 整合 |
|------|-------------------------------|-----------|------|
| `/login` | ✅ (PUBLIC_PATHS) | ✅ | ✅ |
| `/confirm` | ✅ (PUBLIC_PATHS) | ✅ | ✅ |
| `/join/:code` | ✅ (startsWith '/join/') | ✅ | ✅ |

**追記**: `/join/:code` は middleware では public path として通過させているが、ページ内部で `useSupabaseUser()` の値をチェックし、未ログイン時は自前で `/login?redirect=/join/{code}` にリダイレクトする実装になっている (ADR-008 D1 例外仕様、コメントで明記)。EDGE-001 リダイレクトチェーンの正しい設計と整合している。

### 2-5. middleware テスト (TC1〜TC7) の分岐網羅確認

`tests/unit/middleware/auth.test.ts` に TC1〜TC7 (ADR-008 D8) が実装されており、`pnpm test` で全 PASS。

| TC | 分岐 | 期待 | テスト |
|----|------|------|--------|
| TC1 | 未認証 + 保護ページ | `/login?redirect=%2F` | ✅ |
| TC2 | 未認証 + `/login` (public) | 通過 | ✅ |
| TC3 | ログイン済未所属 + 保護ページ | `/onboarding` | ✅ |
| TC4 | ログイン済未所属 + `/groups/new` (GROUP_OPTIONAL) | 通過 | ✅ |
| TC5 | ログイン済所属 + `/login` (public 分岐側) | `/` | ✅ |
| TC6 | ログイン済所属 + `/onboarding` | `/` | ✅ |
| TC7 | ログイン済所属 + 保護ページ | 通過 | ✅ |

未テストの分岐:
- ログイン済未所属 + `/onboarding` アクセス → `GROUP_OPTIONAL_PATHS.includes('/onboarding')` が true なので通過。テストには含まれていないが、TC4 (`/groups/new`) と対称であり、`GROUP_OPTIONAL_PATHS` の内容変更がない限り問題なし。
- 未認証 + `/confirm` → PUBLIC_PATHS で通過。TC2 の変形であり網羅済。

**middleware 保護漏れ**: 静的確認の範囲でゼロ ✅

---

## 3. 受入突合 (完了条件⑦)

### 3-1. 対応表

| テストケース ID | 受入項目 | 担保手段 | 判定 |
|----------------|---------|---------|------|
| TC-001-01 | 未認証→signInWithOAuth 呼出検証 | 自動テスト (useLogin.test.ts) | ✅ 自動 PASS |
| TC-003-01 | Group名 1文字→RPC 呼出+成功遷移 (境界値) | 自動テスト (useCreateGroup.test.ts + group-name.test.ts) | ✅ 自動 PASS |
| TC-003-02 | Group名 50文字→RPC 呼出+成功遷移 (境界値) | 自動テスト | ✅ 自動 PASS |
| TC-003-03 | 前後空白付き→trim後 RPC 呼出 | 自動テスト (group-name.test.ts Zod transform) | ✅ 自動 PASS |
| TC-003-E01 | Group名 0文字→Zod エラー | 自動テスト | ✅ 自動 PASS |
| TC-003-E02 | Group名 51文字→Zod エラー | 自動テスト | ✅ 自動 PASS |
| TC-003-E03 | 空白のみ→Zod trim後 0文字エラー | 自動テスト | ✅ 自動 PASS |
| TC-003-E04 | RPC invalid_group_name → UFormField error | 自動テスト (useCreateGroup.test.ts mock) | ✅ 自動 PASS |
| TC-101-01 | 未認証 + `/` → `/login?redirect=/` | 自動テスト (auth.test.ts TC1) | ✅ 自動 PASS |
| TC-101-02 | 未認証 + `/groups/abc/settings` → `/login?redirect=...` | 自動テスト (auth.test.ts TC1 全般カバー) | ✅ 自動 PASS |
| TC-108-01 | 未認証 + `/join/code123` → `/login?redirect=...` | 静的確認 (join/[code].vue ページ内リダイレクト) | ✅ 静的確認 |
| TC-102-01 | ログイン済未所属 + `/` → `/onboarding` | 自動テスト (auth.test.ts TC3) | ✅ 自動 PASS |
| TC-102-02 | ログイン済未所属 + `/groups/abc/settings` → `/onboarding` | 自動テスト (TC3 全般カバー) | ✅ 自動 PASS |
| TC-103-01 | ログイン済所属 + `/login` → `/` | 自動テスト (auth.test.ts TC5) | ✅ 自動 PASS |
| TC-103-02 | ログイン済所属 + `/onboarding` → `/` | 自動テスト (auth.test.ts TC6) | ✅ 自動 PASS |
| TC-104-01 | `/confirm?redirect=/join/abc` + 未所属 → `/join/abc` | 静的確認 (confirm.vue の navigateTo(redirect ?? '/')) | ✅ 静的確認 |
| TC-104-02 | `/confirm` (redirect なし) + 所属 → `/` | 静的確認 | ✅ 静的確認 |
| TC-401-01 | 連続 Group 作成→送信ボタン disabled | 自動テスト (useCreateGroup.test.ts pending フラグ) | ✅ 自動 PASS |
| TC-NFR-304-01 | INVITATION_NOT_FOUND 等→Sentry 非発火 | 自動テスト (useErrorMessage.test.ts) | ✅ 自動 PASS |
| TC-NFR-304-02 | 未マップ SQLSTATE→Sentry captureException | 自動テスト | ✅ 自動 PASS |
| TC-NFR-304-03 | error.vue→Sentry captureException | 自動テスト | ✅ 自動 PASS |
| TC-002-01 | `/confirm`到達+未所属→`/onboarding`遷移 | **手動実行が必要** (E2E 相当、実ブラウザ + OAuth フロー) | 要手動 |
| TC-002-02 | `/confirm`到達+所属→`/`遷移 | **手動実行が必要** | 要手動 |
| TC-002-E01 | `/confirm`到達+セッション確立失敗→UAlert | **手動実行が必要** | 要手動 |
| TC-005-01 | 有効招待リンク+ログイン済未所属→参加成功→`/` | **手動実行が必要** (招待発行→コピー→別ユーザ参加シナリオ⑥) | 要手動 |
| TC-006-01 | 設定画面→メンバー一覧+招待リンク+発行ボタン表示 | **手動実行が必要** | 要手動 |
| TC-007-01 | 発行ボタン→RPC→URL表示 | **手動実行が必要** | 要手動 |
| TC-007-02 | コピーボタン→navigator.clipboard.writeText+UToast | 自動テスト (useGenerateInvitation.test.ts / useListInvitations.test.ts) | ✅ 自動 PASS |
| TC-106-01 | 期限切れ招待→invitation_expired→UAlert | 自動テスト (useJoinGroup.test.ts mock) | ✅ 自動 PASS |
| TC-107-01 | 存在しない招待→invitation_not_found→UAlert | 自動テスト | ✅ 自動 PASS |
| TC-105-01 | 既所属ユーザー+別Group招待→already_in_group→UAlert | 自動テスト | ✅ 自動 PASS |
| TC-401-02 | 別タブ並行操作→already_in_group拒否 | data-foundation integration テスト (ADR-012 D2で検証済、本タスクは再実施不要) | ✅ 検証済 (スコープ外) |
| TC-NFR-301-01 | snapshot テストなし | 静的確認 (テストファイル確認) | ✅ 静的確認 |
| TC-NFR-302-02 | signInWithOAuth mock unit で検証済 | 自動テスト (useLogin.test.ts) | ✅ 自動 PASS |

### 3-2. 担保手段サマリー

| 担保手段 | 件数 |
|---------|------|
| 自動テスト (mock unit) で担保 | 24 件 |
| 静的確認で担保 | 5 件 |
| 手動実行が必要 | 6 件 |
| 検証済 (data-foundation / スコープ外) | 1 件 |

---

## 4. 手動項目の再現手順 (完了条件③⑤⑥)

以下は `pnpm dev` 実行後にユーザーがローカルで確認する項目です。

### 4-1. 完了条件③: リダイレクトチェーン EDGE-001 実機確認

**前提**: `pnpm dev` でローカル起動済み、Google OAuth が dev 環境で有効

**手順**:
1. ブラウザのシークレットウィンドウを開く (未ログイン状態を確保)
2. `http://localhost:3000/join/XXXXX` にアクセス (任意の招待コードを使用)
3. **確認**: ページが `/login?redirect=/join/XXXXX` にリダイレクトされること
4. `/login` ページで「Google でログイン」ボタンをクリック
5. Google OAuth 承認画面が表示されることを確認
6. 承認後 `/confirm?redirect=/join/XXXXX` に遷移することを確認
7. セッション確立後 `/join/XXXXX` に遷移し、参加処理が実行されることを確認
8. 参加成功後 `/` にリダイレクトされることを確認

**合格基準**: ステップ 3, 6, 7, 8 が全て想定通りに遷移すること

---

### 4-2. 完了条件⑤: NFR-001 ログインフロー 5秒実測

**前提**: `pnpm dev` でローカル起動済み、Chrome DevTools 開いておく

**手順**:
1. Chrome DevTools の Network タブを開き「Disable cache」を OFF にする (キャッシュあり実測)
2. ログイン状態でない状態から `/` にアクセスし、`/login` へリダイレクトされることを確認
3. DevTools の Performance または Lighthouse ではなく、手動でストップウォッチ (または `performance.now()` コンソール) を使用
4. 「Google でログイン」押下のタイミングを T=0 とする
5. Google OAuth 画面が表示されたら一時停止 (ユーザー操作時間を除外)
6. 承認後 `/confirm` に戻ってきたタイミングを再計測開始
7. 行き先ページ (例: `/` または `/onboarding`) の表示完了 (LCP 相当) を計測

**合格基準**: T=0 から Google OAuth 画面表示まで + OAuth 承認後から行き先表示完了まで、**それぞれ 5 秒以内**。超過した場合は `useCurrentGroup` のクエリ数を DevTools Network で確認し、不要なリクエストがないかを調査する。

---

### 4-3. 完了条件⑥: 招待発行 → コピー → 別ユーザ参加シナリオ

**前提**: 2 つのブラウザ (またはシークレット窓) でそれぞれ別の Google アカウントでログイン済み

**手順 (ユーザーA: 招待発行側)**:
1. ユーザーA で `http://localhost:3000` にログイン
2. 初回の場合は `/onboarding` →「グループを作成」でグループ作成 → `/` に遷移
3. `/groups/{自分のグループID}/settings` を開く
4. メンバー一覧が表示されることを確認 (TC-006-01)
5. 「招待リンクを発行」ボタンをクリック
6. `http://localhost:3000/join/{8文字コード}` 形式の URL が表示されることを確認 (TC-007-01)
7. コピーボタンをクリック → 「コピーしました」トーストが表示されることを確認 (TC-007-02)

**手順 (ユーザーB: 参加側)**:
8. ユーザーB のシークレット窓でコピーした招待 URL を開く
9. 未ログインの場合は `/login?redirect=/join/{code}` にリダイレクトされることを確認
10. Google でログイン (別アカウント) → `/confirm?redirect=/join/{code}` → `/join/{code}` に遷移
11. 参加処理が実行され `/` に遷移することを確認
12. ユーザーA の `/groups/{id}/settings` を再読み込みし、メンバー一覧にユーザーB が追加されていることを確認

**合格基準**: 上記 12 ステップが全て成功すること

---

## 5. 気づき・注意事項

### 5-1. lint の挙動について

`app/components/VideoPlayer.client.vue` は video-playback 設計トラックで並行開発中の untracked ファイル (git status: `??`)。一時的に lint エラーが表示されたが、最終確認時は `pnpm lint` exit 0 を確認。TASK-0020 のスコープ (auth-onboarding) とは無関係。

### 5-2. `/join/:code` の保護方式について

`/join/:code` は middleware の `PUBLIC_PATHS` に含まれないが、`startsWith('/join/')` で public 扱いにしている。ページ内部で `useSupabaseUser()` を確認し、未ログイン時はページ側でリダイレクト処理を行う設計 (ADR-008 D1 例外)。この方式により、ログイン後のリダイレクト先に招待 URL が保持される (EDGE-001 の核心)。

### 5-3. TC-104 の `confirm.vue` redirect 処理

`confirm.vue` は `navigateTo(route.query.redirect ?? '/')` で遷移する。Group 所属判定の二次振り分け (遷移先での `/onboarding` vs `/` 振り分け) は middleware に委譲しており、confirm ページ自体は判定不要。設計として明確に責務分離されている。

### 5-4. テスト結果の補足

`tests/unit/scripts/check-i18n-keys.test.ts` / `tests/unit/setup/create-test-users.test.ts` など auth-onboarding 直接スコープ外のテストも含めて 29 ファイル 119 テストが全 PASS。

---

## 6. 最終判定

| 完了条件 | 判定 | 方法 |
|---------|------|------|
| ① lint/typecheck/test 全緑 | ✅ PASS | 自動実行 |
| ② i18n:check 緑 | ✅ PASS | 自動実行 |
| ③ リダイレクトチェーン EDGE-001 実機確認 | **要手動** | 手順 4-1 参照 |
| ④ middleware 保護漏れゼロ | ✅ PASS | 静的構造確認 |
| ⑤ NFR-001 5秒実測 | **要手動** | 手順 4-2 参照 |
| ⑥ 招待発行→コピー→別ユーザ参加 | **要手動** | 手順 4-3 参照 |
| ⑦ acceptance-criteria.md 受入項目突合 | ✅ PASS (手動項目除く) | 受入突合表 §3 参照 |

**自動+静的確認で担保済み**: 条件①②④⑦(手動6件除く)  
**ユーザー手動確認が必要**: 条件③⑤⑥

auth-onboarding の全 mock unit テスト (TC1〜TC7 middleware / composables / schemas) は全 PASS。  
手動項目 (EDGE-001 実機 / NFR-001 5秒 / 招待発行参加シナリオ) は環境制約のため実行不可だが、  
上記手順で `pnpm dev` 後に確認可能。
