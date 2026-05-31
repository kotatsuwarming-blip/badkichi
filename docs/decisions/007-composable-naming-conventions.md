# ADR-007: composable 階層と命名規約

## ステータス
Accepted (2026-05-29) / 補遺追記 (2026-05-30、§補遺で D4-2 戻り値を確定)

## 用語の前提

本 ADR で扱う **composable** は Vue/Nuxt の用語で、「`use〇〇()` という命名規約の再利用可能な関数」を指す。
データエンジニアアナロジー: dbt の `macro` に近い (複数の model から呼び出される共通ロジック)。

Nuxt 4 は `app/composables/` 配下に置いたファイルを自動 import する。本 ADR では Nuxt 4 の
auto-import 前提を踏襲する。

本 ADR で扱う composable は **domain composable** に限定する:

- **domain composable** = ビジネスドメイン (Auth / Group / Invitation) を扱う composable。
  Supabase クエリ・RPC を内包し、`{data, error}` 形で結果を返す
- **cross-cutting composable** (ADR-005 §D3〜D4 で確定済): `useErrorMessage` / `useFormErrors` /
  `useNoticeErrors` / `useToastErrors`。本 ADR の対象外、ADR-005 を継承
- **page composable** (本 ADR D2 で定義): 複数 domain composable を orchestration する集約 composable。
  MVP では出現しない見込みだが、判断基準を本 ADR に明示

## 背景

auth-onboarding 単位 (requirements.md REQ-001〜108、NFR-301) で以下の domain composable を実装する:

| composable | 責務 | 関連 REQ |
|-----------|-----|---------|
| `useLogin` | Google OAuth ログイン (`supabase.auth.signInWithOAuth`) | REQ-001 |
| `useCurrentGroup` | ログイン中ユーザーの Group 情報取得 (`group_members` SELECT) | REQ-005 / REQ-103 / NFR-002 |
| `useCreateGroup` | Group 作成 (`create_group_with_owner` RPC) | REQ-004 |
| `useJoinGroup` | 招待コードで Group 参加 (`join_group_with_code` RPC) | REQ-005 |
| `useGenerateInvitation` | 招待リンク発行 (`generate_invitation_code` RPC) | REQ-007 |
| `useListInvitations` | 招待リンク一覧取得 (`invitations` SELECT) | REQ-006 |

ADR-005 §D1 で「page から `supabase.from(...)` 直接呼びは禁止」「composable 経由必須」を確定済。
ADR-010 / ADR-008 で SSR/CSR 境界と middleware 戦略を確定済。
**残る論点: 各 composable の責務範囲・命名規約・配置・戻り値・テスト戦略を確定する**。

後続単位 (player-management / match-management / match-recording / stats-dashboard) でも
本 ADR の規約に従って新規 composable を作る前提のため、規約を一貫させる必要がある。

## 決定

### D1: 命名規約 — 自然な英語表現

**原則**: **composable 名は中身が一目で分かる自然な英語で命名する**。動詞 + 名詞、名詞のみ、動詞のみ、
いずれの形式でもよい。Read / Write の区別による形式統一は強制しない。

Vue / Nuxt 公式 composable も `useFetch` (動詞のみ) / `useAsyncData` (動詞 + 名詞) /
`useRoute` (名詞のみ) / `useRuntimeConfig` (名詞のみ) のように混在しており、本 ADR は公式の慣例に沿う。

**命名例 (本 ADR で確定する domain composable)**:

| 命名 | 形式 | 中身 |
|------|------|------|
| `useLogin` | 動詞 | Google OAuth login |
| `useCurrentGroup` | 名詞 (修飾語 + 名詞) | 現在の Group 情報 |
| `useCreateGroup` | 動詞 + 名詞 | Group を作成 |
| `useJoinGroup` | 動詞 + 名詞 | Group に参加 |
| `useGenerateInvitation` | 動詞 + 名詞 | 招待リンクを発行 |
| `useListInvitations` | 動詞 + 名詞 (複数形) | 招待リンク一覧を取得 |

**禁止する命名パターン**:

- `useGroup` ❌: 何をする composable か曖昧 (作る? 取得? 参加? 編集?)
- `useGroupService` ❌: 「`Service`」「`Manager`」「`Helper`」「`Operations`」「`Repository`」等の
  汎用サフィックスは禁止 (OO 言語の DI 前提パターンで Vue composable と相性悪く、責務不明確化)

