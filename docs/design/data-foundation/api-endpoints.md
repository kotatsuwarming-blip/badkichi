# data-foundation API エンドポイント仕様

**作成日**: 2026-04-22
**関連設計**: [architecture.md](architecture.md), [dataflow.md](dataflow.md), [database-schema.sql](database-schema.sql), [interfaces.ts](interfaces.ts)
**関連要件**: REQ-005, REQ-101, REQ-102, REQ-103, REQ-201, REQ-202

**【信頼性レベル凡例】**:
- 🔵 **青信号**: 要件定義書・設計文書・ヒアリングで確実
- 🟡 **黄信号**: 妥当な推測
- 🔴 **赤信号**: 推測

---

## このドキュメントの位置づけ 🔵

**信頼性**: 🔵 *PRD §5.1 アーキテクチャ + ヒアリング 2026-04-16*

badkichi は BaaS（Supabase）直結アーキテクチャを採用しており、**独自の REST API サーバーは持たない**。
クライアント（Nuxt）は `@supabase/supabase-js` を通じて直接 PostgREST / Auth API / RPC を呼び出す。

したがって本ドキュメントの「API エンドポイント」は以下の 3 種類を指す:

| 種別 | 呼び出し方 | 提供元 |
|------|-----------|--------|
| **PostgREST API** | `supabase.from('table').select/insert/update()` | Supabase が自動生成 |
| **RPC 関数** | `supabase.rpc('func_name', args)` | 自作の PostgreSQL 関数 |
| **Auth API** | `supabase.auth.signInWithOAuth(...)` 等 | Supabase 提供 |

すべての呼び出しは RLS（Row Level Security）で自動フィルタされるため、
「認可ロジック」をクライアントやサーバールートで実装する必要はない（REQ-101, NFR-104）。

## 認証の前提 🔵

**信頼性**: 🔵 *REQ-002, REQ-010, REQ-201*

- 認証方式: **Google OAuth のみ**（Email/Password は明示的に無効化）
- 未認証時（`anon` ロール）: すべてのテーブルへのアクセスが RLS で拒否される
- 認証済み時（`authenticated` ロール）: RLS ポリシー `is_member_of(group_id)` により、
  自分が所属する Group のデータのみアクセス可能

### Auth API（Supabase 提供） 🔵

| メソッド | 用途 | 関連要件 |
|---------|------|---------|
| `supabase.auth.signInWithOAuth({ provider: 'google' })` | Google ログイン開始 | REQ-002 |
| `supabase.auth.signOut()` | ログアウト | — |
| `supabase.auth.getUser()` / `useSupabaseUser()` | 現在のユーザー取得 | — |
| `supabase.auth.onAuthStateChange(callback)` | 認証状態の購読 | — |

`@nuxtjs/supabase` が JWT の Cookie 管理と redirect（`/login` / `/confirm`）を自動化する。
具体的な UI フローは **auth-onboarding 単位** の責務。

---

## テーブル CRUD API（PostgREST 自動生成）

### エンドポイントパターン 🔵

**信頼性**: 🔵 *Supabase PostgREST 仕様*

```
SELECT:  supabase.from('<table>').select('<columns>').eq(...).order(...)
INSERT:  supabase.from('<table>').insert({ ... }).select()
UPDATE:  supabase.from('<table>').update({ ... }).eq('id', ...).select()
DELETE:  (MVP では使用しない。REQ-402)
```

- `deleted_at IS NULL` 絞り込みは **アプリ側で `.is('deleted_at', null)` を付ける**
  （MVP では常に NULL のため実質無影響、将来の論理削除移行時に効く）
- すべての操作は RLS 適用後に実行される

### テーブル別 API 仕様（主要テーブル）

凡例:
- 📖 = SELECT 可（RLS: `is_member_of(group_id)`）
- ✍️ = INSERT 可
- 🔁 = UPDATE 可
- 🚫 = DELETE 不可（MVP、REQ-402）
- 🔒 = RLS により Group 外アクセス拒否

#### groups 🔵

**信頼性**: 🔵 *PRD §5.2, REQ-101, REQ-202, ⑦ A-1 + A-2*

| 操作 | 可否 | 備考 |
|------|:---:|------|
| SELECT | 📖 | 自分が所属する Group のみ |
| INSERT | 🚫 | **INSERT 不可。`create_group_with_owner` RPC 経由のみ。** (⑦ A-1 + A-2) |
| UPDATE | 🔁 | 所属メンバーのみ |
| DELETE | 🚫 | MVP 対象外 |

