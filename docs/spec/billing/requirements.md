# billing 要件定義書

**作成日**: 2026-09-26
**作業規模**: 新規単位（DB 4 テーブル + SQL 関数 + Nuxt server route 3 本 + 設定画面のプラン表示 + 法務ページ 1 本）。既存単位への変更は auth-onboarding（グループ作成 RPC の owner 付与）と match-management（試合作成の上限ガード）に限る
**依存単位**: data-foundation（`group_members` / `matches` への additive migration）, auth-onboarding（`create_group_with_owner` の変更・設定画面）, match-management（試合作成経路）, stats-dashboard / shot-stats（詳細ダッシュボードのゲート）
**上位方針**: ADR-013（収益化方針）→ ADR-019（課金システムの具体設計）。本書は ADR-019 を実装可能な要件に落としたもの。ADR-013 の「3 プラン」に **Team プラン（運営者との手動契約・個別価格・機能無制限）を 4 つ目として追加**する（ユーザー決定 2026-09-27。ADR-019 §11 として追記）。それ以外の ADR の決定は変更しない

## 概要

グループ単位の月額サブスク（Free / Trial / Pro / Team の 4 プラン）を導入する。**代表者（owner）1 人が支払うとグループ全員が Pro** になる定額モデル。決済画面・プラン管理・請求書・督促は Stripe（Hosted Checkout / Customer Portal）に委譲し、自前の決済 UI は持たない。課金状態は Stripe → Webhook → Supabase の 2 テーブル（`billing_customers` / `billing_subscriptions`）にミラーし、アプリのプラン判定は常にミラーを読む SQL 関数 `get_group_plan()` 1 本に集約する。

有料プランは 2 種類ある（ユーザー決定 2026-09-27）。

| | **Pro** | **Team** |
|---|---|---|
| 契約の仕方 | 野良のユーザーが**アプリの UI から自己契約**（Stripe Checkout） | 運営者と**直接契約**（金額の合意・請求・入金はアプリ外。アプリには契約記録だけを入れる） |
| 価格 | 標準価格 1 本（`pro_monthly`） | チームごとにさまざま（契約記録に金額をメモ） |
| 機能 | エンタイトルメント・マトリクスの Pro 列 | **基本的に無制限**（Team 列はすべて開放） |
| 課金状態の出どころ | Stripe → Webhook → ミラー | `billing_team_contracts`（運営者が SQL で管理。Stripe 非依存） |

Team は当面 **Stripe を使わない手動契約**とする（ユーザー決定 2026-09-27。Stripe の手数料と、契約条件を柔軟にしたい事情のため）。将来チーム数が増えて請求業務が重くなったら、Team も Stripe の Team 用 Price に載せて Pro と配管を共通化できる（note.md §3-3 に将来案として記録。要件には含めない）。

**代行入力（運営者が試合の記録・注釈を肩代わりする）は Team 契約の中で手動運用**し、アプリの機能にはしない（ユーザー決定 2026-09-27）。運営者のダミーアカウントを招待リンクで Team グループに参加させ、通常メンバーとして入力する。依頼の受付・枠の管理・状態表示はアプリに持たない。

実装は ADR-019 §10 の 3 フェーズに分け、各要件に **[A] / [B] / [C]** のフェーズ印を付ける。

| フェーズ | 内容 | Stripe 依存 | 出荷タイミング |
|---|---|---|---|
| **[A] プラン基盤** | owner 概念・billing 2 テーブル・**Team 契約テーブル**・**検証環境用のプラン上書き**・`get_group_plan()`・`useEntitlements()`・設定画面のプラン表示 | なし | 先行可（Trial 残日数表示などに使える） |
| **[B] 決済（Pro）** | Checkout / Customer Portal / Webhook / 特商法ページ / 利用規約の課金条項 | あり | Stripe アカウント審査後 |
| **[C] 制限スイッチ ON** | Free / Trial の上限（試合 10・選手 10・メンバー 4）に実数を設定 + サーバー側ガード有効化 + 詳細統計・注釈のロック + 広告枠（実装は後） | なし | 公開時（仲間内ローンチ中は OFF） |

## 関連文書

- **ユーザストーリー**: [📖 user-stories.md](user-stories.md)
- **受け入れ基準**: [✅ acceptance-criteria.md](acceptance-criteria.md)
- **コンテキストノート（設計の要点・未決事項）**: [📝 note.md](note.md)
- **ADR-013 収益化・プラットフォーム方針**: [../../decisions/013-monetization-and-platform-strategy.md](../../decisions/013-monetization-and-platform-strategy.md)
- **ADR-019 課金システムの具体設計**: [../../decisions/019-billing-system-design.md](../../decisions/019-billing-system-design.md)（PR #42）
- **ADR-006 single group per user**: [../../decisions/006-single-group-per-user-mvp.md](../../decisions/006-single-group-per-user-mvp.md)
- **ADR-018 検証戦略の改訂（課金は第2ゲート後）**: [../../decisions/018-concierge-validation-and-minimal-build-ahead.md](../../decisions/018-concierge-validation-and-minimal-build-ahead.md)
- **auth-onboarding 要件（グループ作成・設定画面）**: [../auth-onboarding/requirements.md](../auth-onboarding/requirements.md)
- **match-management 要件（試合作成）**: [../match-management/requirements.md](../match-management/requirements.md)
- **Supabase CLI 運用（migration は CI 経由）**: [../../operations/supabase-cli.md](../../operations/supabase-cli.md)

## スコープ

### 含む
- `group_members.role`（`owner` / `member`）の additive migration と既存グループのバックフィル、グループ作成 RPC での owner 付与
- `billing_customers` / `billing_subscriptions` テーブルと RLS（メンバー SELECT のみ、書き込みは service role のみ）
- **Team プラン**: 運営者が直接契約したグループを Team として扱う契約記録 `billing_team_contracts`（期間・金額メモ）。運営者が SQL で管理し、アプリは判定と表示のみ
- `get_group_plan(group_id)` SQL 関数（`'free' | 'trial' | 'pro'`）と Trial の 30 日判定
- エンタイトルメント定数 `shared/entitlements.ts` と `useEntitlements()` composable
- グループ設定画面のプラン表示（現在のプラン・Trial 残日数・次回更新日・解約予約表示）とアップグレード／プラン管理導線（owner のみ）
- Nuxt server route: Checkout セッション作成・Customer Portal セッション作成・Stripe Webhook 受信
- Free プランの累計試合数上限のサーバー側ガード（[C] で有効化）と、詳細ダッシュボードの UI ゲート
- 特定商取引法に基づく表記ページと利用規約の課金条項
- 環境分離（Stripe test mode = dev / live mode = prd）と秘密情報の受け渡し
- **検証環境でのプラン切替**: dev ではグループのプランを `free` / `trial` / `pro` に自由に行き来でき、課金なしで制限・ゲート・表示を動作確認できる（`billing_plan_overrides` + 設定画面の検証用 UI。prd では書き込み不可・UI 非表示）

