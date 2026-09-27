# billing 受け入れ基準

**作成日**: 2026-09-26
**関連**: [requirements.md](requirements.md) / [user-stories.md](user-stories.md)

テスト ID は `TC-{REQ 番号}-{連番}` とし、E は Edge ケース由来を表す。先頭の [A] / [B] / [C] は実装フェーズ。

## 1. [A] owner とバックフィル（migration）

| ID | 前提 | 操作 | 期待結果 | 要件 |
|---|---|---|---|---|
| TC-001-01 | migration 適用後 | `group_members` の定義を確認 | `role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member'))` がある | REQ-001 / REQ-401 |
| TC-002-01 | ログイン済み・未所属 | `create_group_with_owner('新規')` を呼ぶ | 作成者の `group_members.role = 'owner'` | REQ-002 |
| TC-003-01 | 既存グループ（メンバー 3 人、`joined_at` 相異） | migration 適用 | `joined_at` 最古のメンバーのみ `owner`、他は `member` | REQ-003 |
| TC-003-02 | 既存グループ（メンバー 1 人） | migration 適用 | その 1 人が `owner` | EDGE-301 |
| TC-003-03 | 既存グループ（`joined_at` 同時刻 2 人） | migration 適用 | `id` 昇順の 1 人だけが `owner` | REQ-003 |
| TC-201-01 | owner がいるグループ | 別メンバーを `role='owner'` に UPDATE | 部分 UNIQUE 違反で失敗 | REQ-201 |
| TC-201-02 | owner がいるグループ | owner 行を DELETE または `role='member'` に UPDATE | 制約またはトリガで失敗 | REQ-201 |
| TC-201-03 | 全グループ | `SELECT group_id, count(*) FILTER (WHERE role='owner')` | 有効メンバーがいる全グループで 1 | REQ-201 / EDGE-302 |

## 2. [A] billing テーブルと RLS

| ID | 前提 | 操作 | 期待結果 | 要件 |
|---|---|---|---|---|
| TC-202-01 | — | `billing_customers` に同一 `group_id` で 2 行 INSERT（service role） | PK 違反で失敗 | REQ-202 |
| TC-202-02 | — | 異なる `group_id` で同一 `stripe_customer_id` を INSERT | UNIQUE 違反で失敗 | REQ-202 |
| TC-203-01 | — | 同一 `group_id` に `stripe_subscription_id` 相異で 2 行 INSERT | 成功（履歴として共存） | REQ-203 |
| TC-203-02 | — | 同一 `stripe_subscription_id` で 2 行 INSERT | UNIQUE 違反で失敗 | REQ-203 |
| TC-NFR101-01 | グループ A のメンバーとしてログイン | `billing_subscriptions` を SELECT | グループ A の行のみ返る。グループ B の行は 0 件 | NFR-101 |
| TC-NFR101-02 | anon | 同 SELECT | 0 件 | NFR-101 |
| TC-018-01 | グループ A の owner としてログイン（authenticated） | `billing_subscriptions` に INSERT / UPDATE / DELETE | すべて RLS で拒否（42501） | REQ-018 |
| TC-018-02 | service role | 同 INSERT / UPDATE | 成功 | REQ-018 |

## 3. [A] `get_group_plan()`

| ID | 前提（subscription 状態 / groups.created_at） | 期待結果 | 要件 |
|---|---|---|---|
| TC-005-01 | `active` / 90 日前 | `pro` | REQ-005 |
| TC-005-02 | `trialing` / 90 日前 | `pro` | REQ-005 |
| TC-005-03 | `past_due` / 90 日前 | `pro` | REQ-005 / EDGE-104 |
| TC-101-01 | `active` / 3 日前 | `pro`（trial より優先） | REQ-101 |
| TC-111-01 | `canceled` のみ / 90 日前 | `free` | REQ-111 |
| TC-111-02 | `unpaid` のみ / 90 日前 | `free` | REQ-111 |
| TC-111-03 | `incomplete` のみ / 3 日前 | `trial` | REQ-111 / REQ-006 |
| TC-006-01 | 行なし / 3 日前 | `trial` | REQ-006 |
| TC-006-02 | 行なし / 29 日と 23 時間前 | `trial` | EDGE-106 |
| TC-006-03 | 行なし / 30 日と 1 分前 | `free` | EDGE-106 |
| TC-006-04 | 行なし / 90 日前 | `free` | REQ-006 / REQ-204 |
| TC-203-03 | `canceled`（旧）+ `active`（新） / 90 日前 | `pro` | EDGE-105 |
| TC-NFR001-01 | 1000 グループ分の subscription 行 | `EXPLAIN ANALYZE get_group_plan(id)` | `(group_id, status)` インデックスを使い数 ms | NFR-001 |

