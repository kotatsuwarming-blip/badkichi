# ADR-012: テスト戦略の正式化 (Vitest 単体 / integration / Playwright E2E)

> **採番について**: 当初 ADR-009 として起票したが、`009-supabase-auth-provider-policy.md` と
> 番号が重複していたため 2026-05-31 に **ADR-012** へ採番し直した (provider policy 側を 009 として維持)。

## ステータス
Accepted (2026-05-29)

## 用語の前提

本 ADR で扱う用語:

- **mock unit test**: モジュール外部 (DB / 外部 API / ファイルシステム) を `vi.mock` 等で偽物に
  差し替えて、純粋にロジックを検証するテスト。高速・決定的・secret 不要
- **integration test**: 実 Supabase インスタンスに接続し、RLS / RPC の振る舞いを検証するテスト。
  CI Secrets で `sb_secret_*` を注入、実 DB のため低速・状態管理が必要
- **E2E (End-to-End) test**: ブラウザを起動して画面操作を再現するテスト。Playwright を想定

データエンジニアアナロジー:
- mock unit ≈ dbt の `unit-tests` (固定 mock 入力でモデルロジック検証)
- integration ≈ dbt の `data-tests` (実 DB に対する `unique` / `not_null` 等の制約検証)
- E2E ≈ Tableau / Looker での画面操作回帰テスト (BI tool 上でフィルタ操作 → 期待値表示)

## 背景

これまでに以下の test 関連決定が個別に発生している:

| 決定 | 起点 | 内容 |
|------|------|------|
| mock unit / integration の 2 レイヤー分離 | TASK-0013 (2026-05-23) | 命名規約 `*.test.ts` / `*.integration.test.ts`、`vitest.config.ts` / `vitest.integration.config.ts` 分離 |
| カバレッジ方針 | TASK-0002 後の振り返り | 境界値 + 分岐カバレッジのみ、冗長ケース禁止 |
| Supabase Admin API ヘルパー | TASK-0013 | `tests/setup/create-test-users.ts` で test user 動的生成 |
| middleware の分岐カバレッジテスト | ADR-008 D8 | 7 パターンの分岐を mock unit でカバー |
| composable の mock unit テスト | ADR-007 D8 | 成功 / 主要エラーケースを mock unit でカバー |
| RLS / RPC の integration テスト | TASK-0014 (進行中) | data-foundation の最終確認、ALREADY_IN_GROUP 制約等 |
| E2E 方針 (Google OAuth は mock) | auth-onboarding interview D2 (2026-05-24) | Playwright で「ログイン後」遷移検証、Google OAuth フローは単体テストで `signInWithOAuth` 呼び出し検証 |

これらの決定は memory / 個別 ADR / interview-record に散在しており、**統一参照点 (ADR) がない**。
後続単位 (player-management / match-management 等) で新規テスト追加時、どのレイヤーに書くか・
どこに配置するか・何をどこまでカバーするかの **規範** が必要。

本 ADR は既存決定を集約し、テスト戦略の参照ハブとして機能させる。
新規判断は最小限 (D5 配置規約 / D10 E2E 導入タイミング) に留める。

## 決定

### D1: テストレイヤーの 3 層モデル

| レイヤー | 命名規約 | 実行コマンド | 走る場所 | 主な対象 |
|---------|---------|------------|---------|---------|
| **mock unit** | `*.test.ts` | `pnpm test` | pre-commit + CI 全 job | composable / middleware / Zod schema / utility 関数 |
| **integration** | `*.integration.test.ts` | `pnpm test:integration` | CI 専用 + ローカル on-demand | RLS / RPC / DB 制約 |
| **E2E** | (未導入、Phase 2 or auth-onboarding 完了後に判断) | `pnpm test:e2e` (予定) | CI 専用 (将来) | ブラウザ操作・画面遷移 |

#### D1-1: mock unit (`*.test.ts`)

