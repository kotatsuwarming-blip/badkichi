# match-management コンテキストノート

**作成日**: 2026-06-02

## 技術スタック

- Nuxt 4 (Vue 3) + Nuxt UI v4 + TypeScript（strict mode）（CLAUDE.md / package.json）
- Supabase（PostgREST + RLS）、@nuxtjs/supabase v2
- i18n（@nuxtjs/i18n v10、ja/en、`no_prefix`、locales は `i18n/locales/*.json`）
- Zod v4（バリデーション）
- Vitest v4 + @vue/test-utils + happy-dom（テスト）、@nuxt/test-utils
- Sentry（@sentry/nuxt、想定外エラーの捕捉）
- 状態取得は `useAsyncData` ベースの composable（auth-onboarding / player-management パターン踏襲）

## match-management の位置付け

ADR-002 で決定された MVP 単位群のうちの「試合（match）のマスタ管理」単位。

- **依存**: player-management → **match-management** → match-recording
  - 上流の player-management が `players` テーブル（選手マスタ）を消費可能な状態にする
  - 本単位は試合（カード）を作成・管理し、match-recording がその試合に対してラリーを記録する
- **被依存**: match-recording（試合の sets / rallies を本単位の matches に紐付ける）、stats-dashboard
- **構造**: player-management と同じ「既存 DB（data-foundation 確定スキーマ）を消費する UI + composable 層」。
  新規テーブル・新規 RPC は作らない。ただし**例外として** `matches` に試合名・試合日付の列を加える
  **additive migration を 1 本 data-foundation 側に追加する**（2026-06-05 ヒアリングで確定。requirements.md
  §スキーマ拡張 / REQ-007/008/108/109/408 参照）: `ADD COLUMN name text`（任意・1〜50字 CHECK）/
  `ADD COLUMN match_date date`（必須運用・一覧の管理/並びキー）。`video_source_url` は NOT NULL 維持
  （local は元ファイル名ラベル、youtube は URL）。

## 確定済みの土台（data-foundation 由来）

### matches テーブル（`supabase/migrations/20260519060000_initial_schema.sql`）