## 4. [A] エンタイトルメントと設定画面

| ID | 前提 | 操作 | 期待結果 | 要件 |
|---|---|---|---|---|
| TC-007-01 | 単体 | `ENTITLEMENTS` の型を確認 | 各機能に `free` / `trial` / `pro` の 3 キーが必須（型エラーで欠落を検出） | REQ-007 / NFR-301 |
| TC-008-01 | 単体 | `useEntitlements()` を plan=`trial`・スイッチ ON でモック | `can('detailedDashboard') === true`、`can('shotAnnotation') === true`、`can('ads') === true`、`matchLimit === 10`、`playerLimit === 10`、`memberLimit === 4`、残日数が数値 | REQ-008 / REQ-007 |
| TC-008-02 | 単体 | plan=`free`、スイッチ ON | `can('detailedDashboard') === false`、`can('shotAnnotation') === false`、`can('ads') === true`、`matchLimit === 10` | REQ-008 / REQ-007 |
| TC-008-03 | 単体 | plan=`pro` / `team` | `can('ads') === false`、上限すべて `null`、注釈・詳細統計 true | REQ-007 |
| TC-008-04 | 単体 | スイッチ OFF（上限 3 種の free/trial が `null`） | `matchLimit === null` 等 | REQ-007 / REQ-112 |
| TC-410-01 | 単体 | `useEntitlements()` の実装を確認 | `plan` は RPC `get_group_plan` の戻り値のみから決まる（`billing_subscriptions` から再計算しない） | REQ-410 |
| TC-009-01 | member としてログイン・plan=`free` | 設定画面を開く | 「プラン」セクションに「Free」が表示される。アップグレードボタンは無く「課金操作は代表者（名前）のみ」の案内 | REQ-009 / REQ-102 / NFR-202 |
| TC-010-01 | plan=`trial`（残り 12 日） | 設定画面を開く | 「Trial」+ 終了日 + 「残り 12 日」 | REQ-010 |
| TC-011-01 | plan=`pro`、`cancel_at_period_end=false` | 設定画面を開く | 「Pro」+ 次回更新日 | REQ-011 |
| TC-011-02 | plan=`pro`、`cancel_at_period_end=true` | 設定画面を開く | 「Pro」+「YYYY/MM/DD で終了」表示 | REQ-011 / EDGE-103 |
| TC-110-01 | plan=`pro`、status=`past_due`、owner | 設定画面を開く | 「お支払いに問題があります。最初の失敗から 14 日以内に更新されない場合は Pro が停止します」+「プランを管理」ボタン | REQ-110 |
| TC-117-01 | 猶予終了で `unpaid`（free）→ Portal で未払い請求書を支払い | `customer.subscription.updated`（`active`） | `get_group_plan()` が `pro` に復帰 | REQ-117 |
| TC-102-01 | owner としてログイン・plan=`free` | 設定画面を開く | 「Pro にアップグレード」ボタンが表示される | REQ-102 |
| TC-102-02 | owner としてログイン・plan=`pro` | 設定画面を開く | 「プランを管理」ボタンが表示され「アップグレード」は無い | REQ-102 / REQ-104 |
| TC-408-01 | — | `pnpm i18n:check` | ja/en キー構造一致 | REQ-408 |

## 5. [B] Checkout / Portal セッション API