### D2: 1 ユースケース = 1 composable、画面とは合わせない

**原則**: **1 ユースケース (= 1 アクション or 1 状態取得) = 1 composable**。
画面 (page) 単位での集約は基本的に行わない (再利用性優先)。

**「1 page で複数 composable を import するのは Vue 標準パターン**で問題ない」を本 ADR で明示する。
細粒度 composable を組み合わせるのが Vue 思想 (composition の語源)。

#### D2-1: page composable を導入する判断基準

以下のいずれかが必要になったら **page composable** (例: `useOnboardingFlow` / `usePlayerStatsDashboard`)
を導入する:

1. **複数 composable が連動する共有 state**
   - 例: ダッシュボードでフィルタ (date range / player select) を変更すると複数のグラフが同時に再計算
   - page 側で `watch(filter, ...)` を書くと連動ロジックが page に漏れる → page composable に集約
2. **derived state (派生計算)** が複雑で page に書くと太る
   - 例: `matches` と `players` を join して「勝率トップ 5」を `computed` で導出
3. **順次手続き (orchestration)** で複数 composable を 1 操作にまとめたい
   - 例: 「Group 作成 → 招待リンク即発行 → URL コピー」を 1 ボタンで実行
   - 個別 composable を順次呼ぶ手続きを page から隠蔽

#### D2-2: MVP 時点の判定

| 画面 | 使う domain composable | page composable 必要? |
|------|---------------------|---------------------|
| `/login` | `useLogin` | ❌ 1 つだけ |
| `/onboarding` | (静的画面、2 ボタンが別 page にリンク) | ❌ |
| `/groups/new` | `useCreateGroup` | ❌ 1 つだけ |
| `/join/[code]` | `useJoinGroup`, `useSupabaseUser` | ❌ 2 つ独立 |
| `/groups/[id]/settings` | `useGenerateInvitation`, `useListInvitations` | ❌ 2 つ独立、generate 後の refresh は composable 内責務 (D5-4) |

**MVP の全 page で page composable 不要**。stats-dashboard 単位 (Phase 1 末で着手予定) で
判断基準 1+2 に該当するため、page composable が初登場する見込み。その時点で本 ADR を再評価する。

#### D2-3: 関連キャッシュの refresh は composable 内で完結 (D5-4 再確認)

Write composable は、関連する Read composable の `useAsyncData` キャッシュを **内部で refresh** する。
例: `useGenerateInvitation.generate()` の内部で `useListInvitations` の `refresh()` を呼ぶ。

これにより、page 側は `await generate()` するだけで一覧が自動更新される。page で連動ロジックを書く
必要がなくなり、page composable の導入を回避できる。

### D3: 配置 — flat な `app/composables/`

```
app/composables/
├── useLogin.ts
├── useCurrentGroup.ts
├── useCreateGroup.ts
├── useJoinGroup.ts
├── useGenerateInvitation.ts
├── useListInvitations.ts
├── useErrorMessage.ts        ← ADR-005 §D3 で既決定 (cross-cutting)
├── useFormErrors.ts          ← ADR-005 §D4 で既決定 (cross-cutting)
├── useNoticeErrors.ts        ← ADR-005 §D4 で既決定 (cross-cutting)
└── useToastErrors.ts         ← ADR-005 §D4 で既決定 (cross-cutting)
```

**規約**:
- すべて `app/composables/` 直下に flat に配置 (Nuxt 4 の auto-import 仕様)
- サブフォルダ化は **Phase 2 以降** に保留 (composable 数が 20+ に増えたら検討、MVP では 10 個)
- ファイル名は composable 名と一致 (`useLogin.ts` の中で `export const useLogin = ...`)

### D4: 戻り値の形式

ADR-005 §D1「Supabase native `{data, error}` を踏襲」を継承し、composable 種別ごとに戻り値の形を定める:

#### D4-1: Read 系 composable

`useAsyncData` の戻り値をそのまま expose する。

```ts
// useCurrentGroup.ts (実装イメージ)
export const useCurrentGroup = () => {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()
  return useAsyncData('current-group', async () => {
    if (!user.value) return null
    const { data, error } = await supabase
      .from('group_members')
      .select('group_id, groups(id, name)')
      .eq('user_id', user.value.id)
      .maybeSingle()
    if (error) throw error
    return data
  })
}

// 使用例 (page or middleware から)
const { data: currentGroup, pending, error, refresh } = await useCurrentGroup()
```