- **目的**: 純粋なロジック検証。高速・決定的・secret 不要
- **実行頻度**: pre-commit hook で全件、CI でも全件
- **時間目標**: 全件 5 秒以内 (pre-commit を阻害しない)
- **外部依存の扱い**: `vi.mock` で偽物に差し替え (例: `useSupabaseClient` → 固定 `{data, error}` を返す mock)

#### D1-2: integration (`*.integration.test.ts`)

- **目的**: 実 Supabase インスタンスとの統合動作検証。RLS / RPC / 制約の振る舞いを確認
- **実行頻度**: CI 専用 + ローカル on-demand
- **時間目標**: 全件 60 秒以内 (CI の許容範囲、並列化不要な規模)
- **外部依存**:
  - `NUXT_PUBLIC_SUPABASE_URL` / `NUXT_PUBLIC_SUPABASE_KEY` / `NUXT_SUPABASE_SECRET_KEY` 必須
  - 未設定環境では `describe.skipIf(!process.env.NUXT_SUPABASE_SECRET_KEY)` で skip (落ちない)
- **テストユーザ管理**: `tests/setup/create-test-users.ts` (TASK-0013) の `globalSetup` で動的生成

#### D1-3: E2E (Playwright、未導入)

- **目的**: ブラウザ操作の回帰検証 (ログイン → Group 作成 → トップ表示まで)
- **MVP 時点**: **導入保留**。auth-onboarding 単位の実装完了後に再判断 (D10 参照)
- **将来導入時のスコープ**: ログイン **後** の画面遷移のみ。Google OAuth フロー自体は mock
  (`supabase.auth.signInWithOAuth` 呼び出しを mock unit で検証)
- **理由**: Google OAuth の実環境テストは CI ボット規制リスク + メンテコスト過大

### D2: 各レイヤーのカバレッジ責務分担

| 対象 | mock unit | integration | E2E |
|------|----------|-------------|-----|
| composable のロジック (PG SQLSTATE → App 識別子変換等) | ✅ | ❌ | ❌ |
| middleware の分岐ロジック | ✅ | ❌ | ❌ |
| Zod schema (Group 名 1〜50 文字等) | ✅ | ❌ | ❌ |
| utility 関数 (rule-engine 等) | ✅ | ❌ | ❌ |
| RLS ポリシー (member only / non-member rejected) | ❌ | ✅ | ❌ |
| RPC 動作 (`create_group_with_owner` / `join_group_with_code` / `generate_invitation_code`) | ❌ | ✅ | ❌ |
| DB 制約 (UNIQUE / FK / CHECK) | ❌ | ✅ | ❌ |
| 招待コード CSPRNG 衝突再試行 | ❌ | ✅ | ❌ |
| ログイン後の画面遷移 (onboarding → Group 作成 → トップ) | ❌ | ❌ | ✅ (将来) |
| Google OAuth フロー全体 | ❌ (`signInWithOAuth` 呼び出し検証のみ) | ❌ | ❌ |

**原則**: 各 1 つのテストは 1 つのレイヤーにのみ属する。多重カバーは避ける。

### D3: カバレッジ方針 — 最小境界値 + 分岐

`[[feedback-test-coverage]]` を継承し本 ADR で正式化:

- **境界値 + 分岐カバレッジのみ** をカバーする
- 冗長ケース禁止 (同じ分岐の別データ / A-B 対称ケース / 自明ケース)
- タスク定義書のテストケース表を **鵜呑みにせず、実装の分岐を自分で洗い出してから** テスト数を決める

**例**: ADR-008 D8 の middleware テスト 7 ケース、ADR-007 D8 の composable テスト (成功 + 主要エラー)。

### D4: mock 戦略

#### D4-1: composable テストでの mock

