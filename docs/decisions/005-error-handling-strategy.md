# ADR-005: エラーハンドリング戦略

## ステータス
Accepted (2026-05-09)

## 背景

`data-foundation` のスキーマレビュー (`schema-review-notes.md` ⑫ A-7) で
「エラーハンドリング UX 境界」を扱った際、議論の対象が **data-foundation 内に閉じない
全単位横断の戦略**であることが判明した。エラーは Supabase DB / RPC / Auth /
フォーム入力 / 外部 SDK / Vue render など多発生源を持ち、変換・提示・復帰の
各レイヤーを通過する。MVP 時点で規約を確立しないと、各単位 (auth-onboarding,
match-recording 等) で実装が分岐して保守不能になる。

詳細な議論は `docs/design/data-foundation/error-handling-review-notes.md`
(本 ADR 適用と同時に削除) に記録した。本 ADR は確定事項のみを集約する。

## 決定

エラーハンドリングを以下 5 層に分け、各層で採用する規約を定める。

```
[1] 発生源 → [2] 識別 → [3] 変換 → [4] 提示 → [5] 復帰
```

### D1 伝搬パターン: Supabase native (`{data, error}`) を踏襲

`{data, error}` を全 composable の戻り値形とする。`$fetch` / 純 TS の throw は
composable 内で try-catch して同形に揃える。Result 型 (neverthrow) は
Vue/Nuxt エコシステム (useFetch の reactive ref / `error.vue` /
`<NuxtErrorBoundary>` / Nuxt UI Form) との橋渡しコストが大きく不採用。

**page から `supabase.from(...)` 直接呼びは禁止**。必ず composable 経由とする。

### D2 識別子の中央集約: `as const` object

App 識別子 (ドメインエラー) と PG SQLSTATE の両方を `as const` object で集約し、
`typeof X[keyof typeof X]` で union 型を導出する。`enum` は tree-shake しづらく
modern TS で非推奨化のため不採用。生文字列 (`'23505'` 等) の比較禁止。

### D3 変換レイヤー: 識別子 → 文言は composable + i18n

文言は `locales/ja.json` に集約し、変換は `useErrorMessage` composable
(`useI18n` の `t/te` を内部で呼ぶ) に閉じる。

**App 識別子は 1:1 マッピング** (例: `INVITATION_NOT_FOUND_BY_CODE` /
`_BY_LINK` を別識別子として定義)。**PG SQLSTATE のみ context で出し分け**
(`errors.unique_violation.{join_group, create_group, generic}`)。
context 文字列は domain composable に閉じ、page 側に context リテラル禁止。

「呼び出し側が context を意識する負荷」を解消する設計。

### D4 UI チャネル使い分け: 決定木 + 代表例 + チャネル別 composable

エラー UI は **決定木で判断**し、文書には網羅マトリクスを置かない (新発生源で
保守不能になるため)。代表例は MVP スコープ分の 7 行のみ残す。

ユーザが能動的にエラーをセットするチャネル (3 つ) ごとに composable を提供:
- `useFormErrors` (`<UFormGroup>` inline 用)
- `useNoticeErrors` (`<UAlert>` 用、フォーム上部 / 画面上部 共通)
- `useToastErrors` (`useToast` 用、一過性)

`<NuxtErrorBoundary>` / `error.vue` / `navigateTo()` は Vue/Nuxt 側仕組み or
補助のため composable 不要。

### D5 i18n: MVP 中導入、ja のみ + en.json ハコ用意

`@nuxtjs/i18n` を MVP 中に導入。`ja` のみで開始し、`en.json` はキー構造だけ
コピーして将来翻訳に備える。**言語切替 UI は持たない** (社内ツール 1 言語固定、
dev のみ `?locale=en` で切替可能)。`detectBrowserLanguage: false`、
`strategy: 'no_prefix'`。

### D6 ロギング: Sentry (Error Tracking のみ)

`@sentry/nuxt` を MVP 中に導入。Performance / Session Replay は無効化
(`tracesSampleRate: 0` 等)、Phase 2 以降に追加検討。

報告対象:
- `error.vue` 落下時の `Sentry.captureException(error)`
- `useErrorMessage` で識別子に該当しない fallthrough
  (`tags: { reason: 'unmapped_error_code' }` を付けて識別子定義漏れを早期検知)

dev 環境も送信し、`environment` タグで分離する (Dashboard 側で filter)。

## 実装規約の参照先

各層の実装詳細・コード例・ファイル配置は
`docs/design/cross-cutting/error-handling.md` に集約する。本 ADR は判断記録のみ
に留め、規約変更時は cross-cutting 文書を更新する。

## 採用しなかった選択肢

| 案 | 却下理由 |
|---|---|
| Result 型 / neverthrow (D1) | Vue/Nuxt エコシステムとの橋渡しコスト大、`useFetch` の reactive ref と食い合わせが悪い |
| 全 throw 統一 (D1) | Supabase native を毎回 `if (error) throw` でラップするボイラプレートで利益が薄い |
| `enum` (D2) | tree-shake しづらく値型ずれ、modern TS で非推奨化 |
| 識別子粗い + 全箇所で context 必須 (D3 X1) | 呼び出し側 (page) まで context 文字列が漏れる、認知負荷大 |
| SQLSTATE → App 識別子に完全マップして context 廃止 (D3 X3) | composable に SQLSTATE→App の振り分けロジック (constraint 名パース等) が集中、SQL リファクタで壊れやすい |
| 網羅マトリクス維持 (D4 M1) | 新発生源出現で文書とコードの drift が不可避、保守不能 |
| 全部 toast / inline / Alert に統一 (D4) | 用途特性が異なり代替不可 (Zod 紐付け不可、永続通知が消える 等) |
| Datadog / LogRocket (D6) | MVP にオーバースペック、月額コスト高 |
| ロギング後回し (D6) | リリース直後の Hydration mismatch / undefined.foo 事故が検知不可で致命的 |

## 影響

- 全単位 (auth-onboarding, player-management, match-management, match-recording,
  stats-dashboard) で本 ADR の規約に従う
- `data-foundation/api-endpoints.md` のエラーハンドリング指針セクションは
  cross-cutting 文書への参照に置き換える
- `data-foundation/architecture.md` のエラー言及行に cross-cutting への参照を
  追加する
- 新規 NPM 依存: `@nuxtjs/i18n`, `@sentry/nuxt`
- 新規環境変数: `NUXT_PUBLIC_SENTRY_DSN`, `NUXT_PUBLIC_ENV`

## データエンジニアのアナロジー

- **本 ADR (判断記録)** = dbt の `models/_overview.md`: なぜこの設計を選んだかを履歴として凍結
- **cross-cutting/error-handling.md (実装規約)** = `macros/utility/`: 横断的な再利用ロジック、変更時は更新
- **App 識別子の 1:1 (D3 X2)** = dbt の singular test: モデル固有の検証
- **PG SQLSTATE の context 出し分け (D3)** = dbt の generic test: 汎用検証を context で再利用
- **決定木 (D4 M2)** = dbt の test 種類リスト: モデル追加で test 種類は増えない、新発生源出現でも文書更新不要
- **Sentry** = Snowflake query history のフロントエンド版: なしで本番運用は「dbt run の失敗を誰も見ていない」状態

## 参考

- `docs/design/cross-cutting/error-handling.md` (実装規約の詳細)
- ADR-001 (Nuxt + Nuxt UI 採用): エコシステム前提を継承
- ADR-004 (auth-onboarding 単位追加): 横断規約の最初の利用者