戻り値:
- `data`: `Ref<T | null>` — クエリ結果
- `pending`: `Ref<boolean>` — 取得中フラグ
- `error`: `Ref<Error | null>` — 例外があれば
- `refresh`: `() => Promise<void>` — 明示的に再取得

#### D4-2: Write 系 composable

アクション関数 + 状態 ref を返す。Supabase native の `{data, error}` を Promise で返す
(D4-3 のエラー変換含む)。

> ⚠️ **下記コード例は 2026-05-30 §補遺で更新済**。戻り値の形は「チャネル state + `pending`」
> (生 `error: AppErrorCode` ref の expose は廃止)、引数は `group_name` (例の `p_group_name` は誤り)、
> `UNIQUE_VIOLATION → GROUP_NAME_TAKEN` 分岐は存在しない (例は不正確)。**実装は §補遺と
> architecture.md「既存 API の利用マッピング」を正とする**。以下は当初の説明用イメージとして残す。

```ts
// useCreateGroup.ts (実装イメージ ※下記の注意書き参照、現行の正は §補遺)
import { APP_ERROR_CODES, PG_ERROR_CODES, type AppErrorCode } from '~/types/error-codes'

export const useCreateGroup = () => {
  const supabase = useSupabaseClient<Database>()
  const pending = ref(false)
  const error = ref<AppErrorCode | null>(null)

  const create = async (name: string) => {
    pending.value = true
    error.value = null
    const { data, error: rpcError } = await supabase.rpc(
      'create_group_with_owner',
      { p_group_name: name }
    )
    pending.value = false

    if (rpcError) {
      // PG SQLSTATE → App 識別子への変換 (ADR-005 §D3)
      if (rpcError.code === PG_ERROR_CODES.UNIQUE_VIOLATION) {
        error.value = APP_ERROR_CODES.GROUP_NAME_TAKEN
      } else if (rpcError.message.includes('invalid_group_name')) {
        error.value = APP_ERROR_CODES.INVALID_GROUP_NAME
      } else {
        error.value = APP_ERROR_CODES.UNKNOWN
      }
      return { data: null, error: error.value }
    }

    // 関連 Read キャッシュの refresh (D2-3 / D5-4)
    const { refresh } = useCurrentGroup()
    await refresh()

    return { data, error: null }
  }

  return { create, pending: readonly(pending), error: readonly(error) }
}

// 使用例 (page から)
const { create, pending, error } = useCreateGroup()
const result = await create('チームA')
if (result.error) { /* 表示 */ } else { /* navigateTo('/') */ }
```

戻り値:
- アクション関数 (例: `create`): `(args) => Promise<{ data, error: AppErrorCode | null }>`
- `pending`: `Readonly<Ref<boolean>>` — 実行中フラグ (readonly で外部書き換え禁止)
- `error`: `Readonly<Ref<AppErrorCode | null>>` — 最後の実行で発生した App 識別子

**アクション関数名**: composable 名から推測される自然な動詞を使う:
- `useCreateGroup` → `create`
- `useJoinGroup` → `join`
- `useLogin` → `login`
- `useGenerateInvitation` → `generate`

#### D4-3: エラー変換 — PG SQLSTATE → App 識別子は composable 内で完結

ADR-005 §D2「識別子の中央集約 (`as const` object)」+ §D3「変換は composable + i18n」を継承。

- **composable 内**: PG SQLSTATE / Supabase error message → App 識別子 (`AppErrorCode`) に変換
- **page 側**: App 識別子のみを扱う (生文字列 `'23505'` や `'invitation_expired'` を比較しない)
- **App 識別子の定義**: `app/types/error-codes.ts` の `APP_ERROR_CODES` (ADR-005 §D2)

### D5: 内部実装の指針

#### D5-1: Supabase Client 取得

ADR-010 D1 表に従い、composable 内では **必ず `useSupabaseClient<Database>()`** を使う:

```ts
const supabase = useSupabaseClient<Database>()  // ✅ isomorphic
// const supabase = serverSupabaseClient(event)  // ❌ server-only API は composable で使わない
```

`<Database>` 型を付けることで `.from('group_members').select(...)` の戻り値が型付けされる
(ADR-010 D8 と整合)。