### 含まない
- 広告（ADS 行はマトリクスに置くが実装しない。ADR-013 §2「規模が出てから」）
- 席数課金・年額プラン・クーポン／プロモーションコード・Stripe Tax（外税表示）
- **Team の請求処理**（金額の合意・請求書・入金確認はアプリ外。Stripe は使わない）
- Team 契約を運営者が操作するアプリ内管理画面（Supabase ダッシュボード / SQL で運用）
- Team を Stripe に載せる（Team 用 Price・価格割当・Webhook でのプラン導出）。将来案として note.md §3-3 に記録
- Pro のチーム別価格・クーポン（個別価格は Team プランで扱う）
- Team ごとの機能差（Team 列は全チーム共通で無制限。契約で変わるのは金額のみ）
- **代行入力のアプリ機能**（依頼・枠・状態管理）。運営者のダミーアカウントを招待して手動運用する（ユーザー決定 2026-09-27）
- owner の譲渡・owner の脱退・グループ削除（脱退機能自体が現状存在しない。ADR-019 §1-1 の「owner 不在のグループを作らない」不変条件のみ守る）
- Stripe の trial 機能（`trial_period_days`）。Trial はアプリ側計算で Stripe 非依存（ADR-019 却下案）
- 詳細ダッシュボード（読み取り系）のサーバー側強制（ADR-019 §7: 当面 UI ゲートのみ）
- AI 自動記録・切り抜きのゲート実装（マトリクスに将来行として置くのみ）
- 返金処理・請求書の自前発行（Stripe の receipt メールに委譲）

## 用語

| 用語 | 意味 |
|---|---|
| owner | グループの代表者。`group_members.role = 'owner'`。グループにちょうど 1 人。課金操作ができる唯一のメンバー |
| プラン | `free` / `trial` / `pro` の 3 値。グループ単位で決まりメンバー全員に同じ値が適用される |
| エンタイトルメント | 機能 × プランのマトリクス。`can(feature)` の答え |
| ミラー | Stripe のオブジェクト状態を Supabase 側テーブルに写したもの。Stripe が SoR（Source of Record） |
| 制限スイッチ | `ENTITLEMENTS` の `matchLimit` / `playerLimit` / `memberLimit` の `free` / `trial` 値。`null` = 無制限（OFF）、数値 = 上限（ON）。ローンチ時は OFF、公開時に 10 / 10 / 4 を入れる |
| Pro | UI から自己契約する標準の有料プラン。Product「Pro」× Price `pro_monthly` の 1 本 |
| Team | 運営者と直接契約する有料プラン。価格は個別、機能は無制限。`billing_team_contracts` の有効な契約で判定（Stripe 非依存） |
| 代行（コンシェルジュ入力） | 運営者が Team グループにダミーアカウントで参加し、試合の記録・注釈を手動で入力すること。アプリ機能ではなく契約内の運用 |
| 運営者 | アプリの運営者（作者）。Team 契約と代行を担う。アプリ上の特別な権限は持たず、SQL / service role と通常のメンバー権限で運用する |
| プラン上書き | 検証環境専用。`billing_plan_overrides` に入れた値が `get_group_plan()` の通常判定より優先される。prd では書けない |
| 猶予期間 | 支払い失敗（`past_due`）後も Pro を維持する期間。終了すると停止（free）。長さは未決 |

## 機能要件（EARS記法）

**【信頼性レベル凡例】**:
- 🔵 **青信号**: ADR-013 / ADR-019 の確定事項・既存スキーマ・Stripe 公式仕様・法令に基づく確実な要件
- 🟡 **黄信号**: ADR・既存実装から妥当な推測による要件（設計時に確認）
- 🔴 **赤信号**: 出典のない推測による要件（ユーザ確認が必要）

### 通常要件

#### owner とプラン判定 [A]

- REQ-001: システムは、グループのメンバーに役割 `owner` / `member` を保持しなければならない（`group_members.role`、既定 `member`） 🔵 *ADR-019 §1-1*
- REQ-002: システムは、グループ作成時に作成者を `owner` として登録しなければならない（`create_group_with_owner` RPC の変更） 🔵 *ADR-019 §1-1*
- REQ-003: システムは、migration 適用時に既存の全グループへ owner を 1 人ずつバックフィルしなければならない。作成者は記録されていないため **`joined_at` が最も早いメンバー**（同時刻なら `id` 昇順）を owner とする 🔵 *ADR-019 は「グループ作成者」と記載。`groups.created_by` が無いため最古参メンバーで代替。ユーザー確認 2026-09-27*
- REQ-004: システムは、グループのプランを `get_group_plan(p_group_id)` SQL 関数 1 本で `'free' | 'trial' | 'pro' | 'team'` として返さなければならない。判定順は「プラン上書き（検証環境）→ Team 契約 → Pro subscription → Trial → Free」とする。UI・RLS・RPC のいずれもこの関数を参照し、判定ロジックを複製してはならない 🔵 *ADR-019 §4*
- REQ-036: `get_group_plan()` は、`billing_team_contracts` に有効な契約（`starts_at <= now()` かつ（`ends_at IS NULL` または `ends_at > now()`））が 1 件でもあれば `'team'` を返さなければならない。Team の判定は Stripe に依存せず、契約記録のみで決まる 🔵 *ユーザー決定 2026-09-27（Team は手動契約）*
- REQ-005: `get_group_plan()` は、Team でなく `billing_subscriptions` に `status IN ('active', 'trialing', 'past_due')` の行が 1 件でもあれば `'pro'` を返さなければならない。`past_due`（支払い失敗・再試行中）は**猶予期間 14 日**の間だけ pro 扱いとし、猶予が終わったら停止（free）する。猶予は Stripe の再試行設定で実現する: Smart Retries を「最初の失敗から 14 日以内」に収め、失敗しきったら最終アクションを **`unpaid`**（解約ではない）にする。`unpaid` に遷移した時点で自然に free へ落ちる。アプリ側に猶予日数の計算は持たない 🔵 *ADR-019 §4 + ユーザー決定 2026-09-27（猶予 14 日）*
- REQ-006: `get_group_plan()` は、pro でなく `groups.created_at` が現在時刻から 30 日以内であれば `'trial'`、それ以外は `'free'` を返さなければならない。Trial の判定に Stripe・カード登録・別テーブルを使ってはならない 🔵 *ADR-013 §5 + ADR-019 §4*
- REQ-007: システムは、エンタイトルメント・マトリクスを TypeScript 定数 `shared/entitlements.ts` に 1 箇所で定義し、機能ごとに `free` / `trial` / `pro` / `team` の 4 列の値を持たなければならない。初期のマトリクスは次のとおり（ユーザー決定 2026-09-27） 🔵 *ADR-013 §4 + ユーザー決定 2026-09-27*

  | キー | Free | Trial（30 日） | Pro | Team | 備考 |
  |---|---|---|---|---|---|
  | `matchLimit`（累計の有効な試合数） | 10 | 10 | null | null | ローンチ時は Free / Trial も null（スイッチ OFF） |
  | `playerLimit`（選手登録数） | 10 | 10 | null | null | 同上 |
  | `memberLimit`（グループメンバー数） | 4 | 4 | null | null | 同上 |
  | `shotAnnotation`（ショット注釈） | false | true | true | true | Free は詳細統計が無いため注釈も不要 |
  | `detailedDashboard`（詳細統計 4 タブ） | false | true | true | true | ADR-013 |
  | `ads`（広告） | true | true | false | false | Trial も広告あり。実装は後（ADR-013 §2） |
  | `aiAutoRecord`（将来） | false | 'limited' | true | true | ADR-013 |
  | `clipExport`（将来） | false | false | true | true | ADR-013 |

  マトリクスに載せない = 全プランで開放するもの: 試合の記録（スコア・ラリー）、基本統計（得点率・ラリー長・ラリー一覧）とそのフィルタ、動画連携（YouTube / ローカル再生・ラリーシーク）、シングルス。代行入力はアプリ機能ではないためマトリクスに持たない（Team 契約の中で手動運用）。Trial と Free の差は注釈・詳細統計の有無だけで、上限と広告は同じ
