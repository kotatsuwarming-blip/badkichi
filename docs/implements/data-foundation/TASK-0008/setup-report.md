# TASK-0008 設定作業実行記録 (Partial)

## 作業概要

- **タスクID**: TASK-0008
- **作業内容**: 型自動生成パイプライン + npm scripts (実 DB 接続不要部分のみ)
- **実行日時**: 2026-05-19
- **実行者**: Claude (kairo-loop)
- **完了状況**: ⚠️ **Partial** — DB 接続が必要な「型生成本体」と「typecheck で 11 テーブル + 3 RPC 型を解決」は TASK-0009 (supabase db push) 後に実施が必要

## 設計文書参照

- **参照文書**:
  - `docs/tasks/data-foundation/TASK-0008.md` (完了条件)
  - `docs/design/data-foundation/architecture.md` (行 265〜281「型生成パイプライン」)
- **関連要件**: REQ-006 (全 DB テーブルの TS 型を自動生成), NFR-301 (スキーマ変更時に型も再生成)

## 実行した作業

### 1. package.json scripts への追加

`package.json` の `scripts` セクションに以下 2 つを追加:

```json
"db:push": "supabase db push --linked",
"db:types": "supabase gen types typescript --linked > app/types/supabase.ts"
```

**設計判断 (重要)**: `db:types` の出力先は **TASK-0008.md / architecture.md の `types/supabase.ts` ではなく `app/types/supabase.ts`** に変更した。理由:

- 本プロジェクトは Nuxt 4 (4.4.2) を採用しており、`srcDir` のデフォルトが `app/` である
- `~/types/supabase.ts` という Nuxt の alias パスは `app/types/supabase.ts` を指す
- `@nuxtjs/supabase` モジュールも `~/types/*.ts` を解決する仕様
- ルート `types/` ディレクトリに置くと、Nuxt 4 の規約から外れる + alias 解決に追加設定が必要
- 設計文書 (TASK-0008.md / architecture.md) は Nuxt 3 時代の慣習 `types/` を前提に書かれている可能性。Nuxt 4 規約への追従が望ましい

**残課題**: TASK-0008.md / `docs/design/data-foundation/architecture.md` 内の `types/supabase.ts` 表記を `app/types/supabase.ts` に更新する必要がある (本セッションでは保留、別タスクで対応推奨)。

### 2. nuxt.config.ts に supabase.types を明示

```ts
supabase: {
  redirectOptions: { login: '/login', callback: '/confirm' },
  types: '~/types/supabase.ts'  // = app/types/supabase.ts
}
```

**目的**: `@nuxtjs/supabase` モジュールの WARN「Database types configured at "~/types/database.types.ts" but file not found」を解消し、明示的に Database 型のパスを指定する。

### 3. app/types/ ディレクトリ + プレースホルダ supabase.ts 作成

```bash
mkdir -p app/types
```

`app/types/supabase.ts` を最小プレースホルダとして作成 (空 `Database` 型 + `Json` 型を export):

```ts
export type Database = {
  public: {
    Tables: Record<string, never>
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
```

**目的**:
- `pnpm typecheck` の WARN を解消する
- TASK-0009 で `pnpm db:push` → `pnpm db:types` 実行後にこのファイルが上書きされる
- それまでの中間状態でも Nuxt typecheck が止まらない

### 4. .gitignore 確認

`.gitignore` を確認し、`types/` または `app/types/` が除外されていないことを確認した (除外なし)。生成された `app/types/supabase.ts` は git 追跡対象となる (REQ-006 「リポジトリに保持」)。

## 完了条件の進捗状況

TASK-0008.md の完了条件:

| 条件 | 状態 | 備考 |
|------|------|------|
| `package.json` の `scripts` に `db:push` / `db:types` 追加 | ✅ | 出力先は `app/types/supabase.ts` に変更 |
| `types/` ディレクトリが作成されている | ⚠️ | `app/types/` を作成 (Nuxt 4 規約) |
| `types/supabase.ts` が生成されコミット可能 | ⚠️ | `app/types/supabase.ts` プレースホルダのみ。実型は TASK-0009 後 |
| `types/supabase.ts` に 11 テーブル + 3 RPC の Row/Insert/Update 型 | ❌ | DB 適用前のため未生成 |
| `pnpm typecheck` が `types/supabase.ts` 経由で全テーブル型解決 | ⚠️ | プレースホルダで typecheck は通るが、型解決対象テーブルなし |
| `pnpm db:types` が手元から dev プロジェクトを参照して型再生成可能 | ❌ | DB に schema 適用前のため。TASK-0009 後に動作 |
| `.gitignore` から types/ が除外されていない | ✅ | 確認済 |

## 遭遇した問題

### 問題1: TASK-0008.md / architecture.md の `types/` パスが Nuxt 4 慣習と齟齬

- **発生状況**: nuxt.config を見て `~/types/database.types.ts` の WARN を発見、TASK-0008.md の `types/supabase.ts` (ルート) との不整合を認知
- **解決方法**: Nuxt 4 規約 (srcDir=app/) に従い `app/types/supabase.ts` を採用、設計文書側の更新を残課題として明記
- **影響**: 設計文書 (TASK-0008.md / architecture.md) の更新が必要だが、本セッションでは保留

### 問題2: 完了条件のうち 4 項目が TASK-0009 依存

- **発生状況**: 型生成本体は実 DB のスキーマが必要 (`pnpm db:push` が先行する必要がある) が、`supabase db push` は破壊操作 deny 対象でユーザ承認が必要
- **解決方法**: TASK-0008 は scripts と placeholder までで partial 完了。TASK-0009 後に `pnpm db:types` で再生成し、TASK-0008 残項目を完了させる
- **影響**: TASK-0008 は overview.md でチェックを入れない (partial)

## 次のステップ

- TASK-0009: dev マイグレーション初回適用 (`pnpm db:push` 実行、ユーザ承認 or 手動実行必要)
- TASK-0009 完了後に `pnpm db:types` で型を再生成
- 設計文書 (TASK-0008.md / architecture.md) のパス表記更新