| ID | 前提 | 操作 | 期待結果 | 要件 |
|---|---|---|---|---|
| TC-012-01 | owner・plan=`free`・Stripe test mode | `POST /api/stripe/checkout` | 200 で `url`（`checkout.stripe.com`）が返り、Session は `mode='subscription'`・Price `lookup_key='pro_monthly'`・`client_reference_id=group_id` | REQ-012 / NFR-103 |
| TC-013-01 | 同上・`billing_customers` に行なし | 同 API | Stripe Customer が作成され `billing_customers` に 1 行（`metadata.group_id`・`email` = owner のメール） | REQ-013 |
| TC-013-02 | 同上・`billing_customers` に行あり | 同 API | 新規 Customer を作らず既存 `stripe_customer_id` を再利用 | REQ-013 / EDGE-107 |
| TC-103-01 | 未認証 | 同 API | 401。Stripe API 未呼び出し | REQ-103 |
| TC-103-02 | 他グループのメンバー | 同 API | 403。Stripe API 未呼び出し | REQ-103 / EDGE-001 |
| TC-103-03 | 同グループの member（非 owner） | 同 API | 403 | REQ-103 / NFR-102 |
| TC-104-01 | owner・`active` subscription あり | 同 API | 409 | REQ-104 / EDGE-002 |
| TC-014-01 | owner・`billing_customers` あり | `POST /api/stripe/portal` | 200 で `url`（`billing.stripe.com`）が返る | REQ-014 |
| TC-014-02 | owner・`billing_customers` なし | 同 API | 404（Customer 未作成） | REQ-014 |
| TC-103-04 | member | `POST /api/stripe/portal` | 403 | REQ-103 |
| TC-NFR104-01 | `pnpm build` 後 | クライアントバンドルを `sk_test` / `sk_live` / `whsec_` で grep | 0 件 | NFR-104 / REQ-404 |

## 5b. [A] Team 契約

| ID | 前提 | 操作 | 期待結果 | 要件 |
|---|---|---|---|---|
| TC-027-01 | グループ A の owner（authenticated） | `billing_team_contracts` に INSERT / UPDATE / DELETE | すべて RLS で拒否 | REQ-027 |
| TC-027-02 | グループ A のメンバー | 同テーブルを SELECT | グループ A の行のみ。他グループは 0 件 | REQ-027 |
| TC-206-01 | service role | `ends_at < starts_at` で INSERT | CHECK 違反 | REQ-206 |
| TC-036-01 | 契約 `starts_at` = 昨日、`ends_at` = NULL、subscription なし、作成 90 日前 | `get_group_plan()` | `team` | REQ-036 |
| TC-036-02 | 契約 `ends_at` = 昨日 | `get_group_plan()` | `free`（契約終了 → 通常判定） | REQ-036 / REQ-121 / EDGE-404 |
| TC-036-03 | 契約 `starts_at` = 明日 | `get_group_plan()` | `free`（開始前） | REQ-036 |
| TC-036-04 | 有効な契約 + `active` subscription | `get_group_plan()` | `team`（Team 優先） | REQ-004 / REQ-209 / EDGE-403 |
| TC-036-05 | 契約 2 行（旧: 終了済み、新: 有効） | `get_group_plan()` | `team` | REQ-026 |
| TC-036-06 | 有効な契約 / 作成 3 日前 | `get_group_plan()` | `team`（trial より優先） | REQ-004 |
| TC-037-01 | plan=`team`、契約 `ends_at` = 2027-03-31 | 設定画面を開く | 「Team プラン（個別契約）」+ 終了日 + 「契約内容の変更は運営者にご連絡ください」。Stripe のボタンなし | REQ-037 / EDGE-402 |
| TC-115-01 | plan=`team` の owner | `POST /api/stripe/checkout` | 409。Stripe 未呼び出し | REQ-115 / EDGE-402 |
| TC-207-01 | Team グループ A（¥3,000）と Team グループ B（¥20,000） | `can(feature)` と上限を全機能で比較 | すべて同じ | REQ-207 |
| TC-401-01 | plan=`team`・スイッチ ON・有効 50 試合・選手 20 人・メンバー 8 人 | 試合・選手を追加 / 参加 / 詳細統計・注釈を開く | すべて成功 / ロックなし / 広告なし | EDGE-401 |
| TC-405-01 | Team グループに運営者のダミーアカウントが招待で参加 | メンバー一覧 | 表示される。契約終了後も残る | EDGE-405 |
| TC-NFR304-01 | 新しい Team | `billing_team_contracts` に 1 行 INSERT | デプロイ・Stripe 操作なしで `team` になる | NFR-304 |

## 6. [B] Webhook