**Group 作成**: 直接 INSERT は RLS で禁止されている。`create_group_with_owner` RPC を呼び出す
(groups INSERT + group_members INSERT が 1 トランザクションで原子化される)。

```ts
const { data: groupId, error } = await supabase.rpc(
  'create_group_with_owner',
  { group_name: '○○バドミントンクラブ' }
)
```

#### group_members 🔵

**信頼性**: 🔵 *PRD §5.2, REQ-101, ⑦ A-1 + A-2*

| 操作 | 可否 | 備考 |
|------|:---:|------|
| SELECT | 📖 | 同じ Group のメンバー一覧を閲覧可 |
| INSERT | 🚫 | **INSERT 不可。`create_group_with_owner` または `join_group_with_code` RPC 経由のみ。** (⑦ A-1 + A-2) |
| UPDATE | 🔁 | 通常は不要（MVP で使用しない） |

**理由**: 直接 INSERT を許す場合「任意の `group_id` に自分を勝手に追加できる」攻撃面 (UUID 推測前提) と
「孤児 Group」(groups だけ作成して group_members 追加に失敗) リスクが残るため、両方の経路を RPC に閉じる。

#### group_invitations 🔵

**信頼性**: 🔵 *REQ-102, EDGE-101*

| 操作 | 可否 | 備考 |
|------|:---:|------|
| SELECT | 📖 | 自 Group の招待コード一覧（管理 UI 用） |
| INSERT | 🚫 | 直接 INSERT 禁止（`generate_invitation_code` RPC 経由） |
| UPDATE | 🚫 | MVP 対象外 |

#### players 🔵

**信頼性**: 🔵 *PRD §5.2, REQ-101*

| 操作 | 可否 | 備考 |
|------|:---:|------|
| SELECT | 📖 | 自 Group の選手一覧 |
| INSERT | ✍️ | 選手登録 |
| UPDATE | 🔁 | 名前・利き手の変更 |

**入力 (Insert)**: `{ group_id, name, handedness? }`

#### matches / sets / set_player_positions / rallies / shots / position_overrides 🔵

**信頼性**: 🔵 *PRD §5.2, REQ-101*

全テーブル共通:

| 操作 | 可否 | 備考 |
|------|:---:|------|
| SELECT | 📖 | FK 経由で Group 判定 |
| INSERT | ✍️ | FK 経由で Group 判定 |
| UPDATE | 🔁 | FK 経由で Group 判定 |

詳細な入力カラムは [database-schema.sql](database-schema.sql) の各テーブル定義を参照。
これらのテーブルは **match-management / rally-recording 単位** で使用される。

**スコア取得 (② B-7)**: `sets.score_team_a/b` および `rallies.score_team_a_after/b_after` は
廃止されたため、スコアは `rallies.point_winner` の COUNT 集計で取得する。

```ts
// Team A の現在スコア (セット内、point_winner = 'A' のラリー数)
const { count } = await supabase
  .from('rallies')
  .select('*', { count: 'exact', head: true })
  .eq('set_id', setId)
  .eq('point_winner', 'A')
  .is('deleted_at', null)
```

**動画タイムスタンプ (⑥ B-14)**: `rallies.video_start_timestamp_ms` および `shots.video_timestamp_ms` は
ms 単位 integer。フロントの `HTMLMediaElement.currentTime` (秒、double) は composable 境界で
`Math.round(currentTime * 1000)` の 1 行変換を行う。

#### recording_gaps 🔵

**信頼性**: 🔵 *② B-7、設計原則 6*

動画断絶イベント (per-rally フラグではなく独立テーブル) の CRUD。

| 操作 | 可否 | 備考 |
|------|:---:|------|
| SELECT | 📖 | FK 経由 (sets → matches → group_id) で Group 判定 |
| INSERT | ✍️ | 同上 |
| UPDATE | 🔁 | 同上 |
| DELETE | 🚫 | MVP 対象外 (REQ-402) |

**入力 (Insert)**:
```ts
{
  set_id: string                    // 対象セット
  after_rally_number: number | null // NULL = セット冒頭での断絶
  resumed_score_team_a: number | null // NULL = ユーザーも再開時スコア不明
  resumed_score_team_b: number | null
  note: string | null
}
```

RLS は `is_member_of` 経由で、対象 set が属する match の group に所属していれば許可される。
MVP UI ではこのテーブルは使わず、将来の分析ユースケース向けに枠だけ用意する。

### 共通の読み取りパターン 🔵

**信頼性**: 🔵 *Supabase PostgREST 標準*