- REQ-008: システムは、フロントエンド向けに `useEntitlements()` composable を提供し、現在グループのプラン（`plan`）・機能可否（`can(feature)`）・上限（`matchLimit` / `playerLimit` / `memberLimit`）・Trial 残日数・サブスク詳細（次回更新日・解約予約）・Team 契約詳細（契約期間）を返さなければならない 🔵 *ADR-019 §6*

#### プラン表示 [A]

- REQ-009: システムは、グループ設定画面（`/groups/[id]/settings`）に「プラン」セクションを表示し、現在のプラン名を全メンバーに示さなければならない 🔵 *ADR-019 §10「設定画面にプラン表示」。先頭セクションに配置。ユーザー確認 2026-09-27*
- REQ-010: システムは、プランが `trial` の場合に Trial 終了日と残り日数を表示しなければならない 🔵 *ADR-019 §10「トライアル残り日数の表示」*
- REQ-011: システムは、プランが `pro` の場合に次回更新日（`current_period_end`）を表示し、解約予約中（`cancel_at_period_end = true`）なら「期末で終了」の旨を表示しなければならない 🔵 *ADR-019 §5 解約シーケンス*
- REQ-037: システムは、プランが `team` の場合に「Team プラン（個別契約）」と契約期間（`ends_at` があれば終了日）を表示し、Stripe の「アップグレード」「プランを管理」ボタンを表示せず「契約内容の変更は運営者にご連絡ください」を表示しなければならない 🔵 *Team はアプリ外契約*
- REQ-038: （欠番。Team の Checkout 導線は Stripe 統一を採らないため不要 2026-09-27）

#### 決済 [B]

- REQ-012: システムは、owner が「Pro にアップグレード」を実行すると、サーバー側で Stripe Checkout Session（`mode: 'subscription'`、Price は `lookup_key = 'pro_monthly'` の 1 本）を作成し、その URL へリダイレクトしなければならない。フロントエンドに Stripe.js / publishable key を持ち込んではならない 🔵 *ADR-019 §2 / §5*
- REQ-013: システムは、Checkout Session 作成時にグループの Stripe Customer を作成または再利用し、`billing_customers` に `group_id ⇄ stripe_customer_id` を 1:1 で記録しなければならない。Customer の `metadata.group_id` にグループ ID を、`email` に owner のメールアドレスを設定する 🔵 *ADR-019 §3 / §5 ②*
- REQ-014: システムは、owner が「プランを管理」を実行すると、サーバー側で Stripe Customer Portal Session を作成しその URL へリダイレクトしなければならない。解約・カード変更・請求履歴は Portal 内で完結させ、自前 UI を作ってはならない 🔵 *ADR-019 §2*
- REQ-015: システムは、Stripe Webhook を Nuxt server route `server/api/stripe/webhook.post.ts` で受信し、`STRIPE_WEBHOOK_SECRET` による署名検証に成功したイベントのみ処理しなければならない 🔵 *ADR-019 §5*
- REQ-016: Webhook は、`checkout.session.completed` / `customer.subscription.created` / `customer.subscription.updated` / `customer.subscription.deleted` を購読し、イベントを**トリガーとしてのみ**使い、対象 subscription の最新状態を Stripe API から再取得して `billing_subscriptions` に upsert（`stripe_subscription_id` UNIQUE キー）しなければならない（fetch-then-upsert） 🔵 *ADR-019 §5（Webhook は順序保証なし）*
- REQ-017: `billing_subscriptions.status` は Stripe の `status` 値をそのまま保存し、独自 enum に変換してはならない。保存項目は `status` / `price_lookup_key` / `current_period_end` / `cancel_at_period_end` を含む 🔵 *ADR-019 §3*
- REQ-018: Webhook の DB 書き込みは Supabase service role で行い、`billing_customers` / `billing_subscriptions` には INSERT / UPDATE / DELETE の RLS ポリシーを一切作らないことで「書けるのは service role のみ」を保証しなければならない 🔵 *ADR-019 §3 RLS*
- REQ-019: システムは、Checkout 完了後の戻り先（`success_url`）を当該グループの設定画面とし、Webhook 反映までの遅延に備えてプラン表示を数秒間リトライ（再取得）しなければならない 🔵 *ADR-019 §5 シーケンス「反映まで数秒リトライ」*
- REQ-020: システムは、特定商取引法に基づく表記ページを未ログインでも到達可能な公開ルートで提供し、事業者名・販売価格・支払方法・支払時期・サービス提供時期・解約条件・返金ポリシー（日割り返金なし、期末まで利用可）を記載しなければならない 🔵 *ADR-019 §9 + 特定商取引法 §11（通信販売の広告表示義務）*
- REQ-021: システムは、利用規約に課金条項（プラン・料金・自動更新・解約・支払い失敗時の扱い）を追記し、設定画面のプランセクションおよび特商法ページから利用規約・特商法ページへ相互にリンクしなければならない 🔵 *ADR-019 §9*