```sql
CREATE TABLE matches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id            uuid NOT NULL REFERENCES groups(id),
  team_a_player1_id   uuid NOT NULL,
  team_a_player2_id   uuid NOT NULL,
  team_b_player1_id   uuid NOT NULL,
  team_b_player2_id   uuid NOT NULL,
  video_source_type   text NOT NULL CHECK (video_source_type IN ('youtube', 'local')),
  video_source_url    text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,                       -- ソフト削除
  -- ④ B-10 案1: 4 選手が全員別人 (6-way 不等号)
  CONSTRAINT matches_players_distinct_check CHECK (
    team_a_player1_id <> team_a_player2_id
    AND team_b_player1_id <> team_b_player2_id
    AND team_a_player1_id <> team_b_player1_id
    AND team_a_player1_id <> team_b_player2_id
    AND team_a_player2_id <> team_b_player1_id
    AND team_a_player2_id <> team_b_player2_id
  ),
  -- ④ B-10 案2: 複合 FK で「4 選手は全員 group_id と同一 Group 所属」を DB レベルで強制
  FOREIGN KEY (group_id, team_a_player1_id) REFERENCES players(group_id, id),
  FOREIGN KEY (group_id, team_a_player2_id) REFERENCES players(group_id, id),
  FOREIGN KEY (group_id, team_b_player1_id) REFERENCES players(group_id, id),
  FOREIGN KEY (group_id, team_b_player2_id) REFERENCES players(group_id, id)
);
CREATE INDEX idx_matches_group_id ON matches(group_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_matches_updated_at BEFORE UPDATE ON matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### RLS（matches）

- `matches_select`: `is_member_of(group_id)`
- `matches_insert`: `is_member_of(group_id)`（WITH CHECK）
- `matches_update`: `is_member_of(group_id)`
- **DELETE ポリシーなし** → 物理削除不可。削除は `deleted_at` の UPDATE のみ（players と同方針）。

### 消費する既存資産（有無とスキーマ）

| テーブル | 状態 | match-management での用途 |
|---|---|---|
| `players` | 確定済（player-management が CRUD 提供） | 4 選手の選択肢（自 Group・未削除）。`usePlayers()` 再利用候補 |
| `groups` | 確定済 | matches.group_id は `useCurrentGroup()` の group_id を付与 |
| `matches` | **確定済 + 本単位で additive 列追加**（name / match_date） | 本単位が作成・一覧・編集・ソフト削除する対象 |
| `sets` / `set_player_positions` | 確定済 | **本単位のスコープ外**。match-recording が試合記録開始時に作成 |

### 試合の前提（matches の制約から確定）

- **ダブルス固定**: matches は team_a × 2 + team_b × 2 の 4 選手列を必ず持つ。
  シングルス／トリプルスは MVP スコープ外（rule-engine NFR-201 で将来の抽象化のみ言及）。
- **4 選手は全員別人かつ同一 Group**: DB で CHECK + 複合 FK により二重保証。
  → composable / UI 側でも事前に「重複選択不可」「他 Group 不可（自 Group のみ提示）」を担保すると UX が良い。
- **動画ソースは必須**: `video_source_type`（'youtube' | 'local'）と `video_source_url` が NOT NULL。
  - 試合作成時に動画ソース種別 + URL（または local 識別子）の入力が必須。
  - 実際の再生は video-playback 単位の責務（local は方式A=都度再選択、CSR 限定。memory project_video_playback_spec）。

### rule-engine が定義する試合形式・スコアリングの前提

rule-engine（純 TS ロジック、DB 非依存）が試合形式とスコアの真の定義を持つ。match-management が
試合作成 UI で扱う設定値はこの前提に合わせる（ただし sets レコード生成自体は match-recording の責務）：

- **SetConfig**（`docs/design/rule-engine/interfaces.ts`）: `targetPoints`（例 21 / 15）、
  `enableDeuce`、`deucePointCap`（例 30）、`firstServingTeam`。
  → sets テーブルの `target_points` / `enable_deuce` / `deuce_point_cap` / `first_serving_team` と 1:1。
- **試合形式**: 3 セットマッチ（先に 2 セット取得で勝利、rule-engine REQ-008、🟡）。
  PRD の `set_target_points: [21, 21, 15]` を前提（第 3 セットのみ 15 点等のバリエーションあり）。
- **デュース**: 30 点キャップ / デュースなし等のバリエーションは rule-engine が対応。
- match-management 自体はスコアを持たない（スコアは rallies の集計で導出。② B-7）。

## 関連実装・設計文書（再利用候補）

- **player-management（直前の同型単位、最良の手本）**:
  - `app/composables/usePlayers.ts`（固定キー useAsyncData の実装パターン）
  - `app/composables/useCreatePlayer.ts` / `useUpdatePlayer.ts` / `useDeletePlayer.ts`（Write 系の `{data, error}` 戻り）
  - `app/schemas/player-name.ts`（Zod 検証パターン）、`app/types/player.ts`（ドメイン型 narrow）
  - `docs/design/player-management/architecture.md` / `interfaces.ts` / `dataflow.md`（設計フォーマットの手本）
- `app/composables/useCurrentGroup.ts` — group_id 取得（ADR-006 下で 1 user = 1 group）
- cross-cutting エラーチャネル composable: `useErrorMessage` / `useFormErrors` / `useNoticeErrors` / `useToastErrors`（ADR-005）
- data-foundation: `database-schema.sql` / `interfaces.ts` / `api-endpoints.md`（matches 周辺の正本）
- video-playback の設計（matches.video_source_type/url の消費側、CSR 境界の参考）

## 開発ルール（ADR）

- **ADR-002**: 要件分割方針（match-management の単位境界の根拠）。
- **ADR-005**: エラーハンドリング戦略。全 composable は Supabase native `{data, error}` 形で返す。
  page から `supabase.from(...)` 直叩き禁止 → 必ず composable 経由。
  検証 → Zod inline / RLS・PostgREST → toast / 想定外 → error.vue + Sentry。
  **本単位も新規 APP_ERROR_CODE は原則追加しない**見込み（player-management と同方針）。
- **ADR-007**: composable 階層と命名規約。domain composable を**操作ごとに分割**
  （`useMatches` Read / `useCreateMatch` / `useUpdateMatch` / `useDeleteMatch` 等）。
  Read 系は `useAsyncData<T>('matches', …)` 固定キーで共有キャッシュ（D4）。Write 後は `refresh()`。
- **ADR-008**: middleware 戦略。`auth.global.ts` 1 本で全 page の認証 + Group 所属を保証。
  match 系 page は到達時点で「認証済み・所属済み」が保証される（個別ガード不要）。
- **ADR-010**: Supabase Client の SSR/CSR 境界。page/component/composable からは
  isomorphic な `useSupabaseClient()` / `useSupabaseUser()` を使う。
  `serverSupabaseClient` 等の server-only API は使わない（MVP は server route を作らない）。
  `'/' prerender は削除`済（D6）。
- **ADR-011**: レイアウト戦略。認証後 page は `default` layout を自動適用（明示 `definePageMeta` 不要）。
- **ADR-012**: テスト戦略。mock unit（`*.test.ts`、pre-commit + CI）と integration（`*.integration.test.ts`、
  CI 専用・実 Supabase）の 2 レイヤー分離。テストは最小境界値 + 分岐網羅のみ（memory feedback_test_coverage）。

## 注意事項（命名・パターン・テスト・SSR/CSR）

- **命名規約**: ESLint 1tbs brace style / no comma dangle。Vue SFC + `<script setup lang="ts">`、
  Composition API のみ。composable は `useXxx`、Read/Write を操作ごとに分割（ADR-007）。
- **composable パターン**: `useCurrentGroup().data.value?.group_id` を読み、未取得時はクエリ未発行で
  空配列／早期 return。SELECT は `.eq('group_id', gid).is('deleted_at', null)`（RLS と二重 + 部分インデックス対象）。
- **ルーティング**: player-management に倣い `/groups/[id]/matches` 系が自然
  （`[id]` は useCurrentGroup の group_id）。一覧 + UModal で作成／編集、削除はソフト削除。
- **4 選手選択 UI**: 自 Group・未削除選手のみを選択肢に。重複選択を UI で防止
  （DB CHECK 違反を事前に回避）。選手 0〜3 人の場合は試合作成不可の空状態／導線を検討。
- **動画ソース入力**: video_source_type + url を必須入力。youtube は URL、local は方式A前提で
  URL に何を格納するかを video-playback 仕様と整合させる（要確認ポイント）。
- **テスト方針**: mock unit でロジック検証（happy-dom + vue-i18n auto-import mock、video-playback の
  component テスト方針を踏襲）。integration（RLS / 複合 FK / CHECK 違反）は `*.integration.test.ts` で CI 専用。
  共有 DB の integration は `fileParallelism: false`。
- **SSR/CSR 境界**: nuxt.config は `ssr` 既定（明示無効化なし）= SSR デフォルト。
  match-management の一覧・作成 page は SSR/CSR 両対応の isomorphic composable で問題なし。
  動画再生（local）に踏み込む部分のみ CSR 限定だが、それは video-playback の責務。

## オープン論点（kairo-requirements / design で確定する）

- 試合作成時に sets 設定（target_points 等）まで入力させるか、match-recording 開始時に委ねるか。
- local 動画の `video_source_url` の具体的な格納内容（再選択方式Aとの整合）。
- 一覧の並び順・絞り込み（player-management 同様、検索/undelete は MVP 範囲外の見込み）。
- 試合の重複（同一 4 選手・同一動画）を許可するか（players は重複名許可だった）。
</content>
</invoke>