#### D5-2: ユーザー情報取得

```ts
const user = useSupabaseUser()
if (!user.value) return null  // 未ログイン時の早期 return
```

`user.value.id` を `where user_id = X` に使う際は必ず null チェックを行う (TypeScript の
exhaustiveness check で強制される)。

#### D5-3: キャッシュ戦略 (Read 系)

ADR-008 D4 / ADR-010 D7 を継承:
- Read 系は `useAsyncData(key, fetcher)` を必ず使う
- key は kebab-case で composable の用途を表す (`'current-group'` / `'invitations-list'`)
- page と middleware の両方から呼んでも 1 ナビゲーションで 1 クエリ

`refresh()` を expose し、明示的な再取得 (招待リンク発行後の一覧更新等) に対応する。

#### D5-4: 副作用 — Write 内で関連 Read キャッシュを refresh

D2-3 の実装責務。Write composable は **関連する Read composable のキャッシュを自分で refresh** する:

```ts
// useGenerateInvitation.ts (実装イメージ抜粋)
const generate = async (groupId: string) => {
  // ... RPC 実行 ...
  if (!rpcError) {
    const { refresh } = useListInvitations(groupId)
    await refresh()  // 同じキーのキャッシュを再取得
  }
  // ...
}
```

呼び出し側 (page) は `await generate(groupId)` だけで一覧が自動更新される。page で
連動ロジックを書く必要がない (D2-3)。

### D6: 型定義の場所

| 型の種類 | 配置 |
|---------|------|
| Database スキーマ型 (`Database` / `Tables<'groups'>` 等) | `app/types/supabase.ts` (`supabase gen types` で自動生成) |
| App 識別子 (`APP_ERROR_CODES` / `AppErrorCode`) | `app/types/error-codes.ts` (ADR-005 §D2) |
| Domain 共有型 (例: `CurrentGroup`、複数 composable から参照) | `app/types/domain.ts` (新規、必要になったら作る) |
| composable 個別の内部型 | composable ファイル内に inline 定義 (`type LoginResult = ...`)、export しない |

### D7: 公開 API の最小化

composable は **`return` で expose したものだけ** が外から使える。内部実装は必ず非公開にする:

```ts
export const useCreateGroup = () => {
  const supabase = useSupabaseClient<Database>()  // 内部
  const pending = ref(false)                       // 内部
  const error = ref<AppErrorCode | null>(null)     // 内部 (readonly で expose する)

  const _convertError = (rpcError: PostgrestError): AppErrorCode => {
    // 内部 helper、export しない
  }

  const create = async (name: string) => { /* ... */ }

  return {
    create,
    pending: readonly(pending),
    error: readonly(error)
  }
}
```

- 内部 helper (`_convertError` 等) は `_` プレフィックスで内部利用を明示
- ref は `readonly()` でラップして外部からの書き換えを禁止 (Vue の reactivity 規約)

### D8: テスト戦略

ADR-012 (テスト戦略の正式化) で詳細化予定。本 ADR では合意済みの方針のみ記載:

- **mock unit test** (Vitest + `*.test.ts` ファイル): 各 composable について以下をカバー:
  - 成功ケース (正常系の data 取得 / Write 完了)
  - 主要なエラーケース (App 識別子に正しく変換されること)
  - 境界値・分岐カバレッジのみ (memory: feedback_test_coverage)
- **integration test** (`*.integration.test.ts`, ADR-012 で確定予定): RLS / RPC の実 DB 動作は
  data-foundation TASK-0014 で別途カバー (composable 単位ではなく DB 単位の責務)
- `useSupabaseClient` を mock し、固定の `{data, error}` を返すように差し替える
- `useAsyncData` のキャッシュ動作は Nuxt の internal で、composable のテストでは検証対象外

### D9: page との境界 (再確認)

ADR-005 §D1 / REQ-406 / REQ-407 を再確認:

| 行動 | page で許可? |
|------|------------|
| `useSupabaseClient().from(...)` 直接呼び | ❌ 必ず composable 経由 |
| `useSupabaseClient().rpc(...)` 直接呼び | ❌ 必ず composable 経由 |
| `useSupabaseClient().auth.signInWithOAuth(...)` 直接呼び | ❌ `useLogin().login()` 経由 |
| composable から expose された `data` / `pending` / `error` 参照 | ✅ |
| composable から expose されたアクション関数呼び出し | ✅ |
| 生文字列の error code 比較 (`if (e === 'invitation_expired')`) | ❌ `APP_ERROR_CODES` 経由 |
| `APP_ERROR_CODES.INVITATION_EXPIRED` での比較 | ✅ |

