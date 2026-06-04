# player-management コンテキストノート

**作成日**: 2026-06-01

## 技術スタック

- Nuxt 4 (Vue 3) + Nuxt UI v4 + TypeScript（CLAUDE.md）
- Supabase（PostgREST + RLS）、@nuxtjs/supabase
- i18n（@nuxtjs/i18n、ja/en）、Zod（バリデーション）
- 状態取得は `useAsyncData` ベースの composable（auth-onboarding パターン踏襲）

## 確定済みの土台（data-foundation 由来）

### players テーブル（`supabase/migrations/20260519060000_initial_schema.sql`）
```sql
CREATE TABLE players (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES groups(id),
  name       text NOT NULL,
  handedness text NOT NULL DEFAULT 'unknown'
    CHECK (handedness IN ('right', 'left', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,                        -- ソフト削除
  CONSTRAINT players_name_length_check
    CHECK (char_length(trim(name)) BETWEEN 1 AND 50),
  CONSTRAINT players_group_id_id_key UNIQUE (group_id, id)
);
CREATE INDEX idx_players_group_id ON players(group_id) WHERE deleted_at IS NULL;
```

### RLS（players）
- `players_select`: `is_member_of(group_id)`
- `players_insert`: `is_member_of(group_id)`
- `players_update`: `is_member_of(group_id)`
- **DELETE ポリシーなし** → 物理削除不可、削除は `deleted_at` の UPDATE のみ

### 重要な前提
- **group_members にロール列が無い** → owner/member 区別なし。メンバー全員が選手管理可。
- ADR-006: 1 ユーザー = 1 グループ。current group は auth-onboarding `useCurrentGroup()` で取得。
- players は auth.users と非連動（`user_id` 列を持たない）。
- matches は player.id を参照（4 選手が同一 Group・全員別人を強制）。

## 関連実装（再利用候補）

- `app/composables/useCurrentGroup.ts` — 現在の Group 取得（同一キー共有パターン）
- auth-onboarding の Zod schema（`group-name.ts`）— name バリデーションの実装パターン
- `app/composables/useErrorMessage` / `useToastErrors` / `useNoticeErrors` — エラーチャネル
- i18n locales 構造一致 CI チェック（TASK-0004）

## 開発ルール

- doc は日本語（CLAUDE.md は英語）。memory feedback_doc_language。
- テストは最小境界値 + 分岐網羅のみ（memory feedback_test_coverage）。
- page/component から supabase 直叩き禁止、composable 経由（REQ-403）。

## 注意事項

- 重複名は**許可**（ヒアリング2026-06-01）→ name UNIQUE 化の追加 migration は不要。
- 削除は**無警告ソフト削除**（ヒアリング2026-06-01）。
- 検索・絞り込み、undelete UI は MVP 範囲外。
- 依存: 本単位は match-management / match-recording の上流（選手モデルがそれらの前提）。