#### Team 契約 [A]

- REQ-026: システムは、Team プランの契約記録を `billing_team_contracts`（`id` PK、`group_id`、`starts_at`、`ends_at`（NULL = 無期限）、`monthly_amount_jpy`（記録用）、`note`、`created_at` / `updated_at`）に保持しなければならない。同一グループに複数行（更新契約の履歴）があってよく、有効判定は REQ-036 による 🔵 *ユーザー決定 2026-09-27*
- REQ-027: Team 契約の作成・変更・終了は運営者が行い（Supabase ダッシュボード / SQL / service role）、アプリ内に管理 UI を持たない。RLS はメンバーの SELECT のみ許可し、authenticated からの書き込みポリシーを作らない 🔵 *スコープ「含まない」+ REQ-018 と同じ書き込み方針*
- REQ-028: システムは、設定画面のプランセクションに Pro の月額（標準価格）を税込み JPY で表示しなければならない。金額の出典は Stripe の Price オブジェクト（`unit_amount`）とし、DB や i18n に金額を二重保持しない 🟡 *Stripe = SoR の原則から推測。取得経路（server route + キャッシュ）は設計で決める（note.md 未決事項 #9）*

#### 検証環境 [A]

- REQ-030: システムは、検証環境（dev Supabase プロジェクト = ローカル `pnpm dev` / Vercel preview）でグループのプランを `free` / `trial` / `pro` に任意に切り替えられる**プラン上書き**を提供しなければならない。`billing_plan_overrides`（`group_id` PK、`plan`、`updated_by`、`updated_at`）に行があれば `get_group_plan()` はその値を通常判定（subscription / Trial）より優先して返す 🔵 *ユーザー要件 2026-09-27「検証環境では各プランを自由に行き来でき、課金なしで動作確認できる」*
- REQ-031: プラン上書きへの書き込みは**検証環境でのみ**可能でなければならない。DB 側で環境を識別し（dev プロジェクトにのみ手動で設定する DB パラメータ `app.environment = 'dev'`。migration では設定しない = prd では常に未設定）、`billing_plan_overrides` の INSERT / UPDATE / DELETE ポリシーは「当該グループのメンバー かつ 検証環境」のときだけ許可する。prd ではポリシーが常に偽となり、authenticated からは書けない 🟡 *環境識別の方式は設計で確定（note.md 未決事項 #13）*
- REQ-032: 設定画面の「検証用プラン切替」UI（free / trial / pro / team の 4 択 + 解除）は、`runtimeConfig.public.env` が `production` でないときにのみ描画しなければならない（DB ポリシーと UI の二重ゲート） 🔵 *既存の `NUXT_PUBLIC_ENV` 運用*
- REQ-033: プラン上書きは、UI ゲート（`can(feature)`）・試合作成のサーバー側ガード（REQ-022）・設定画面の表示のすべてに同じように効かなければならない（すべて `get_group_plan()` 経由で判定するため、上書き専用の分岐を作らない） 🔵 *REQ-004*
- REQ-034: 検証環境の Stripe は test mode とし、テストカード（`4242 4242 4242 4242` 等）で Checkout → Webhook → pro → Portal 解約の全フローを実費なしで確認できなければならない。プラン上書きは「Stripe を通さず素早く切り替える」用途、test mode は「決済フロー自体を確認する」用途として併用する 🔵 *Stripe test mode 公式*
- REQ-035: プラン上書きを解除（行 DELETE または「解除」操作）すると、`get_group_plan()` は直ちに通常判定に戻らなければならない 🔵 *REQ-030*
- REQ-029: Team 契約の請求（金額合意・請求書・入金確認）はアプリ外で行い、アプリは契約記録の `monthly_amount_jpy` を表示・記録用に持つだけで決済処理を行ってはならない 🔵 *スコープ「含まない」*

#### 制限 [C]

- REQ-022: システムは、`matches` の INSERT 時に `get_group_plan()` と当該グループの累計試合数を検査するサーバー側（DB 側）ガードを持ち、Free / Trial プランで上限（10）到達済みなら INSERT を拒否しなければならない。クライアント側判定のみに依存してはならない 🔵 *ADR-019 §7（DevTools から直接 INSERT できるため）+ ユーザー決定 2026-09-27（Trial も同じ上限）*
- REQ-023: 累計試合数は**削除済み（`deleted_at IS NOT NULL`）の試合を含めずに**数えなければならない（`deleted_at IS NULL` の件数。試合を削除すれば枠が戻る） 🔵 *ユーザー決定 2026-09-27*
- REQ-024: システムは、上限到達によるガード拒否をクライアントで識別可能なエラー（`match_limit_reached` / `player_limit_reached` / `member_limit_reached`）として返し、該当フォームに「現在のプランの上限（試合 10 / 選手 10 / メンバー 4）に達しました」とアップグレード導線（owner）または「代表者に依頼」の案内（member）を表示しなければならない 🟡 *既存 error-codes.ts の App エラー規約（DB RAISE と 1:1）に合わせた推測*
- REQ-047: システムは、`players` の INSERT 時に `get_group_plan()` と当該グループの有効な選手数（`deleted_at IS NULL`）を検査するサーバー側ガードを持ち、Free / Trial で上限（10）到達済みなら拒否しなければならない（試合と同じ方式） 🔵 *ユーザー決定 2026-09-27（選手登録数 M=10）*
- REQ-048: システムは、グループ参加（`join_group_with_code` RPC）時に `get_group_plan()` と当該グループの有効なメンバー数を検査し、Free / Trial で上限（4）到達済みなら `member_limit_reached` で拒否しなければならない。招待リンクを開いた側に「このグループはメンバー数の上限に達しています。代表者にご確認ください」を表示する 🔵 *ユーザー決定 2026-09-27（メンバー数 K=4）。メンバー追加の書き込み経路は join RPC のみ*
- REQ-049: `can('shotAnnotation')` が false（Free）の場合、システムは注釈スタジオへの導線と画面をロック表示（アップグレード案内）にしなければならない。注釈の書き込み（`shots` INSERT）のサーバー側ガードは任意とする（注釈は Free では閲覧手段が無く、突破しても価値が無い） 🔵 *ユーザー確認 2026-09-27 + ADR-019 §7 の「消える価値型は UI ゲートのみ」を準用*
- REQ-025: システムは、`can('detailedDashboard')` が false（Free）の場合、詳細統計（サーブ / 強み・課題 / 失点 / ラリー展開の 4 タブ）をロック表示（内容非表示 + アップグレード案内）にし、基本統計（得点率・ラリー長・ラリー一覧・動画ペイン）は表示しなければならない 🔵 *ADR-013 §4 + ADR-019 §7 UI ゲート + ユーザー決定 2026-09-27（動画連携は Free でも可）*

