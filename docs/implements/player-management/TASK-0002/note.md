# TASK-0002 usePlayers コンテキストノート

**要件名**: player-management / **TASK-ID**: TASK-0002 / **作成日**: 2026-06-02
**タスク概要**: 所属 Group の未削除選手一覧を name 昇順で返す Read composable `app/composables/usePlayers.ts` を実装する（`useAsyncData<Player[]>('players', handler)` 固定キー）。

---

## 1. 技術スタック

- Nuxt 4 (Vue 3) + Nuxt UI v4 + TypeScript（strict mode、Composition API のみ）
- Supabase（PostgREST + RLS）、@nuxtjs/supabase（`useSupabaseClient<Database>()` / `useSupabaseUser()`）
- 状態取得は `useAsyncData` ベースの Read composable（auth-onboarding `useCurrentGroup` パターン踏襲）
- テスト: Vitest + @nuxt/test-utils（`defineVitestConfig`）
- アーキテクチャパターン: 固定キー `useAsyncData` で 1 ナビゲーション 1 クエリ（ADR-007 D4 / ADR-008 D4）。page/component は composable 経由でのみ supabase アクセス（REQ-403）。
- 参照元: `CLAUDE.md`, `docs/spec/player-management/note.md`, `vitest.config.ts`

## 2. 開発ルール

- doc は日本語（CLAUDE.md は英語）。
- テストは **最小境界値 + 分岐網羅のみ**（冗長ケース禁止、memory feedback_test_coverage）。
- ESLint: 1tbs brace style, no comma dangle。
- `useAsyncData` のキーは **必ず固定文字列 `'players'`**（動的キー禁止、ADR-007 D4）。
- handler は `error` を throw して `error.vue` グローバルフォールバックに委ねる（useToast 整形しない、useCurrentGroup と同方針）。
- `select` 列は `'id, name, handedness'` のみ（余分な列を取得しない）。
- 参照元: `CLAUDE.md`, `docs/tasks/player-management/TASK-0002.md`, `docs/spec/player-management/note.md`

## 3. 関連実装

- `app/composables/useCurrentGroup.ts` — **最重要参照**。同じ「Database 型付きクライアント + 固定キー共有」思想。`useSupabaseClient<Database>()` 取得 → `useCurrentGroup`/`useSupabaseUser` で id 読取 → `if (!gid) return []`/`null` ガード → `from().select().eq()...` → `if (error) throw error` → 素通し返却、という骨格を踏襲する。
- `tests/unit/composables/useCurrentGroup.test.ts` — **テスト mock 戦略の最重要参照**（後述 §5）。
- `app/types/player.ts` — TASK-0001 作成済み。`Player`（id/name/handedness）, `Handedness` union。usePlayers は `Player[]` を返す。
- 参照元: `app/composables/useCurrentGroup.ts`, `tests/unit/composables/useCurrentGroup.test.ts`, `app/types/player.ts`

## 4. 設計文書

- `docs/tasks/player-management/TASK-0002.md` — 実装スケルトン・テスト3件確定済み（全🔵）。
- `docs/design/player-management/interfaces.ts` — `UsePlayersReturn = AsyncState<Player[]>` 契約。`AsyncState<T> = { data: Ref<T|null>, pending: Ref<boolean>, error: Ref<Error|null>, refresh: () => Promise<void> }`。
- `docs/design/player-management/{architecture.md,dataflow.md,design-interview.md}` — 設計背景。
- データモデル（`supabase/migrations/20260519060000_initial_schema.sql`）:
  - `players(id, group_id NOT NULL, name, handedness CHECK(right/left/unknown) DEFAULT 'unknown', created_at, updated_at, deleted_at)`
  - 部分インデックス `idx_players_group_id ON players(group_id) WHERE deleted_at IS NULL`（NFR-001）
  - RLS `players_select = is_member_of(group_id)`、DELETE ポリシーなし（ソフト削除のみ）