```ts
// tests/unit/composables/useCreateGroup.test.ts (実装イメージ)
import { vi, describe, it, expect } from 'vitest'
import { useCreateGroup } from '~/composables/useCreateGroup'

vi.mock('#imports', () => ({
  useSupabaseClient: () => ({
    rpc: vi.fn().mockResolvedValue({ data: { id: 'xxx' }, error: null })
  })
}))

describe('useCreateGroup', () => {
  it('成功時に data を返す', async () => {
    const { create } = useCreateGroup()
    const result = await create('チームA')
    expect(result.data).toEqual({ id: 'xxx' })
  })
})
```

`useSupabaseClient` を `vi.mock` で偽物に差し替え、固定の `{data, error}` を返す。

#### D4-2: middleware テストでの mock

ADR-008 D8 と整合:

```ts
// tests/unit/middleware/auth.test.ts (実装イメージ)
vi.mock('#imports', () => ({
  useSupabaseUser: vi.fn(),
  useCurrentGroup: vi.fn(),
  navigateTo: vi.fn()
}))

it('未認証で /groups/new アクセス → /login にリダイレクト', async () => {
  vi.mocked(useSupabaseUser).mockReturnValue(ref(null))
  await runMiddleware({ path: '/groups/new', fullPath: '/groups/new' })
  expect(navigateTo).toHaveBeenCalledWith('/login?redirect=/groups/new')
})
```

#### D4-3: integration テストでの本物クライアント

mock せず、`tests/setup/create-test-users.ts` で生成された test user で実 Supabase に接続:

```ts
// tests/integration/rls.integration.test.ts (実装イメージ)
import { inject } from 'vitest'
import { createClient } from '@supabase/supabase-js'

describe.skipIf(!process.env.NUXT_SUPABASE_SECRET_KEY)('RLS: group_members', () => {
  const { userA, userB } = inject('users')
  // userA / userB を使った RLS 検証...
})
```

### D5: テストファイル配置 — 全テストを `tests/` に集約

**原則**: すべてのテストファイルは `tests/` 配下に置く。`app/<module>/__tests__/` のような
**隣接配置パターンは使用しない**。

```
app/
├── composables/             ← composable 本体
├── middleware/              ← middleware 本体
├── utils/
│   └── rule-engine/
│       └── *.ts             ← utility 本体 (テストは tests/ 配下)
└── schemas/                 ← Zod スキーマ (将来追加、auth-onboarding で初登場)

tests/
├── unit/                    ← mock unit を集約 (全種類)
│   ├── composables/
│   │   └── *.test.ts
│   ├── middleware/
│   │   └── *.test.ts
│   ├── schemas/
│   │   └── *.test.ts
│   └── utils/
│       └── rule-engine/
│           └── *.test.ts    ← 既存の app/utils/rule-engine/__tests__/ から移動
├── integration/             ← integration test
│   ├── helpers/             ← integration テスト用ヘルパー (既存)
│   ├── rls.integration.test.ts
│   └── *.integration.test.ts
└── setup/                   ← globalSetup
    └── create-test-users.ts
```

**ルール**:
- **配置**: モジュール種別 (composables / middleware / schemas / utils) ごとに `tests/unit/<type>/` 下に作る
- **ファイル命名**: 対象モジュール名と一致 (例: `useCreateGroup.test.ts` → `tests/unit/composables/useCreateGroup.test.ts`)
- **import path**: `~/composables/useCreateGroup` のように `~/` (= `app/`) 経由で対象モジュールを import
- **既存の `app/utils/rule-engine/__tests__/*.test.ts` は `tests/unit/utils/rule-engine/*.test.ts` に移動する** (auth-onboarding 着手時 or 別タスクで実施)

### D6: CI 統合

```
.github/workflows/ci.yml (概念図):
─────────────────────────────────────────
job: lint                  → pnpm lint + pnpm lint:actions
job: typecheck             → pnpm typecheck
job: test (mock unit)      → pnpm test                          (高速、全 PR で必須)
job: integration           → pnpm test:integration              (CI Secrets 注入、main マージ条件)
job: e2e (将来)            → pnpm test:e2e                      (Phase 2、未導入)
```