```ts
// 1. ネスト SELECT（JOIN）
supabase
  .from('matches')
  .select('*, sets(*, rallies(*, shots(*)))')
  .eq('id', matchId)

// 2. COUNT 取得
supabase
  .from('players')
  .select('*', { count: 'exact', head: true })

// 3. 論理削除フィルタ（将来用）
supabase
  .from('players')
  .select('*')
  .is('deleted_at', null)
```

---

## RPC 関数 API

### create_group_with_owner 🔵

**信頼性**: 🔵 *⑦ A-1 + A-2, ⑩ A-3*

新規 Group を作成し、呼び出しユーザを `group_members` に追加する操作を 1 トランザクションで原子化する。
`groups` および `group_members` の直接 INSERT は RLS で禁止されており、Group 作成はこの RPC のみ。

| 項目 | 内容 |
|------|------|
| 呼び出し | `supabase.rpc('create_group_with_owner', { group_name })` |
| 引数 | `group_name: string` (1〜50 文字、trim 後) |
| 戻り値 | `string` (新規 `group_id`、uuid) |
| SECURITY | `SECURITY DEFINER`（内部で `auth.uid()` を参照） |

**処理フロー**:
1. `auth.uid() IS NULL` なら `not_authenticated` エラー
2. `group_name` の長さ (trim 後 1〜50 文字) を検証 → NG なら `invalid_group_name` エラー
3. `groups (name)` に INSERT
4. `group_members (group_id, user_id)` に INSERT (作成者を追加)
5. 新規 `group_id` を返す

**エラー**:
| メッセージ | 発生条件 |
|-----------|---------|
| `not_authenticated` | 未認証で呼び出された (`auth.uid()` が NULL) |
| `invalid_group_name` | `group_name` が NULL / 空白のみ / 51 文字以上 |

**クライアント例**:
```ts
const { data: groupId, error } = await supabase.rpc(
  'create_group_with_owner',
  { group_name: '○○バドミントンクラブ' }
)
if (error) {
  if (error.message.includes('invalid_group_name')) { /* バリデーションエラー */ }
  return
}
// groupId: 新規 Group の UUID。続けて navigateTo(`/groups/${groupId}`) 等
```

### generate_invitation_code 🔵

**信頼性**: 🔵 *REQ-102, NFR-103, EDGE-101, ヒアリング 2026-04-16 Q7, ⑧ B-12*

Group 管理者が招待コードを発行する。

| 項目 | 内容 |
|------|------|
| 呼び出し | `supabase.rpc('generate_invitation_code', { target_group_id })` |
| 引数 | `target_group_id: string` (uuid) |
| 戻り値 | `string` (8 文字の大文字 hex) |
| SECURITY | `SECURITY DEFINER`（内部で `auth.uid()` を参照） |

**処理フロー (⑧ B-12)**:
1. `is_member_of(target_group_id)` チェック → NG なら `not_a_member` エラー
2. CSPRNG (`gen_random_uuid()`) から 8 hex 文字を抽出し大文字化
3. `group_invitations` に INSERT（`expires_at = now() + interval '7 days'`）
4. UNIQUE 衝突した場合は **最大 5 回までリトライ**（コード再生成 + 再 INSERT）
5. 全リトライ失敗時は `invitation_code_collision_after_retry` エラー
6. 成功したらコードを返す

**エラー**:
| メッセージ | 発生条件 |
|-----------|---------|
| `not_a_member` | 呼び出しユーザーが `target_group_id` に未所属 |
| `invitation_code_collision_after_retry` | UNIQUE 衝突を 5 回連続で発生 (事実上ゼロ確率) |

**クライアント例**:
```ts
const { data: code, error } = await supabase.rpc(
  'generate_invitation_code',
  { target_group_id: groupId }
)
if (error) {
  if (error.message.includes('not_a_member')) { /* 権限エラー表示 */ }
  if (error.message.includes('invitation_code_collision_after_retry')) {
    /* 再試行を促す。実運用では発生しない想定 */
  }
  return
}
// code: 'A7B3K9X2' 等
```

### join_group_with_code 🔵

**信頼性**: 🔵 *REQ-103, EDGE-001, EDGE-002*

招待コードで Group に参加する。

| 項目 | 内容 |
|------|------|
| 呼び出し | `supabase.rpc('join_group_with_code', { invite_code })` |
| 引数 | `invite_code: string` (8 文字英数字) |
| 戻り値 | `string` (参加した `group_id`) |
| SECURITY | `SECURITY DEFINER` |