| ID | 前提 | 操作 | 期待結果 | 要件 |
|---|---|---|---|---|
| TC-015-01 | 正しい署名 | `checkout.session.completed` を POST | 200。subscription を Stripe から再取得し `billing_subscriptions` に upsert | REQ-015 / REQ-016 |
| TC-105-01 | 署名ヘッダなし | 同 POST | 400。DB 変更なし | REQ-105 / EDGE-003 |
| TC-105-02 | 不正な署名 | 同 POST | 400。DB 変更なし | REQ-105 / EDGE-003 |
| TC-411-01 | 正しい署名・ボディを JSON 再シリアライズして送信 | 同 POST | 署名検証は raw body に対して行われ、改変ボディは 400 | REQ-411 |
| TC-106-01 | 正しい署名 | `invoice.paid`（購読対象外）を POST | 200。DB 変更なし | REQ-106 |
| TC-107-01 | 正しい署名 | 同一 `customer.subscription.updated` を 2 回 POST | 2 回目も 200、`billing_subscriptions` は 1 行のまま内容同一 | REQ-107 |
| TC-016-01 | Stripe 上の subscription が `cancel_at_period_end=true` | payload は古い状態（`false`）の `updated` イベント | 再取得により DB は `true`（payload を信用しない） | REQ-016 / EDGE-101 |
| TC-017-01 | — | `status='past_due'` の subscription で `updated` | DB の `status` が `'past_due'` のまま保存（変換なし） | REQ-017 |
| TC-108-01 | Stripe API 再取得が失敗（モック） | 同 POST | 5xx。DB 変更なし | REQ-108 |
| TC-108-02 | DB upsert が失敗（モック） | 同 POST | 5xx | REQ-108 |
| TC-109-01 | `active` → Portal で解約予約 | `updated`（`cancel_at_period_end=true`） | `get_group_plan()` は `pro` のまま | REQ-109 |
| TC-109-02 | 解約予約中 → 期末 | `customer.subscription.deleted` | `status='canceled'`、`get_group_plan()` が `free`（作成 30 日以内なら `trial`） | REQ-109 / EDGE-104 |
| TC-NFR103-01 | `billing_customers` の group と metadata の group が食い違うイベント | 同 POST | `stripe_customer_id` で解決した group に書き込む | EDGE-004 |
| TC-NFR002-01 | 正しい署名 | 1 イベント処理 | Stripe API 呼び出し 1 回 + upsert 1 回、1 秒以内に 200 | NFR-002 |
| TC-NFR303-01 | 単体 | Stripe イベント fixture を渡してハンドラを呼ぶ | upsert 引数が期待どおり | NFR-303 |
| TC-409-01 | 未ログインのブラウザ | `POST /api/stripe/webhook`（不正署名） | 400（ログインページへのリダイレクトにならない） | REQ-409 |

## 7. [B] 契約フロー（E2E・Stripe test mode）

| ID | 前提 | 操作 | 期待結果 | 要件 |
|---|---|---|---|---|
| TC-019-01 | owner・plan=`trial`・Stripe CLI で Webhook 転送 | アップグレード → テストカード `4242…` で決済 → 戻る | 設定画面に戻り、数秒以内に再読み込みなしで「Pro」+ 次回更新日に切り替わる | REQ-019 / REQ-205 / EDGE-102 |
| TC-019-02 | 同上 | Checkout をキャンセルして戻る | 設定画面に戻り plan は `trial` のまま。`billing_customers` には行が残る | EDGE-107 |
| TC-014-03 | owner・plan=`pro` | 「プランを管理」→ Portal で解約予約 → 戻る | 「YYYY/MM/DD で終了」表示 | REQ-014 / REQ-109 |
| TC-014-04 | 解約予約中 | Portal で解約を取り消す | 「期末で終了」表示が消える | EDGE-103 |
| TC-203-04 | 解約済み（`canceled`） | 再度アップグレード | 新しい subscription 行が増え `pro` に戻る | EDGE-105 |
| TC-201-04 | member としてログイン | 設定画面でアップグレード導線を探す | 存在しない。API を直接叩くと 403 | REQ-102 / EDGE-001 |
| TC-301-01 | PostHog 有効 | アップグレードボタン押下 → 決済完了 | `upgrade_clicked` / `checkout_completed` が送信される | REQ-301 |

## 8. [B] 法務ページ

| ID | 前提 | 操作 | 期待結果 | 要件 |
|---|---|---|---|---|
| TC-020-01 | 未ログイン | 特商法ページの URL を開く | ログインへリダイレクトされず表示される | REQ-020 |
| TC-020-02 | — | ページ内容を確認 | 事業者名・販売価格・支払方法・支払時期・提供時期・解約条件・返金ポリシーの 7 項目がある | REQ-020 |
| TC-021-01 | — | 利用規約を確認 | 課金条項（プラン・料金・自動更新・解約・支払い失敗）がある | REQ-021 |
| TC-021-02 | — | 設定画面のプランセクション | 利用規約・特商法ページへのリンクがある | REQ-021 |
| TC-021-03 | — | 特商法ページ | 利用規約・プライバシーポリシーへのリンクがある | REQ-021 |

