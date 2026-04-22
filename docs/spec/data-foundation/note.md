# data-foundation コンテキストノート

**作成日**: 2026-04-17

## 技術スタック

- Nuxt 3 (Vue 3 + TypeScript strict mode)
- pnpm
- Supabase（PostgreSQL + Auth）
- Supabase CLI（マイグレーション運用）
- Zod（バリデーション）
- ESLint（@nuxt/eslint、1tbs、no comma dangle）
- Vitest（rule-engine で採用済み）

## 開発ルール

- TDD は純ロジック部分（rule-engine など）に適用。マイグレーション SQL・RLS ポリシーは DDL
  の適用→検証（SQL 実行結果）で検証する
- ドキュメントは日本語（CLAUDE.md のみ英語）
- ファイルパスはプロジェクトルート相対

## 関連する既存実装

- `app/utils/rule-engine/` — rule-engine（純 TS、DB 非依存）
  - `types.ts` に `GameState`, `RallyResult`, `SetConfig`, `SetPlayerPosition` 等
  - data-foundation ではこれらの型にマッピングするスキーマを定義する必要がある

## 関連する設計文書

- `.dcs/20260328153038_badminton_analytics/prd.md` — PRD 全体
  - §5.2 データモデル: Group, GroupMember, Player, Match, Set, SetPlayerPosition, Rally, Shot, PositionOverride
  - §4 非機能要件: 認証（Supabase Auth）、バックアップ
- `docs/decisions/002-requirements-splitting.md` — 7 単位分割方針
- `docs/decisions/004-add-auth-onboarding-unit.md` — 7→8 単位への改訂

## 注意事項

- **マルチテナント**: 全データに group_id を持たせ、PostgreSQL RLS で「自分の所属 Group のみ」に制限
- **認証**: Supabase Auth の Google OAuth を利用。YouTube 動画アクセスと同アカウントで統一可能
- **dev/prod 分離**: Supabase Cloud に 2 プロジェクト作成。ローカル Supabase は使わない
- **UI は別単位**: ログイン・サインアップ・招待コード入力 UI は `auth-onboarding` 単位（ADR-004）
- **削除ポリシー**: MVP では削除機能は実装しない。将来 deleted_at による論理削除に移行する前提で
  テーブル設計時にカラムを入れておくか判断が必要
- **seed.sql は枠組みのみ**: data-foundation では仕組み（`pnpm db:reset` 相当）だけ整備。
  各 UI 単位が検証に必要なデータを seed.sql に追記していく

## 用語

- **Group**: 組織としての所属単位（例: ○○バドミントンクラブ）。試合内の「チームA/B」とは別概念
- **GroupMember**: Group と Supabase auth.users の多対多関連
- **マイグレーション**: DDL を連番 SQL で git 管理し順次適用する仕組み（dbt/Alembic と同系統）
- **RLS (Row Level Security)**: PostgreSQL の行単位アクセス制御。自動 WHERE 句に近い
- **シードデータ**: dev 環境の初期データ。`supabase db reset` で投入される `supabase/seed.sql`