## 理由

1. **命名から責務が読み取れる** (D1):
   `useCreateGroup` は「Group を作る」と一目で分かる。`useGroup` 等の曖昧名・`Service` 等の汎用
   サフィックスを禁止することでレビュー時の認知負荷を下げる。Vue/Nuxt 公式の慣例 (自然な英語表現)
   に沿うことで学習コストを最小化
2. **細粒度 composable + 必要時の page composable** (D2):
   Vue の composition 思想に沿い、「1 ユースケース = 1 composable」を基本とする。1 page で
   多数の composable を import するのは Vue 標準パターンで問題ない。連動 state / derived state /
   orchestration が必要になった時のみ page composable を導入することで、過度な抽象化を回避しつつ
   将来の拡張余地を残す
3. **flat な配置** (D3):
   Nuxt 4 の auto-import 仕様と整合。MVP 規模 (10 個) ではフォルダ分割の利益が小さく、
   Phase 2 で必要になったら検討すれば足りる
4. **Read / Write で戻り値の形を分ける** (D4):
   Read は `useAsyncData` の戻り値構造 (reactive ref + refresh) が UX に直結。Write はアクション関数
   呼び出しの結果 (`Promise<{data, error}>`) が必要。混合させず明示的に分けることで、page 側の使い方が予測可能
5. **エラー変換は composable に閉じる** (D4-3):
   ADR-005 §D2-D3 を継承。page で生文字列を扱わせないことで、SQL リファクタや SQLSTATE 変更の影響を
   composable 内に閉じ込める
6. **キャッシュ無効化は composable 内で完結** (D5-4):
   page 側で「Group 作成後に refresh も呼ぶ」を意識させない。Write composable が自己責任で
   関連 Read キャッシュを refresh することで、page のコードがフラットに保たれ、page composable の
   早期導入を回避できる (D2-3)
7. **テスト戦略は composable 単位の unit + DB の integration を分離** (D8):
   `feedback_test_layer_separation` (mock unit / integration 2 レイヤー分離) と整合。composable は
   `useSupabaseClient` を mock してロジック検証、DB 動作は data-foundation TASK-0014 でカバー

### データエンジニアのアナロジー

- **composable** (D1〜D2) = dbt の `macro`:
  再利用可能、引数を取って結果を返す、`{% macro %}` 規約で識別 (Nuxt の `use` prefix 相当)
- **1 page で複数 composable** (D2) = 1 model で複数 macro を `{{ }}` で組み合わせる:
  `{% set users = ref('users') %}` `{{ to_date(...) }}` `{{ surrogate_key(...) }}` の共存と同じ
- **page composable** (D2-1) = dbt の `_overview.md` model:
  複数 macro を組み合わせて domain logic を集約。Read/Write の混在も可
- **`useCurrentGroup` (Read 系)** (D4-1) = dbt の `materialized: view`:
  呼ぶたびに最新を返すが、同一実行内ではキャッシュ
- **`useCreateGroup` (Write 系)** (D4-2) = dbt の `run-operation`:
  副作用を起こす操作。実行結果を `{data, error}` で返す
- **D4-3 (PG SQLSTATE → App 識別子)** = dbt の `dispatch` macro:
  DB ベンダー固有のエラーコード (Snowflake / BigQuery で違う) を抽象的な識別子に正規化
- **D5-4 (キャッシュ無効化)** = Airflow の trigger rule + downstream task:
  上流タスク完了で下流の依存関係が自動再評価される

## 影響

### auth-onboarding 単位への影響