- 参照元: `docs/tasks/player-management/TASK-0002.md`, `docs/design/player-management/interfaces.ts`, `docs/spec/player-management/note.md`

## 5. テスト関連情報

- 設定: `vitest.config.ts`（`defineVitestConfig`）。`include: ['tests/unit/**/*.test.ts']`、`*.integration.test.ts` は除外。`passWithNoTests: true`。
- テスト配置: `tests/unit/composables/*.test.ts`。本タスクは **`tests/unit/composables/usePlayers.test.ts`**。
- **mock 戦略（プロジェクト確立パターン = useCurrentGroup.test.ts を踏襲、ADR-012 D5）**:
  - `vi.hoisted()` で `fromMock`/`selectMock`/`eqMock`/`isMock`/`orderMock`/`useAsyncDataMock`/`groupRef` を先に定義（TDZ 回避）。
  - クエリビルダチェーンは `from → select → eq → is → order` の順でモック関数を返す（usePlayers のクエリ順）。末端 `order` が `{ data, error }` を resolve する thenable/Promise を返す。
  - `useAsyncDataMock` は handler を即時 await 実行し `{ data: ref(result), pending: ref(false), error: ref(null), refresh: vi.fn() }` を返すスタブ（これを忘れると data.value が null になる）。
  - `vi.mock('#imports', ...)` + `vi.mock('#supabase-client', ...)` + `vi.mock('#async-data', ...)` の3点で auto-import を差し替える（Nuxt Vite transform が `useSupabaseClient`/`useAsyncData` を直接パスに変換するため `#imports` だけでは効かない）。`useCurrentGroup` を差し替える場合は本 composable が直接 import する `~/composables/useCurrentGroup` を `vi.mock` する（`#supabase-user` ではない点に注意）。
  - `vitest.config.ts` の alias: `#supabase-client` / `#async-data` / `#supabase-user` / `#nuxt-router` が登録済み。
  - `beforeEach` で `vi.clearAllMocks()` + `order.mockResolvedValue(...)` 再設定 + `groupRef` を `{ value: { group_id: 'g1' } }` に初期化。
  - **注意**: TASK-0002.md の inline テストは `vi.stubGlobal` 方式で簡略化して書かれているが、プロジェクト確立パターンは上記 `vi.hoisted + vi.mock` 方式。tdd-red 実装時は useCurrentGroup.test.ts に揃えるか、`vi.stubGlobal` でも通るか確認のうえ方式を確定する。
- 参照元: `vitest.config.ts`, `tests/unit/composables/useCurrentGroup.test.ts`, `tests/unit/composables/useGenerateInvitation.test.ts`

## 6. 注意事項

- **技術的制約**: handler は `useCurrentGroup()` の `group_id`（`.data.value?.group_id`）を読む。`group_id` 未取得（未所属/未認証）時は **クエリ未発行で `[]` を返す**（`from('players')` を呼ばない）。
- **クエリ必須要素**: `select('id, name, handedness')` / `eq('group_id', gid)` / `is('deleted_at', null)` / `order('name')` を全て含む。`eq('group_id', gid)` は RLS と二重だが部分インデックス活用とテスト検証性のため明示（NFR-001）。
- **`handedness` narrow**: 生成型では `string` だが select 列が CHECK 制約列のみのため `as Player[]` で narrow する。0 件は空配列。
- **後続連携**: 追加/編集/削除（TASK-0003〜0005）後の一覧更新は page 側で `usePlayers().refresh()`（同一固定キーで再取得）。
- **統合テスト**: 実 RLS 経路の検証は TASK-0008（一覧 page / 受入検証）へ委譲。Phase 1 はモック単体テストのみ。
- **UI/UX**: 本タスクは UI を持たない（N/A）。
- 参照元: `docs/tasks/player-management/TASK-0002.md`, `docs/spec/player-management/note.md`