## 9. [C] 制限ガード

| ID | 前提 | 操作 | 期待結果 | 要件 |
|---|---|---|---|---|
| TC-112-01 | スイッチ OFF（`matchLimit.free = null`）・Free・累計 50 試合 | 試合を追加 | 成功 | REQ-112 / EDGE-201 |
| TC-022-01 | スイッチ ON（上限 10）・Free・累計 9 試合 | 試合を追加 | 成功（10 試合目） | REQ-022 |
| TC-022-02 | スイッチ ON（上限 10）・Free・累計 10 試合 | 試合を追加 | DB で拒否され `match_limit_reached` | REQ-022 / REQ-024 |
| TC-022-03 | 同上 | DevTools から `matches` へ直接 INSERT | RLS / ガードで拒否 | REQ-022 |
| TC-023-01 | スイッチ ON（上限 10）・Free・有効 10 試合のうち 1 件を削除 | 試合を追加 | 成功（削除済みは数えない。枠が戻る） | REQ-023 / EDGE-202 |
| TC-022-04 | スイッチ ON・Trial・有効 10 試合 | 試合を追加 | 拒否（Trial も上限 10） | REQ-022 / EDGE-205 |
| TC-047-01 | スイッチ ON・Free・有効 10 人 | 選手を追加 | `player_limit_reached`。選手一覧に上限メッセージ + 導線 | REQ-047 / EDGE-206 |
| TC-047-02 | 同上・1 人削除後 | 選手を追加 | 成功 | EDGE-206 |
| TC-047-03 | スイッチ ON・Pro・有効 30 人 | 選手を追加 | 成功 | REQ-047 |
| TC-048-01 | スイッチ ON・Free・メンバー 4 人 | 5 人目が招待リンクを開く | `member_limit_reached`。「上限に達しています。代表者にご確認ください」 | REQ-048 / EDGE-207 |
| TC-048-02 | 同上・owner が Pro に | 5 人目が再度開く | 参加できる | EDGE-207 |
| TC-048-03 | スイッチ OFF・Free・メンバー 6 人 | 7 人目が参加 | 成功 | REQ-112 |
| TC-049-01 | スイッチ ON・Free | 注釈スタジオの URL を直接開く / 試合一覧の注釈導線 | ロック表示 + アップグレード案内 / 導線が無効 | REQ-049 / EDGE-208 |
| TC-049-02 | スイッチ ON・Trial | 同 | 注釈できる | REQ-049 |
| TC-210-01 | スイッチ ON 直後・Free・選手 15 人・メンバー 6 人 | 一覧を開く / 追加を試みる | 既存はすべて表示・利用可 / 追加のみ拒否 | REQ-210 |
| TC-113-02 | スイッチ ON・Free・選手 7 人・メンバー 3 人 | 選手一覧 / 設定画面 | 「残り 3 人」/「残り 1 人」 | REQ-113 |
| TC-022-05 | スイッチ ON・Pro・累計 20 試合 | 試合を追加 | 成功 | EDGE-203 |
| TC-024-01 | 上限到達・owner | 試合フォームで保存 | 「無料プランの上限に達しました」+「Pro にアップグレード」導線 | REQ-024 / NFR-203 |
| TC-024-02 | 上限到達・member | 試合フォームで保存 | 同メッセージ +「代表者（名前）に依頼してください」 | REQ-024 / NFR-203 |
| TC-113-01 | スイッチ ON（上限 10）・Free・累計 7 試合 | 試合一覧を開く | 「残り 3 試合」表示 | REQ-113 |
| TC-025-01 | スイッチ ON・Free | Group 統計 / 試合統計の詳細ダッシュボード（ショット統計 4 タブ）を開く | ロック表示 + アップグレード案内。基本統計（得点率・ラリー長・ラリー一覧）と動画ペイン（YouTube シーク）は閲覧可 | REQ-025 |
| TC-025-02 | スイッチ ON・Trial | 同 | 詳細ダッシュボードが閲覧可 | REQ-025 |
| TC-NFR302-01 | — | `ENTITLEMENTS` の `matchLimit` / `playerLimit` / `memberLimit` の free/trial を `null` に変更 | DB 側ガード 3 種も無効になる（二重管理なし） | NFR-302 |
| TC-EDGE204-01 | Pro → `free` に落ちたグループ・累計 30 試合 | 試合一覧・統計を開く | 既存 30 試合と統計は全て見える。新規作成のみ拒否 | EDGE-204 |