| 新規ファイル | 内容 |
|------------|------|
| `app/composables/useLogin.ts` | Google OAuth 呼び出しを内包 |
| `app/composables/useCurrentGroup.ts` | `group_members` の `useAsyncData` キャッシュ |
| `app/composables/useCreateGroup.ts` | `create_group_with_owner` RPC を内包、`useCurrentGroup.refresh()` を内部呼び出し |
| `app/composables/useJoinGroup.ts` | `join_group_with_code` RPC を内包、`useCurrentGroup.refresh()` を内部呼び出し |
| `app/composables/useGenerateInvitation.ts` | `generate_invitation_code` RPC を内包、`useListInvitations.refresh()` を内部呼び出し |
| `app/composables/useListInvitations.ts` | `invitations` SELECT を `useAsyncData` キャッシュ |
| `app/types/error-codes.ts` (既存追記) | ADR-005 / ADR-006 の識別子に加え、本 ADR で必要な識別子を追加 |
| `tests/unit/composables/*.test.ts` | 各 composable の mock unit test |

### 後続 UI 単位への影響

`player-management` 以降で新規 composable を作るとき、本 ADR の D1〜D9 の規約に従う。

| 想定 composable | 規約適用 |
|---------------|---------|
| `useListPlayers` (Read 系、一覧取得) | D1 (動詞 + 名詞)、D4-1 (`useAsyncData`) |
| `useAddPlayer` (Write 系) | D1 (動詞 + 名詞)、D4-2 (アクション関数) |
| `useUpdatePlayer` (Write 系) | D1、D4-2 |
| `usePlayerStatsDashboard` (page composable) | D2-1 (連動 state + 派生計算で page composable 候補)、stats-dashboard 単位で初登場見込み |

### data-foundation への影響

なし (DB 側の変更はない)。`app/types/supabase.ts` の自動生成は継承。

### テストへの影響

- `tests/unit/composables/` ディレクトリ新規作成
- ADR-012 で「composable レベルの mock unit」を正式化予定
- DB 統合動作は `tests/integration/` の RLS/RPC integration test で別途カバー

## 採用しなかった選択肢

| 案 | 却下理由 |
|---|---|
| A. すべてドメイン単位 (`useAuth` / `useGroup` / `useInvitation`) で 1 composable に CRUD 集約 | 1 ファイルが巨大化、テスト難、責務不明確、tree-shake 効かない |
| B. すべてアクション単位 (`useLoginAction` / `useCreateGroupAction` のように `Action` サフィックス強制) | 命名が冗長、Vue 公式の慣例 (`useFetch` / `useState` 等) と乖離 |
| C. `Service` / `Manager` / `Repository` パターン | OO 言語の DI 前提パターンで Vue composable と相性悪く、過剰抽象 |
| D. Pinia store として実装 | ADR-010 D7 で「Pinia は MVP では不採用」確定済、composable で十分 |
| E. 画面と composable を 1:1 で対応させる (常に page composable パターン) | 複数 page から使う Read (`useCurrentGroup` 等) の置き場が困る、再利用性低下、ドメイン責務がぼやける |
| F. page composable を完全禁止 (1 ユースケース単位のみ) | 連動 state / derived state を page に書くと太る、Phase 2 (stats-dashboard) で確実に必要になる |
| G. composable のエラーを exception (throw) で返す | ADR-005 §D1 で「`{data, error}` 形式」確定済、Vue/Nuxt エコシステムとの橋渡しコスト大 |
| H. App 識別子変換を page 側で行う | 同じ変換が page ごとに分散、SQL リファクタで全 page を直す羽目に。composable 内に閉じ込めるべき (ADR-005 §D3) |
| I. Read + Write 集約 (`useInvitation` で list + generate を 1 つに) | 「1 page で 2 composable を呼ぶのは Vue 標準」を活かせない。分割して `useGenerateInvitation` 内で `useListInvitations.refresh()` を呼べば連動も成立 (D2-3 / D5-4) |
| J. composable 内で `useToast` / `useNuxtApp` を直接呼んで UI 副作用を起こす | composable と UI チャネル composable (`useToastErrors` 等) を 1 ステップ分離 (ADR-005 §D4 と整合)、page が UI チャネルを決める |

## 補遺 (2026-05-30): D4-2 Write 系戻り値の確定 — error-handling.md §6.5 を正とする

auth-onboarding の kairo-design (architecture.md) で、**D4-2 の Write 系戻り値の例**と
`error-handling.md §6.5` (ADR-005 実装規約) の Write composable 例が矛盾していることが判明した。
本補遺で正規パターンを確定する (architecture.md §composable 構成 の 🟡 黄信号を 🔵 化)。

### 矛盾点