### 条件付き要件

- REQ-101: グループのプランが `pro` の場合、システムは Trial の残日数表示を出してはならない（`groups.created_at` が 30 日以内でも pro が優先） 🔵 *REQ-005 / REQ-006 の評価順*
- REQ-102: 操作者が owner でない場合、システムは「Pro にアップグレード」「プランを管理」ボタンを表示せず、代わりに「課金操作は代表者（owner 表示名）のみ行えます」と表示しなければならない 🔵 *ADR-019 §1-1「課金操作は owner のみ」*
- REQ-103: Checkout / Portal セッション作成 API の呼び出し元が未認証、対象グループの非メンバー、または owner でない場合、システムはそれぞれ 401 / 403 / 403 を返し Stripe API を呼び出してはならない 🔵 *ADR-019 §5 ①「owner か検証」*
- REQ-104: 対象グループに `active` / `trialing` / `past_due` の subscription が既に存在する場合、Checkout セッション作成 API は新規 Checkout を作らず 409 を返さなければならない（二重契約防止。UI は Portal 導線を出す） 🔵 *Stripe 上で同一 customer に複数 subscription が作れるため。ユーザー確認 2026-09-27*
- REQ-105: Webhook の署名検証に失敗した場合、システムは 400 を返し DB を変更してはならない 🔵 *Stripe Webhooks 公式（署名検証必須）*
- REQ-106: Webhook が購読対象外のイベント種別を受信した場合、システムは何もせず 200 を返さなければならない（Stripe の再送を防ぐ） 🔵 *Stripe Webhooks 公式（2xx 以外は再送）*
- REQ-107: Webhook が同一イベントを重複配送された場合、upsert により結果が変わってはならない（冪等） 🔵 *ADR-019 §5 冪等性*
- REQ-108: Webhook 処理中に Stripe API の再取得または DB 書き込みが失敗した場合、システムは 5xx を返して Stripe の再送に委ね、部分的な書き込みを残してはならない 🔵 *Stripe Webhooks 公式（再送は最大 3 日）*
- REQ-109: `customer.subscription.updated` で `cancel_at_period_end = true` になった場合、システムは期末（`current_period_end`）まで `pro` を維持し、`customer.subscription.deleted` 受信で `status = 'canceled'` になった時点で `free`（または Trial 期間内なら `trial`）へ落ちなければならない 🔵 *ADR-019 §5 解約シーケンス*
- REQ-110: subscription が `past_due`（猶予期間中）の場合、システムは設定画面のプランセクションに「お支払いに問題があります。最初の失敗から 14 日以内に更新されない場合は Pro が停止します」と Portal 導線（owner のみ）を表示しなければならない。猶予終了後（`unpaid` / `canceled`）は free として扱い、既存データは残す（EDGE-204） 🔵 *ユーザー決定 2026-09-27（猶予 14 日）。日付の個別算出はせず固定文言（Stripe の督促メールが日付を伝える）*
- REQ-111: subscription が `unpaid` / `canceled` / `incomplete` / `incomplete_expired` の場合、`get_group_plan()` はその行を pro の根拠にしてはならない 🔵 *REQ-005 の対偶。Stripe subscription status 一覧*
- REQ-112: 制限スイッチが OFF（該当上限の `free` / `trial` 値が `null`）の場合、システムはそのサーバー側ガードで拒否してはならず、Free / Trial グループでも無制限に作成・参加できなければならない 🔵 *ADR-013 §理由 4「仲間内ローンチ時は制限なし」*
- REQ-113: 制限スイッチが ON で Free / Trial グループの累計試合数が上限未満の場合、システムは試合一覧に「残り N 試合」を表示しなければならない（選手一覧・設定画面のメンバー欄にも「残り N 人」を表示） 🔵 *ユーザー確認 2026-09-27*
- REQ-114: （欠番。Trial 終了間近の注意表示はユーザー判断で不要 2026-09-27。残り日数の表示自体は REQ-010 で行う）
- REQ-117: 猶予終了で停止したグループの owner が支払いを完了した場合、システムは Webhook で同期された最新 `status` に従って pro へ復帰させなければならない（最終アクションは `unpaid` とするため、owner が Portal で未払い請求書を支払うと `active` に戻り、再 Checkout は不要） 🔵 *Stripe subscription lifecycle 公式 + ユーザー決定 2026-09-27*
- REQ-118: プラン上書きで `trial` にした場合、Trial の終了日・残日数は通常どおり `groups.created_at` から計算する（古いグループでは 0 日以下になり得るが、検証用途として許容し「終了済み」表示にする） 🔵 *REQ-006 / REQ-010*
- REQ-115: プランが `team` のグループの owner が Checkout セッション作成 API を呼んだ場合、システムは 409 を返し Stripe を呼んではならない（Team は UI から契約しない。UI 上もボタンを出さない REQ-037） 🔵 *二重契約防止*
- REQ-116: （欠番。代行のアプリ機能は作らない 2026-09-27）
- REQ-119: （欠番。同上）
- REQ-120: （欠番。同上）
- REQ-121: Team 契約が終了（`ends_at` 経過）した場合、プランは通常判定（Pro subscription / Trial / Free）に戻る。運営者のダミーアカウントの退出は行わない（脱退機能なし） 🔵 *REQ-036*
- REQ-122: （保留。運営者が Stripe ダッシュボードで作成した Customer の取り込み。Team を Stripe に載せる将来案で必要になる。note.md §3-3）

### 状態要件