## 9b. [A] 検証環境のプラン上書き

| ID | 前提 | 操作 | 期待結果 | 要件 |
|---|---|---|---|---|
| TC-208-01 | dev・service role | 同一 `group_id` で 2 行 INSERT | PK 違反で失敗。`plan='gold'` は CHECK 違反。`plan='team'` は成功 | REQ-208 |
| TC-031-01 | dev（`app.environment='dev'` 設定済み）・グループ A のメンバー | `billing_plan_overrides` に INSERT / UPDATE / DELETE | 成功 | REQ-031 / EDGE-501 |
| TC-031-02 | dev・グループ B のメンバー | グループ A の行を INSERT / UPDATE | RLS で拒否 | REQ-031 |
| TC-031-03 | prd 相当（`app.environment` 未設定）・グループ A の owner | 同 INSERT | RLS で拒否 | REQ-031 / EDGE-501 |
| TC-030-01 | dev・subscription なし・作成 90 日前 | 上書き `pro` を入れる | `get_group_plan()` が `pro` | REQ-030 |
| TC-030-02 | dev・`active` subscription あり | 上書き `free` を入れる | `get_group_plan()` が `free`（上書き優先） | REQ-030 / EDGE-502 |
| TC-035-01 | 上書きあり | 行を DELETE | 直ちに通常判定（subscription / Trial）に戻る | REQ-035 |
| TC-032-01 | ローカル `pnpm dev`（`NUXT_PUBLIC_ENV=development`） | 設定画面を開く | 「検証用プラン切替」（free / trial / pro / team / 解除）が表示される | REQ-032 |
| TC-032-02 | `NUXT_PUBLIC_ENV=production` でビルド | 設定画面を開く | 切替 UI が DOM に無い | REQ-032 / EDGE-505 |
| TC-033-01 | dev・上書き `free`・スイッチ ON（上限 10）・有効 10 試合 | 試合を追加 | DB で拒否（`match_limit_reached`） | REQ-033 / EDGE-502 |
| TC-033-02 | dev・上書き `pro` | 詳細ダッシュボードを開く | ロックされず閲覧できる。設定画面は「Pro（検証用上書き）」で次回更新日なし | REQ-033 / EDGE-503 |
| TC-118-01 | dev・上書き `trial`・作成 90 日前 | 設定画面を開く | Trial 終了済みの表示。注釈・詳細統計は開き、上限は 10 / 10 / 4 | REQ-118 / EDGE-504 |
| TC-034-01 | dev・Stripe test mode・Stripe CLI | テストカードで Checkout → Portal 解約 | 実費なしで全フローが通り `billing_subscriptions` が同期される | REQ-034 |
| TC-EDGE506-01 | dev・上書き `free`・Webhook で `active` 到着 | `get_group_plan()` と `billing_subscriptions` | plan は `free` のまま、ミラーは `active` に更新 | EDGE-506 |

## 10. 非機能・運用

| ID | 操作 | 期待結果 | 要件 |
|---|---|---|---|
| TC-402-01 | `dev` へ push | `migrate-dev.yml` が発火し migration が適用される | REQ-402 |
| TC-403-01 | 適用後 `pnpm db:types` | 生成結果と手修正済み `app/types/supabase.ts` の差分が無い | REQ-403 |
| TC-404-01 | リポジトリを `sk_live` / `sk_test` / `whsec_` / `service_role` で grep | `.env*` を含め 0 件 | REQ-404 |
| TC-405-01 | Vercel の環境変数を確認 | Preview と Production で `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` が別値 | REQ-405 |
| TC-406-01 | プラン判定パス（`useEntitlements` / RLS / RPC）のコードを確認 | Stripe SDK の import が無い | REQ-406 |
| TC-NFR404-01 | Stripe ダッシュボード（test / live） | 再試行設定を確認 | 再試行が最初の失敗から 14 日以内に終わり、最終アクションが unpaid | NFR-404 |
| TC-407-01 | Stripe ダッシュボード（test / live） | Product「Pro」× Price 1 本、`currency=jpy`、`lookup_key=pro_monthly` | REQ-407 / NFR-402 |
| TC-NFR401-01 | `stripe listen --forward-to localhost:3000/api/stripe/webhook` | ローカルで Webhook が届き処理される。手順が `docs/operations/` にある | NFR-401 |
| TC-NFR-01 | `pnpm test` / `pnpm lint` / `pnpm typecheck` | 全て成功 | — |
