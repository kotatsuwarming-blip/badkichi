# TASK-0013 テストケース展開

**対象タスク**: [TASK-0013](../../../tasks/data-foundation/TASK-0013.md)
**作成日**: 2026-05-23
**フェーズ**: tdd-testcases (TDD プロセス step-c)
**方針**: boundary + branch のみ。redundant ケースは作らない (feedback_test_coverage)

---

## テストレイヤー別ケース一覧

### Layer 1: mock unit tests (`tests/setup/__tests__/create-test-users.test.ts`)

実行: `pnpm test`、secret 不要、pre-commit + CI 両方で走る。

#### TC-13-01: 正常パス: 2 ユーザ作成成功 (boundary)

- **種別**: boundary (正常 1)
- **前提条件**:
  - `vi.stubEnv` で `NUXT_PUBLIC_SUPABASE_URL='https://stub.supabase.co'`, `NUXT_SUPABASE_SECRET_KEY='sb_secret_stub'` をセット
  - `@supabase/supabase-js` の `createClient` を `vi.mock` で差し替え
  - mock の `auth.admin.createUser` が `{ data: { user: { id: 'uuid-A' } }, error: null }` (1 回目) / `{ data: { user: { id: 'uuid-B' } }, error: null }` (2 回目) を返す
- **実行**: `await setupTestUsers()`
- **期待結果**:
  - 戻り値 `userA.id === 'uuid-A'`, `userB.id === 'uuid-B'`
  - 戻り値 `userA.email === 'test-a@example.com'` (デフォルト) または `process.env.TEST_USER_A_EMAIL`
  - 戻り値 `userA.password` が空文字でない (動的生成済)
  - mock `createUser` が 2 回呼ばれた、`email_confirm: true` を引数に持つ

#### TC-13-02: エラーパス: NUXT_SUPABASE_SECRET_KEY 未設定 (branch)

- **種別**: branch (例外パス)
- **前提条件**:
  - `vi.stubEnv` で `NUXT_PUBLIC_SUPABASE_URL='https://stub.supabase.co'` のみセット
  - `NUXT_SUPABASE_SECRET_KEY` は `vi.unstubAllEnvs` + 明示的に `vi.stubEnv('NUXT_SUPABASE_SECRET_KEY', '')` または削除
- **実行**: `await setupTestUsers()` を try-catch で囲む
- **期待結果**:
  - `Error` を throw、`error.message` が `'NUXT_PUBLIC_SUPABASE_URL / NUXT_SUPABASE_SECRET_KEY が未設定です'` を含む

#### TC-13-03: エラーパス: Admin API が error を返す (branch)

- **種別**: branch (例外パス)
- **前提条件**:
  - 環境変数は TC-13-01 と同様にセット
  - mock の `auth.admin.createUser` が `{ data: { user: null }, error: { message: 'Invalid API key' } }` を返す
- **実行**: `await setupTestUsers()` を try-catch
- **期待結果**:
  - `Error` を throw、`error.message` が `'createUser failed: Invalid API key'` を含む

### Layer 2: integration tests (`tests/integration/setup/create-test-users.integration.test.ts`)

実行: `pnpm test:integration`、`NUXT_SUPABASE_SECRET_KEY` を CI Secrets から注入 (ローカルではオンデマンド)。pre-commit には組み込まない。

> 注: `vitest.integration.config.ts` の `globalSetup` で `setupTestUsers` が 1 度実行され、User A/B が dev DB 上に存在する状態でこのファイルの各 `it` が走る。User の delete 自体の検証 (TC-13-04) は二重削除回避のため Layer 1 (mock) に移した。Layer 2 は `cleanupTestUserData()` の実 DB 動作検証のみに絞る。

#### TC-13-04: cleanup: teardownTestUsers の動作 (mock unit に再分類)

- **再分類理由**: 実 DB で teardown を呼ぶと vitest の `globalTeardown` (これも `teardownTestUsers` を呼ぶ) と衝突して二重削除になる。実 DB に対する teardown 動作は globalSetup/Teardown ライフサイクル自体が日常的に実行されるため、ロジック検証は mock で十分。
- **配置**: `tests/setup/__tests__/create-test-users.test.ts` (Layer 1 に移動)
- **種別**: branch (正常 cleanup パス)
- **前提条件**:
  - TC-13-01 と同じ環境変数
  - mock `createUser` が 2 user 分 ok を返した状態で `setupTestUsers()` を呼んだ後
- **実行**: `await teardownTestUsers()`
- **期待結果**:
  - mock `deleteUser` が **2 回**呼ばれた、引数は userA.id / userB.id
  - 続けて `teardownTestUsers()` を呼んでも `deleteUser` は追加で呼ばれない (createdUserIds は空にリセットされている)

#### TC-13-05: afterEach cleanup: cleanupTestUserData で groups が削除される (boundary)

- **種別**: boundary (副作用リーク防止パス、B3 確定方針)
- **前提条件**:
  - 実 dev DB に接続できる environment
  - `setupTestUsers()` で User A/B 作成済
  - service_role client で User A が owner の groups を 1 行 INSERT (テスト前準備)
- **実行**:
  - `await cleanupTestUserData()`
  - service_role client で `from('groups').select('id').eq('owner_user_id', userA.id)` を実行
- **期待結果**:
  - `data` 配列が空 (`[]`)
  - 副次確認: `auth.users` に userA / userB は **残っている** (listUsers で確認)

---

## 省略するケース (redundant のため不採用)

| ケース | 省略理由 |
|---|---|
| 3 ユーザ・4 ユーザ作成 | 2 ユーザで同パス検証済、N>2 は同じ |
| email 形式バリデーション | Supabase Admin API 側の責務 |
| password 強度バリデーション | 同上 |
| テストごと再作成 | B3 確定方針で不採用、globalSetup 1 回作成方針 |
| 並行作成 (Promise.all) | 順次でテスト時間問題なし、並行は将来最適化マター |
| `default` (globalSetup) の fork 動作 | vitest 規約準拠、ライブラリ側の責務 |

---

## 実装ファイル割当て

| TC | ファイル | テスト名 (describe / it) |
|---|---|---|
| TC-13-01 | `tests/setup/__tests__/create-test-users.test.ts` | `setupTestUsers > 正常パス: 2 ユーザを作成し id/email/password を返す` |
| TC-13-02 | 同上 | `setupTestUsers > NUXT_SUPABASE_SECRET_KEY 未設定で Error を throw する` |
| TC-13-03 | 同上 | `setupTestUsers > Admin API が error を返したら Error を throw する` |
| TC-13-04 | `tests/setup/__tests__/create-test-users.test.ts` | `teardownTestUsers > createdUserIds 分 deleteUser を呼び、配列を空にリセットする` |
| TC-13-05 | `tests/integration/setup/create-test-users.integration.test.ts` | `cleanupTestUserData > User A が作成した groups を削除し auth.users は残す` |

## 補助コードの方針

- `vi.mock('@supabase/supabase-js', ...)` で `createClient` を関数 mock に差し替え
- `vi.stubEnv` で環境変数を制御、`afterEach` で `vi.unstubAllEnvs()` + `vi.resetModules()` (モジュール内グローバル `adminClient` をリセットするため)
- integration テストは `process.env.NUXT_SUPABASE_SECRET_KEY` が未設定なら `describe.skipIf` でスキップ (ローカルでカジュアルに `pnpm test:integration` を叩いて env なくても落ちないように)