- **pre-commit hook**: `pnpm test` (mock unit のみ) — 数秒で完了
- **PR check**: lint / typecheck / mock unit (必須通過)
- **merge gate (main)**: 全 4 ジョブ通過必須 (integration を含む)
- **integration job の env**: GitHub Actions Secrets から `NUXT_SUPABASE_SECRET_KEY` を `env:` で注入

### D7: skip 戦略

integration テストは env 未設定環境では skip して落ちないようにする:

```ts
describe.skipIf(!process.env.NUXT_SUPABASE_SECRET_KEY)('...', () => { /* ... */ })
```

これにより:
- ローカル開発者が `pnpm test:integration` を試しに叩いても env 未設定なら skip で抜ける
- CI では env 注入されているので確実に実行される
- 「secret 未設定で誤って commit / push」事故を防ぐ

### D8: テストデータ管理

#### D8-1: integration テストのデータライフサイクル

- **生成**: `tests/setup/create-test-users.ts` の `globalSetup` で `auth.admin.createUser` 経由で動的生成 (TASK-0013 確立済)
- **共有**: Vitest の `provide` / `inject` で test user 情報を全テストに配布
- **テスト内 setup**: 各 test 内で必要な Group / Invitation を Admin client で個別作成
- **teardown**: integration test 完了時に Admin client で削除 (clean state を保つ)
- **seed.sql は使わない**: 空のまま (data-foundation 決定、`group_members` が `auth.uid()` 紐付け必須のため意味のある seed 不可)

#### D8-2: mock unit のデータ

mock unit はテストごとに固定値を `vi.mock` で渡す。共有データ機構不要。

### D9: テスト命名規約

- ファイル名は対象モジュール名と一致 (例: `useCreateGroup.test.ts` / `auth.test.ts`)
- `describe` ブロックは対象モジュール名で開始 (例: `describe('useCreateGroup', ...)`)
- `it` ブロックは **「条件 → 期待動作」を一文で書く** (例: `it('RPC が invalid_group_name を返したとき INVALID_GROUP_NAME 識別子に変換する', ...)`)
- 日本語タイトル OK (memory: feedback-doc-language)、コードは英語

### D10: E2E (Playwright) 導入タイミング

**MVP 時点では Playwright 導入を保留**。以下の条件が揃ったら本 ADR を改訂して導入する:

- auth-onboarding 単位の実装完了 (ログイン後遷移が実装される)
- player-management 単位の主要画面実装完了 (E2E でカバーする画面が増える)
- mock unit + integration で MVP 機能が十分カバーされていること (E2E はあくまで補強)

**導入時のスコープ案**:
- `tests/e2e/login-flow.spec.ts`: Admin API で test user 作成 → ログイン (Supabase session を直接挿入) → /onboarding → Group 作成 → / 表示確認
- Google OAuth フロー自体は mock unit で `signInWithOAuth` 呼び出し検証のみ

## 理由

1. **既存決定の集約による参照ハブ化**:
   `feedback_test_layer_separation` / `feedback_test_coverage` / TASK-0013 / ADR-007 D8 / ADR-008 D8 /
   interview-record D2 など散在する決定を 1 ADR に集約。後続単位がテスト追加時に「ADR-012 を見れば
   分かる」状態にする
2. **3 層モデルでテストの重複を排除** (D1 / D2):
   各テストが 1 レイヤーにのみ属することで、「同じケースを mock unit と integration の両方で書く」
   無駄を防ぐ。レビュー時にも「これはどのレイヤーで書くべきか」の判断が一意になる
3. **全テストを `tests/` 配下に集約** (D5):
   隣接配置 (`__tests__/`) と集約配置の混在は「これはどっち?」の判断負荷を生む。`tests/` 一本に
   統一することで、新規追加時の迷いをゼロにし、CI のテスト検索パス・カバレッジレポート生成も
   単純化する。既存の `app/utils/rule-engine/__tests__/` は移動コストを一度払って整理する