- REQ-201: グループは常にちょうど 1 人の owner を持たなければならない。owner が 0 人または 2 人以上になる書き込みを DB で禁止する（部分 UNIQUE インデックス `(group_id) WHERE role = 'owner'` と、owner 行の DELETE / role 降格を拒否する制約またはトリガ） 🔵 *ADR-019 §1-1 不変条件*
- REQ-202: `billing_customers` はグループにつき最大 1 行（`group_id` PK）、`stripe_customer_id` は全体で UNIQUE でなければならない 🔵 *ADR-019 §3*
- REQ-203: `billing_subscriptions` の `stripe_subscription_id` は全体で UNIQUE でなければならず、同一グループに複数行（解約→再契約の履歴）があってもよい 🔵 *ADR-019 §3「customer 1 : N subscription」*
- REQ-204: 既存グループ（migration 以前に作成）は、migration 適用後も pro でない限り `groups.created_at` から 30 日超で `free` と判定される。制限スイッチ OFF の間は実害がない 🔵 *ADR-019 §4 末尾*
- REQ-210: 制限スイッチ ON 時点で既に上限を超えているグループ（例: Free で選手 15 人・メンバー 6 人）は、既存データを削除・無効化されず、新規追加のみ拒否される 🔵 *EDGE-204 と同じ「既存は残す」原則*
- REQ-205: Checkout から戻った直後、Webhook 未反映の間はプラン表示が旧プランのままでもよいが、反映後は再読み込みなしに `pro` へ更新されなければならない 🔵 *REQ-019*
- REQ-206: `billing_team_contracts` は `ends_at IS NULL OR ends_at > starts_at` を CHECK で強制しなければならない 🔵 *REQ-026*
- REQ-208: `billing_plan_overrides` はグループにつき最大 1 行（`group_id` PK）、`plan` は `CHECK (plan IN ('free','trial','pro','team'))` でなければならない 🔵 *REQ-030*
- REQ-207: Team の機能（エンタイトルメント Team 列）は契約の金額に依存してはならない。契約で変わるのは金額のみで、機能はすべての Team グループで同じ 🔵 *ユーザー決定 2026-09-27「機能は基本的に無制限」*
- REQ-209: 同一グループに有効な Team 契約と active な Pro subscription が同時に存在する場合、プランは `team` とし、運営者は Pro subscription を Stripe で解約する（二重請求の解消は運用。アプリは自動解約しない） 🟡 *Pro → Team へ移行するケースの扱い*

### オプション要件

- REQ-301: システムは、課金導線の計測イベント（`upgrade_clicked` / `checkout_completed` / `portal_opened`）を PostHog に送信してもよい 🟡 *ADR-016 計測基盤の延長*
- REQ-302: システムは、Free グループの累計試合数が上限に達したとき試合一覧のヘッダーにアップグレード案内バナーを表示してもよい 🟡
- REQ-303: システムは、Stripe Checkout のロゴ・ブランドカラーを Stripe ダッシュボードで設定してもよい（コード変更なし） 🔵 *ADR-019 §理由 2*

### 制約要件

- REQ-401: システムは、`group_members` / `matches` への変更を **additive migration** で行い、既存列の削除・既存行のデータ変更（バックフィルによる `role` 更新を除く）を行ってはならない 🔵 *singles-support REQ-401 踏襲*
- REQ-402: migration の適用は CI（`migrate-dev.yml` / `migrate-prd.yml`）経由とし、ローカルから `db push` してはならない 🔵 *docs/operations/supabase-cli.md*
- REQ-403: `app/types/supabase.ts` は migration 適用後に `pnpm db:types` で再生成し、手修正との差分が無いことを確認しなければならない 🔵 *singles-support REQ-408 / gen-types.yml*
- REQ-404: Stripe secret key・Webhook secret・Supabase service role key は Vercel 環境変数および GitHub Environment Secrets でのみ渡し、リポジトリ内の `.env*` ファイルに書いてはならない。Nuxt では `runtimeConfig`（非 public）で受ける 🔵 *ADR-019 §5 / §8 既存 secret ポリシー*
- REQ-405: Stripe は test mode を dev（Vercel preview / ローカル）、live mode を prd に対応させ、キーと Webhook エンドポイントを環境ごとに分離しなければならない 🔵 *ADR-019 §8*
- REQ-406: プラン判定の同期パス（画面描画・RLS・RPC）で Stripe API を呼び出してはならない。Stripe API を呼ぶのは Checkout / Portal セッション作成と Webhook の再取得に限る 🔵 *ADR-019 §理由 4*
- REQ-407: 販売価格は消費税込み（内税）の JPY 表示とし、Stripe Price は Product「Pro」× `currency: 'jpy'`・税込み・月額の 1 本（`lookup_key: 'pro_monthly'`）とする。金額はローンチ時に決める。Team の金額は Stripe Price を持たず契約記録に残す 🔵 *ADR-019 §2 / §8*
- REQ-412: （欠番。Team を Stripe に載せる将来案の命名規約。要件に含めない 2026-09-27）
- REQ-408: システムは画面の全文言を i18n locales（ja/en）経由で表示しなければならない 🔵 *既存単位踏襲*
- REQ-409: Webhook エンドポイントは認証ミドルウェアの対象外（server route）であり、認可は署名検証のみで行う。ページ用の `auth.global` ミドルウェアをこのルートに適用してはならない 🔵 *Nuxt server route は route middleware の対象外*
- REQ-410: `useEntitlements()` は `get_group_plan()` の結果を根拠にし、`billing_subscriptions` を直接読んでプランを再計算してはならない（表示用の詳細取得のみ可） 🔵 *REQ-004*
- REQ-411: Webhook 受信 API は Stripe の署名検証のために **raw body** を読まなければならず、JSON パース済みボディで検証してはならない 🔵 *Stripe Webhooks 公式（署名は raw payload に対して計算）*

## 非機能要件

### パフォーマンス

- NFR-001: `get_group_plan()` は `billing_subscriptions(group_id, status)` のインデックスにより 1 グループあたり数 ms で返ること。全画面の描画に乗るため N+1 で呼んではならない（グループにつき 1 回） 🔵 *ADR-019 §理由 4*
- NFR-002: Webhook ハンドラは Stripe のタイムアウト（20 秒）内に 2xx を返すこと。1 イベントあたり Stripe API 再取得 1 回 + upsert 1 回に収める 🔵 *Stripe Webhooks 公式*

### セキュリティ

- NFR-101: `billing_*` テーブルの SELECT は `is_member_of(group_id)` に限定し、他グループの課金状態を読めてはならない 🔵 *ADR-019 §3 RLS*
- NFR-102: Checkout / Portal セッション作成 API は、サーバー側でセッションユーザー（`serverSupabaseUser`）を取得し `group_members.role = 'owner'` を DB で確認すること。クライアントから渡された owner フラグを信用してはならない 🔵 *REQ-103*
- NFR-103: Checkout Session には `client_reference_id = group_id` と `metadata.group_id` を設定し、Webhook 側で Stripe Customer の `metadata.group_id` と `billing_customers` の両方から group を解決できること 🔵 *ADR-019 §理由 2（Payment Links 却下理由の裏返し）*
- NFR-104: Stripe secret key はサーバー側バンドルにのみ含まれ、`runtimeConfig.public` に置かれてはならない 🔵 *REQ-404*