| 観点 | D4-2 本文の例 (旧) | error-handling.md §6.5 (新・正) |
|------|-------------------|--------------------------------|
| expose する状態 | 生の `error: Readonly<Ref<AppErrorCode \| null>>` | UI チャネル state (`notice` / `fieldErrors` 等) |
| エラーの行き先 | composable が `AppErrorCode` を保持し page が表示判断 | composable が UI チャネル composable (`useNoticeErrors` / `useFormErrors` / `useToastErrors`) を内部で呼び、決定木 (§6.2) で定まるチャネルに流す |
| 二重送信防止 | `pending: Readonly<Ref<boolean>>` を expose | (§6.5 の例は `pending` を省略) |

### 確定 (D4-2 を以下に更新)

1. **戻り値は error-handling.md §6.5 の「UI チャネル composable パターン」を正**とする。
   各 Write composable は、決定木 (§6.2) で定まる**チャネル state** を expose する:
   - フィールド検証エラー → `useFormErrors` を内部で呼び `fieldErrors` を expose (`useCreateGroup`)
   - 永続通知 → `useNoticeErrors` を内部で呼び `notice` を expose (`useJoinGroup`)
   - 一過性通知 → `useToastErrors` を内部で呼ぶ (`useGenerateInvitation` の toast 等)
2. **`pending` は全 Write composable で expose を継続**する。§6.5 の例には無いが、D4-2 が掲げた
   二重送信防止 (EDGE-003 / NFR-202、送信中ボタン disabled) の要件を満たすため必須。
   → 正規形は **「チャネル state + `pending`」**。生 `error: AppErrorCode` ref の expose は廃止。
3. **アクション関数は `Promise<{ data, error }>` を返してよい** (§6.5 の例も `return { data, error }`)。
   ただし page は raw `error` を表示判断に使わず、チャネル state (`notice` / `fieldErrors`) を見る。
   `error` は「成功/失敗の分岐 (例: 成功時のみ `navigateTo`)」にのみ用いる。

### D4-2 本文の例に含まれる不正確な記述 (architecture.md §既存 API 利用マッピング で訂正済)

D4-2 のコード例は説明用で、実際の API シグネチャと一部食い違う。**実装時は architecture.md の
「既存 API の利用マッピング」表を正**とする:

- 引数 `p_group_name` は誤り → 実際は `group_name` (生成済み型 `app/types/supabase.ts` 実測)。
- `UNIQUE_VIOLATION → GROUP_NAME_TAKEN` 分岐は誤り → `groups.name` に UNIQUE 制約は無く (CHECK のみ)、
  「同名重複」エラーは存在しない。create のエラーは `invalid_group_name` のみ。
- `useCreateGroup` は §6.5 では `.from('groups').insert(...)` 例だが、実装は
  `rpc('create_group_with_owner', { group_name })` を使う (RLS + RPC 経由、ADR-010 D2)。

> D1〜D3, D4-1, D4-3, D5〜D9 は変更なし。本補遺は D4-2 の「戻り値の形」のみを更新する。

## 関連メモリ

- `[[project-adr-candidates-pre-kairo-design]]`: 本 ADR は候補リストの「優先度 高 / ADR-007」を確定
- `[[feedback-test-coverage]]`: D8 のテスト方針 (境界値 + 分岐カバレッジ)
- `[[feedback-test-layer-separation]]`: D8 の mock unit / integration 2 レイヤー分離
- `[[project-players-vs-auth-users]]`: `players` (選手マスタ) と `group_members` (user×group 中間) の命名。後続単位の composable 名にも継承

## 参考

- Vue 3 公式 docs (Composables): https://vuejs.org/guide/reusability/composables.html
- Nuxt 4 公式 docs (auto-import for composables): https://nuxt.com/docs/guide/directory-structure/composables
- ADR-005 (エラーハンドリング戦略) §D1〜D4: composable 経由原則、識別子 1:1 マッピング、UI チャネル composable
- ADR-006 (1 ユーザー = 1 Group): `useCurrentGroup` の `.maybeSingle()` 前提
- ADR-008 (middleware 戦略) D4: `useAsyncData` キャッシュを middleware と共有
- ADR-010 (Supabase SSR/CSR 境界) D1 D7: `useSupabaseClient` の使用、`useAsyncData` キャッシュ戦略
- `docs/spec/auth-onboarding/requirements.md` REQ-406, REQ-407, NFR-301
- `docs/design/cross-cutting/error-handling.md` (ADR-005 実装規約)