**処理フロー**:
1. `group_invitations` から `code = invite_code AND deleted_at IS NULL` を検索
2. 該当なしなら `invitation_not_found` エラー
3. `expires_at < now()` なら `invitation_expired` エラー
4. `group_members` に `(group_id, auth.uid())` INSERT
   - 二重参加はユニーク制約で弾かれる（EDGE-002、PostgreSQL エラーコード `23505`）
5. `group_id` を返す

**エラー**:
| メッセージ / コード | 発生条件 |
|-------------------|---------|
| `invitation_not_found` | コードが存在しない |
| `invitation_expired` | コードが期限切れ |
| PostgrestError code `23505` | 既にその Group に参加済み |

**クライアント例**:
```ts
const { data: groupId, error } = await supabase.rpc(
  'join_group_with_code',
  { invite_code: code }
)
if (error) {
  switch (true) {
    case error.message.includes('invitation_not_found'):
      /* コードが見つかりません */ break
    case error.message.includes('invitation_expired'):
      /* コードの有効期限切れです */ break
    case error.code === '23505':
      /* すでに参加済みです */ break
    default:
      /* 予期しないエラー */ break
  }
  return
}
```

### is_member_of 🔵

**信頼性**: 🔵 *RLS ヘルパー関数*

RLS ポリシー内部で使用するヘルパー。クライアントから直接呼び出すことは通常ない。

| 項目 | 内容 |
|------|------|
| 引数 | `target_group_id: uuid` |
| 戻り値 | `boolean` |
| SECURITY | `SECURITY DEFINER`, `STABLE`, `SQL` |

---

## エラーハンドリング指針 🔵

**信頼性**: 🔵 *Supabase JS クライアント仕様*

> **横断規約は [ADR-005](../../decisions/005-error-handling-strategy.md) で確定。
> 識別子集約・変換 composable・UI チャネル決定木・i18n・Sentry の実装規約は
> [`docs/design/cross-cutting/error-handling.md`](../cross-cutting/error-handling.md)
> を参照すること。** 本セクションは Supabase 側のエラーオブジェクト形と
> PostgreSQL SQLSTATE 一覧のみを残す (data-foundation 固有の参照情報)。

### エラーオブジェクトの形

PostgREST 系（CRUD / RPC）:
```ts
{
  code: string       // PostgreSQL SQLSTATE (例: '23505', '42501')
  message: string    // 人間可読メッセージ。RAISE EXCEPTION のメッセージが入る
  details: string | null
  hint: string | null
}
```

Auth 系:
```ts
{
  name: string       // 'AuthApiError' 等
  message: string
  status: number     // HTTP ステータス相当
}
```

### data-foundation で発生する標準的なエラー種別

| エラー | PostgreSQL code | 発生箇所 |
|--------|----------------|----------|
| RLS 拒否 | なし（空結果） | SELECT |
| RLS 拒否 | `42501` | INSERT/UPDATE |
| ユニーク制約違反 | `23505` | INSERT |
| FK 違反 | `23503` | INSERT |
| CHECK 違反 | `23514` | INSERT/UPDATE |
| RPC カスタム例外 | `P0001` | RPC (RAISE EXCEPTION のメッセージで識別子判定) |

UI チャネル選択 / 文言変換 / 認証切れ時のリダイレクト等は cross-cutting 文書の
決定木と composable 規約に従う。

---

## Realtime API 🟡

**信頼性**: 🟡 *MVP では未使用、将来検討*

Supabase は Postgres Changes Realtime に対応するが、MVP では使用しない方針。
リアルタイム共同編集（複数端末同時記録等）が必要になった時点で検討する。

---

## バージョニング方針 🔵

**信頼性**: 🔵 *Supabase PostgREST 仕様*

- PostgREST API はスキーマそのものがインターフェイス
- 破壊的変更（カラム削除・リネーム）は避け、追記のみでスキーマを進化させる（NFR-302）
- カラム追加は後方互換。UPDATE 時は変更するカラムのみ指定するのが前提

---

## 関連文書

- **アーキテクチャ**: [architecture.md](architecture.md)
- **データフロー**: [dataflow.md](dataflow.md)
- **DB スキーマ**: [database-schema.sql](database-schema.sql)
- **型定義**: [interfaces.ts](interfaces.ts)
- **要件定義**: [requirements.md](../../spec/data-foundation/requirements.md)

---

## 信頼性レベルサマリー

- 🔵 青信号: 16 項目（約 94%）
- 🟡 黄信号: 1 項目（Realtime 未使用方針）
- 🔴 赤信号: 0 項目

**品質評価**: 高品質