### ユーザビリティ

- NFR-201: アップグレードは「ボタン 1 回 → Stripe Checkout → 戻る」の 1 往復で完結し、アプリ内でカード情報を入力させないこと 🔵 *ADR-019 §2*
- NFR-202: 非 owner メンバーにも現在のプラン・Trial 残日数・次回更新日が見えること（誰が払うかは分かるが、払えるのは owner のみ） 🔵 *REQ-009 / REQ-102*
- NFR-203: 上限到達・Trial 終了などの制限メッセージは、必ず「次に何をすればよいか」（アップグレード or 代表者に依頼）を伴うこと 🟡

### 保守性

- NFR-301: 新機能に課金ゲートを足すときは `shared/entitlements.ts` に 1 行追加し、UI で `can(feature)` を参照するだけで済むこと 🔵 *ADR-019 §影響*
- NFR-302: 制限スイッチの ON/OFF（[C]）は `ENTITLEMENTS` の上限値（`matchLimit` / `playerLimit` / `memberLimit`）の変更 1 箇所で切り替わり、DB 側ガードもその値を参照すること（DB 関数の引数または `app_settings` 相当の 1 箇所で同期。二重管理しない） 🟡 *設計時に TS 定数と DB 関数の同期方法を決める（note.md 未決事項 #3）*
- NFR-303: Webhook ハンドラは Stripe SDK のイベント型で分岐し、単体テストで Stripe のイベント fixture を与えて upsert 結果を検証できること 🔵 *ADR-012 テスト戦略*
- NFR-304: Team の開始は「`billing_team_contracts` に 1 行入れる」だけで完結し、コード変更・デプロイ・Stripe 操作を要しないこと 🔵 *REQ-026 / REQ-027*

### 運用

- NFR-401: ローカルでは Stripe CLI（`stripe listen --forward-to localhost:3000/api/stripe/webhook`）で Webhook を検証できること。手順を `docs/operations/` に記載する 🔵 *ADR-019 §8*
- NFR-404: Stripe ダッシュボードの「サブスクリプションと請求書 → 支払い失敗時の再試行」を、再試行が最初の失敗から 14 日以内に完了し、失敗後の最終アクションが「未払いにする（unpaid）」になるよう設定し、その設定値を運用ドキュメントに記載すること（test / live 両モード） 🔵 *REQ-005 の猶予 14 日を Stripe 側で実現する*
- NFR-402: Stripe ダッシュボードでの Product / Price / Webhook エンドポイント / Portal 設定の手順を運用ドキュメントに記載し、test / live の両モードで同一の `lookup_key` を使うこと 🔵 *ADR-019 §2*
- NFR-403: Team の運用手順（契約行の INSERT / 更新 / 終了、Pro からの移行時の subscription 解約、代行用ダミーアカウントの招待）を運用ドキュメントに記載すること 🔵 *REQ-029 / REQ-209 / REQ-121*

## Edgeケース

### 入力検証・認可

- EDGE-001: owner でないメンバーが Checkout API を直接叩いた場合、403 で拒否され Stripe Customer は作られない 🔵 *REQ-103*
- EDGE-002: 既に pro のグループの owner が Checkout API を直接叩いた場合、409 で拒否される（UI では Portal 導線のみ表示） 🔵 *REQ-104*
- EDGE-003: Webhook に署名なし・不正署名・期限切れタイムスタンプのリクエストが来た場合、400 で拒否され DB は変わらない 🔵 *REQ-105*
- EDGE-004: 別グループの `group_id` を metadata に持つイベントが来ても、`billing_customers` の `stripe_customer_id` で解決した group にのみ書き込まれる（metadata 単独では信用しない） 🟡 *NFR-103*

### 状態遷移・整合

- EDGE-101: `checkout.session.completed` より先に `customer.subscription.created` が届いた場合でも、fetch-then-upsert により最終状態は同じになる 🔵 *REQ-016*
- EDGE-102: Checkout 完了直後に設定画面へ戻り、Webhook がまだ届いていない場合、数秒間はプラン表示が `trial` / `free` のままで、リトライ後に `pro` に切り替わる 🔵 *REQ-019 / REQ-205*
- EDGE-103: 解約予約中（`cancel_at_period_end = true`）に owner が Portal で解約を取り消した場合、`customer.subscription.updated` で `false` に戻り「期末で終了」表示が消える 🔵 *REQ-109*
- EDGE-104: 支払い失敗で `past_due` → Smart Retries 全滅で `canceled` になった場合、`deleted` イベントで `free` に落ちる。`past_due` の間は pro のまま 🔵 *REQ-005 / REQ-109*
- EDGE-105: 解約後に再契約した場合、`billing_subscriptions` に新しい行が追加され、旧行は `canceled` のまま残る。`get_group_plan()` は新行で pro を返す 🔵 *REQ-203*
- EDGE-106: グループ作成から 30 日目の境界: `created_at > now() - interval '30 days'` が真の間は trial、偽になった瞬間 free 🔵 *REQ-006*
- EDGE-107: Stripe Customer は作られたが Checkout を完了せず離脱した場合、`billing_customers` に行が残り subscription は無い。次回の Checkout で同じ Customer を再利用する 🔵 *REQ-013*
- EDGE-108: Stripe ダッシュボードから手動で subscription を作成・変更した場合も Webhook 経由で同期される（ダッシュボード操作を禁止しない） 🔵 *REQ-016*

### Team プラン

- EDGE-401: Team 契約が有効なグループでは、Free / Trial の上限・詳細統計・注釈のロックが一切かからず、広告も出ない 🔵 *REQ-007 Team 列*
- EDGE-402: Team グループの設定画面には Stripe のボタンが無く、契約期間が表示される。owner が API を直接叩いても 409 🔵 *REQ-037 / REQ-115*
- EDGE-403: Pro 契約中のグループに Team 契約を入れると、その瞬間から `team` になる。Pro subscription は運営者が Stripe で解約するまで請求が続く（運用で解消） 🟡 *REQ-209*
- EDGE-404: Team 契約の `ends_at` を過ぎると通常判定に戻る。Pro subscription があれば `pro`、なければ Trial / Free 🔵 *REQ-121*
- EDGE-405: 運営者のダミーアカウントが Team グループに参加している間、メンバー一覧に表示される（隠さない）。メンバー数上限には Team なので影響しない。契約終了後も退出機能が無いため残り、Free に落ちたグループではメンバー数にカウントされる（上限 4 の 1 枠を占める） 🟡 *REQ-121 / スコープ「含まない」（脱退機能なし）。必要なら運営者が SQL で `deleted_at` を付ける運用*