4. **CI 統合の段階化** (D6):
   pre-commit は高速 mock unit のみ、PR check は lint+typecheck+mock unit、main merge gate に
   integration を追加。段階的に堅牢性を上げる
5. **skip 戦略で「うっかり実行」事故を防ぐ** (D7):
   `describe.skipIf` でローカル env 未設定環境では integration が落ちない。
   `feedback_strict_secret_policy` (シェル env / CI Secrets のみ) と整合
6. **E2E は保留で「過剰投資回避」** (D10):
   Playwright は導入コスト高 (CI セットアップ / メンテ / Flaky test 対応)。MVP の mock unit +
   integration で十分カバーできる範囲では導入を保留し、必要が明確になってから導入する

### データエンジニアのアナロジー

- **3 層モデル** (D1) = dbt の `unit-tests` / `data-tests` / `freshness check` の使い分け
- **mock unit** (D1-1) = dbt の `unit-tests`: 固定入力でモデル変換ロジックを検証、DB 接続不要
- **integration** (D1-2) = dbt の `data-tests` (`unique` / `not_null` / `relationships`):
  実 DB のデータに対する制約検証
- **E2E** (D1-3) = BI tool 上の画面回帰テスト (Looker の dashboard automation 等):
  最終的なユーザ体験の保証だが、メンテコスト高
- **境界値 + 分岐カバレッジ** (D3) = dbt の `accepted_values` テスト:
  値の集合を最小単位で網羅、`['active', 'inactive']` を全件チェック
- **skipIf 戦略** (D7) = dbt の `disabled: true` config:
  環境次第で実行 / スキップを切り替え

## 影響

### data-foundation への影響

- TASK-0013 (Admin API ヘルパー、完了済) と TASK-0014 (RLS 統合テスト、進行中) は本 ADR で正式化された
  3 層モデルに位置づけられる
- 新規追加なし

### 既存テストファイルの移動 (D5 一括集約)

| 移動元 | 移動先 |
|--------|--------|
| `app/utils/rule-engine/__tests__/apply-override.test.ts` | `tests/unit/utils/rule-engine/apply-override.test.ts` |
| `app/utils/rule-engine/__tests__/apply-rally.test.ts` | `tests/unit/utils/rule-engine/apply-rally.test.ts` |
| `app/utils/rule-engine/__tests__/create-initial-state.test.ts` | `tests/unit/utils/rule-engine/create-initial-state.test.ts` |
| `app/utils/rule-engine/__tests__/determine-set-winner.test.ts` | `tests/unit/utils/rule-engine/determine-set-winner.test.ts` |

実施タイミング: auth-onboarding 着手時、または独立タスクとして先行実施。`vitest.config.ts` の
include path が `app/**/__tests__/` を含んでいる場合は `tests/unit/**` に変更する。

### auth-onboarding 単位への影響

| 新規ファイル | 内容 |
|------------|------|
| `tests/unit/composables/useLogin.test.ts` | ADR-007 D8 の mock unit |
| `tests/unit/composables/useCurrentGroup.test.ts` | 同上 |
| `tests/unit/composables/useCreateGroup.test.ts` | 同上 |
| `tests/unit/composables/useJoinGroup.test.ts` | 同上 |
| `tests/unit/composables/useGenerateInvitation.test.ts` | 同上 |
| `tests/unit/composables/useListInvitations.test.ts` | 同上 |
| `tests/unit/middleware/auth.test.ts` | ADR-008 D8 の分岐カバレッジテスト |
| `tests/unit/schemas/group-name.test.ts` | Zod schema の境界値テスト (1/50/51/0 文字、空白のみ) |

### 後続 UI 単位への影響

`player-management` / `match-management` / `match-recording` / `stats-dashboard` の各単位は
本 ADR の規約に従って新規テストを追加する。判断の流れ:

1. 対象は何か? (composable / middleware / Zod schema / utility / RLS / RPC / 画面遷移)
2. D2 表でレイヤーを決定
3. D5 配置ルールでファイル位置を決定
4. D3 カバレッジ方針で必要十分なケース数を決定
5. D4 mock 戦略でテストコードを書く

### CI / 開発フローへの影響

- pre-commit hook の対象は変更なし (`pnpm test` のみ、mock unit)
- `.github/workflows/ci.yml` に integration job を追加 (まだ追加されていなければ)
- E2E job は MVP では追加しない (D10)

## 採用しなかった選択肢

| 案 | 却下理由 |
|---|---|
| A. 単一レイヤー (mock unit のみ、integration なし) | RLS / RPC の実 DB 動作が検証できない、本番事故リスク |
| B. 単一レイヤー (integration のみ、mock unit なし) | 全テストが secret + 実 DB 必須で pre-commit に組み込めず、回帰防止が弱い |
| C. 3 層を全 commit で実行 (integration も pre-commit に) | 数秒では終わらず開発体験悪化、secret 漏洩リスク |
| D. 配置ルールの混在 (既存 `__tests__/` を残し、新規のみ `tests/unit/`) | 「これはどっち?」の判断負荷を毎回生む、CI のテスト検索パスも 2 箇所、整理コストを払って `tests/` 一本にする方が長期的に楽 |
| E. ファイル配置を全て `__tests__/` 隣接に統一 | Nuxt 依存 (composable / middleware) は test 環境設定 (Nuxt auto-import / mock) を集約したい、隣接配置だと test setup が散らばる |
| F. E2E を MVP 必須 | Playwright のメンテコスト + Flaky test 対応負荷大、mock unit + integration で十分カバー可能、過剰投資 |
| G. E2E で Google OAuth フロー実環境テスト | Google bot 検出による CI 失敗リスク、Google アカウントの 2FA 等で動かない、メンテ不能 |
| H. integration テストで mock を併用 | レイヤー混在で「これはどっち?」が曖昧化、責務分離が崩れる |
| I. Snapshot test の多用 | UI 全体スナップショットは drift しやすく、差分レビュー困難。境界値 + 分岐ベースで書く方が明確 (memory: feedback-test-coverage) |

## 関連メモリ

- `[[feedback-test-layer-separation]]`: mock unit / integration の 2 レイヤー命名・config 分離 (本 ADR D1 で正式化)
- `[[feedback-test-coverage]]`: 境界値 + 分岐カバレッジのみ (本 ADR D3 で正式化)
- `[[feedback-strict-secret-policy]]`: secret はシェル env / CI Secrets のみ (本 ADR D6 / D7 と整合)
- `[[feedback-dedicated-linter-cli]]`: actionlint 等の専用 CLI 使用 (CI 統合の品質基準として継承)
- `[[project-adr-candidates-pre-kairo-design]]`: 本 ADR は候補リスト「優先度 中」を確定 (採番は 009→012 に変更)

## 参考

- Vitest 公式 docs: https://vitest.dev/
- Playwright 公式 docs: https://playwright.dev/
- ADR-005 (エラーハンドリング戦略) §D6: Sentry でのエラー報告、テスト戦略と相互補完
- ADR-007 (composable 規約) D8: composable レベル mock unit テスト
- ADR-008 (middleware 戦略) D8: middleware レベル mock unit テスト (7 ケース)
- TASK-0013 完了記録 (2026-05-23): Admin API ヘルパー初導入、本 ADR D8-1 の基盤
- TASK-0014 (進行中): RLS / RPC 統合テスト、本 ADR D2 の integration 適用例
- `docs/spec/auth-onboarding/interview-record.md` D2: E2E 戦略 (Google OAuth は mock、ログイン後遷移を Playwright)
- `docs/spec/auth-onboarding/requirements.md` NFR-301, NFR-302: テスト範囲の要件側記述