### 検証環境（プラン上書き）

- EDGE-501: prd で `billing_plan_overrides` に authenticated から INSERT すると RLS で拒否される。dev では同グループのメンバーなら成功する 🔵 *REQ-031*
- EDGE-502: dev で上書き `free` + 制限スイッチ ON にすると、実際に subscription があるグループでも試合作成が上限で拒否される（上書きが最優先） 🔵 *REQ-030 / REQ-033*
- EDGE-503: dev で上書き `pro` にしたグループは、Stripe に何も無くても詳細ダッシュボードが開き、設定画面は「Pro（検証用上書き）」と表示する。次回更新日は無いので表示しない 🔵 *REQ-030 / REQ-011*
- EDGE-504: 上書き `trial` の古いグループは残り日数が 0 日以下になり「終了済み」表示になる。制限ガードは trial（試合 10・選手 10・メンバー 4、注釈・詳細統計あり）として扱う 🔵 *REQ-118*
- EDGE-505: prd ビルド（`NUXT_PUBLIC_ENV=production`）では検証用プラン切替 UI が DOM に存在しない 🔵 *REQ-032*
- EDGE-506: 上書き中に Webhook で subscription が更新されても、上書きが解除されるまでプラン表示は上書き値のまま（ミラーは正しく更新される） 🔵 *REQ-030*

### 制限ガード

- EDGE-201: 制限スイッチ OFF（`null`）の Free / Trial グループは、累計何試合でも作成でき、選手・メンバーも無制限に追加できる 🔵 *REQ-112*
- EDGE-202: 制限スイッチ ON・上限 10 の Free / Trial グループで有効な試合が 10 件あるとき、N+1 試合目の INSERT が DB で拒否される。試合を 1 件削除すると枠が 1 つ戻り、再び追加できる 🔵 *REQ-022 / REQ-023*
- EDGE-203: 上限到達済みの Free グループが Pro になった瞬間から試合を作れる（Webhook 反映後） 🔵 *REQ-005*
- EDGE-204: Pro が解約されて free に落ちたとき、既存の試合・記録・統計データは削除も非表示もされない。新規作成のみ制限される 🔵 *ADR-013「消える価値型 / 残る型」の分類。累計試合は資産として残す*
- EDGE-205: Trial と Free の上限は同じ（試合 10・選手 10・メンバー 4）なので、Trial 終了で free に落ちても上限超過は起きない。失うのは注釈と詳細統計の閲覧だけで、注釈データ自体は残る（Pro になれば再び見える） 🔵 *REQ-007 マトリクス*
- EDGE-206: 制限スイッチ ON・Free / Trial で有効な選手が 10 人のとき、11 人目の INSERT は `player_limit_reached` で拒否。選手を 1 人削除すると再び追加できる 🔵 *REQ-047*
- EDGE-207: 制限スイッチ ON・Free / Trial でメンバーが 4 人のとき、5 人目が招待リンクを開くと `member_limit_reached` で参加できない。owner が Pro にすると参加できる 🔵 *REQ-048*
- EDGE-208: Free グループのメンバーが注釈スタジオの URL を直接開くとロック表示になる。Trial 中に付けた注釈は Free に落ちても DB に残り、詳細統計はロックされる 🔵 *REQ-049 / REQ-025*

### 既存データ

- EDGE-301: バックフィル対象グループのメンバーが 1 人なら、その人が owner になる 🔵 *REQ-003*
- EDGE-302: バックフィル対象グループにメンバーが 0 人（全員が `deleted_at` 付き、または membership 0 件）の場合、owner を付与できない。migration はこのケースを許容し（不変条件の例外として記録）、`deleted_at IS NULL` のメンバーが 0 人のグループは owner 無しのままとする 🟡 *現行データに存在するかは migration 前に確認（note.md 未決事項 #1）*
- EDGE-303: `group_members.deleted_at` が付いた owner 行（論理削除）がある場合の扱いは本単位のスコープ外（脱退機能が無いため発生しない） 🔵 *スコープ「含まない」*

## 受け入れ基準

詳細は [acceptance-criteria.md](acceptance-criteria.md)。

### 機能テスト

- [ ] [A] 新規グループ作成で作成者が owner になり、既存グループに owner が 1 人ずつバックフィルされる
- [ ] [A] `get_group_plan()` が subscription 状態 × 作成日で `pro` / `trial` / `free` を正しく返す
- [ ] [A] 設定画面にプラン・Trial 残日数が表示され、owner にだけアップグレード導線が出る
- [ ] [A] dev では設定画面からプランを free / trial / pro に切り替えられ、制限・ゲート・表示がすべて追従する。prd では切替 UI が無く DB にも書けない
- [ ] [B] owner が Checkout で契約すると Webhook 経由で `pro` になり、設定画面に次回更新日が出る
- [ ] [B] Portal で解約予約すると「期末で終了」表示になり、期末後に `free` へ落ちる
- [ ] [B] 特商法ページが未ログインで閲覧でき、利用規約に課金条項がある
- [ ] [A] Team 契約行を入れたグループが `team` になり、設定画面に契約期間が出て Stripe のボタンが消え、上限・ロック・広告が無い
- [ ] [C] 制限スイッチ ON で Free / Trial の 11 試合目・11 人目の選手・5 人目のメンバーが DB / RPC で拒否され、UI にアップグレード案内が出る
- [ ] [C] Free では注釈スタジオと詳細統計 4 タブがロックされ、基本統計と動画連携は使える。Trial では注釈・詳細統計が使える
- [ ] [C] `can('detailedDashboard')` が false の画面がロック表示になる

### 非機能テスト

- [ ] `billing_*` の RLS: メンバーは自グループのみ SELECT 可、anon / 他グループは 0 行、authenticated からの INSERT / UPDATE / DELETE は拒否
- [ ] Webhook: 不正署名 400 / 対象外イベント 200 / 重複配送で冪等 / 再取得失敗で 5xx
- [ ] Stripe secret がクライアントバンドルに含まれない（`runtimeConfig.public` 不使用）
- [ ] migration が dev に CI 適用され、`pnpm db:types` の再生成結果と差分がない
- [ ] `pnpm test` / `pnpm lint` / `pnpm typecheck` / `pnpm i18n:check` が通る

## 信頼性レベルサマリー

- 🔵 青信号: 120 / 🟡 黄信号: 12 / 🔴 赤信号: 0
