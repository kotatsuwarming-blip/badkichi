# billing コンテキストノート（セッション引き継ぎ用）

**作成日**: 2026-09-26
**位置づけ**: ADR-013（収益化方針）→ ADR-019（課金の具体設計、PR #42）を実装可能な要件に落とした単位。ADR-018 では課金実装は「第2ゲート（リテンション）成立後」とされているが、本要件定義は設計の先行確定の延長として作成した。実装着手のタイミング判断は本書のスコープ外
**状態**: 要件定義ドラフト（ユーザ確認待ち）。次は `/kairo-design billing`

## 1. 前提となる決定（ADR で確定済み・再議論不要）

| 決定 | 出典 |
|---|---|
| プランは Free / Trial / Pro の 3 つ。Trial は独立列（Pro のサブセットではない） | ADR-013 §3 / §理由 5 |
| 累計試合数制限（月次リセットなし）。仲間内ローンチ中はスイッチ OFF | ADR-013 §4 / §理由 4 |
| 課金主体はグループ定額。owner 1 人が払い全員 Pro。席数課金・個人課金は不採用 | ADR-019 §1（ユーザー決定 2026-07-06） |
| Stripe Hosted Checkout + Customer Portal + Webhook。自前決済 UI ゼロ | ADR-019 §2 |
| `billing_customers` / `billing_subscriptions` の 2 テーブルミラー。書き込みは service role のみ | ADR-019 §3 |
| プラン判定は `get_group_plan()` 1 本。Trial は `groups.created_at` から 30 日で Stripe 非依存 | ADR-019 §4 |
| Webhook は Nuxt server route（Vercel）。fetch-then-upsert | ADR-019 §5 / §理由 3 |
| エンタイトルメントは TS 定数（DB テーブル化しない） | ADR-019 §6 |
| 強制は UI ゲート + 書き込み系のみサーバー側ガード。読み取り系は当面 UI のみ | ADR-019 §7 |
| **検証環境ではプランを自由に行き来でき、課金なしで動作確認できる** | ユーザー要件 2026-09-27 |
| 累計試合数は削除済みを含めない（削除すれば枠が戻る） | ユーザー決定 2026-09-27 |
| 支払い失敗時は 14 日の猶予の後に停止する（Stripe の再試行設定で実現、最終アクション unpaid） | ユーザー決定 2026-09-27 |
| **エンタイトルメント確定: Free / Trial は試合 10・選手 10・メンバー 4・広告あり。Trial だけ注釈と詳細統計あり。動画連携は全プラン** | ユーザー決定 2026-09-27（§5） |
| フェーズ A（基盤）→ B（決済）→ C（スイッチ ON） | ADR-019 §10 |
| **有料プランは Pro（UI から自己契約・標準価格・Stripe）と Team（運営者との手動契約・個別価格・機能無制限・Stripe 非依存）の 2 種類** | ユーザー決定 2026-09-27（ADR-013 の 3 プランに Team を追加。ADR-019 §11）。Stripe 手数料と契約条件の柔軟性のため当面は手動契約。Stripe 統一は将来案（§3-3） |
| **代行入力（試合の記録・注釈を運営者が肩代わり）はアプリ機能にしない。運営者のダミーアカウントを招待して手動運用** | ユーザー決定 2026-09-27（契約で柔軟に扱いたいため） |

## 2. 現状コードとの接点（設計時に触る場所）

| 領域 | 現状 | 本単位での変更 |
|---|---|---|
| `group_members` | `role` カラムなし | additive migration で `role` 追加 + バックフィル + 部分 UNIQUE |
| `create_group_with_owner` RPC | 名前に owner とあるが `group_members` に role を入れていない | INSERT に `role = 'owner'` を追加 |
| 試合作成 | `useCreateMatch` がクライアントから `matches` に直接 INSERT（RLS `matches_insert` = `is_member_of`） | [C] のガードは RLS `WITH CHECK` の拡張か、INSERT の RPC 化かを設計で選ぶ（§4 未決事項 #3 参照） |
| 設定画面 `app/pages/groups/[id]/settings.vue` | 招待・メンバー一覧・About（プライバシー／利用規約リンク） | 先頭に「プラン」セクションを追加 |
| `server/` | 存在しない（Nuxt server route を使った実績なし） | `server/api/stripe/{checkout,portal,webhook}.post.ts` を新設。`@nuxtjs/supabase` の `serverSupabaseUser` / `serverSupabaseServiceRole` を使う |
| `billing_plan_overrides`（新規） | — | 検証環境専用のプラン上書き。`get_group_plan()` が最優先で読む。prd では書き込み不可 |
| `billing_team_contracts`（新規） | — | Team 契約の記録（期間・金額メモ）。運営者が SQL で管理。`get_group_plan()` が参照 |
| 招待機能（`generate_invitation_code` / `join_group_with_code`） | 既存 | 運営者のダミーアカウントが Team グループに参加する経路としてそのまま流用。join RPC にメンバー数ガード（REQ-048）を追加 |
| 選手登録 `useCreatePlayer` | クライアントから `players` に直接 INSERT | 選手数ガード（REQ-047）を DB 側に追加 |
| `shared/` | 存在しない | `shared/entitlements.ts` を新設（Nuxt 4 の `shared/` はクライアント・サーバー両方から import 可） |
| 法務ページ | `/privacy` `/terms`（`PUBLIC_PATHS` で未ログイン可） | 特商法ページを同列に追加し `PUBLIC_PATHS` に登録 |
| `error-codes.ts` | DB の `RAISE EXCEPTION` メッセージと 1:1 の App エラー | `match_limit_reached` を追加 |
| 統計画面 | `/groups/[id]/stats` と `/matches/[matchId]/stats` にショット統計 4 タブ（serve / strengths / weakness / rallyflow）。基本の得点率・ラリー長は `useStatsView` | 「詳細 = ショット統計 4 タブ」「基本 = 得点率・ラリー長・ラリー一覧」と仮置き（§4 未決事項 #4） |
| PostHog | `match_recorded` / `stats_viewed` を送信中 | 課金導線イベントを任意追加（REQ-301） |
| secret | Sentry DSN / PostHog key は public。service role key は CI のみ | Stripe secret / Webhook secret / service role key を Vercel 環境変数で `runtimeConfig`（非 public）へ |

## 3. 設計の要点（要件から導かれる構造）

### 3-1. プラン判定の一本化

```
UI ─▶ useEntitlements() ─▶ rpc('get_group_plan') ─┐
RLS / RPC (matches INSERT ガード) ─────────────────┼─▶ get_group_plan(group_id) ─▶ billing_subscriptions + groups.created_at
統計 read function (将来) ─────────────────────────┘
```

- `useEntitlements()` は `plan` を RPC から受け取り、`ENTITLEMENTS[feature][plan]` を引くだけ。表示用の詳細（`current_period_end` 等）は `billing_subscriptions` を SELECT して補うが、プランの再計算には使わない（REQ-410）。
- `get_group_plan()` は `SECURITY DEFINER` + `STABLE`。`billing_subscriptions(group_id, status)` の複合インデックスを張る。

### 3-2. Stripe ↔ Supabase の同期（CDC パターン）

- Stripe = SoR、`billing_*` = read model、Webhook = 通知。イベント payload は信用せず `stripe.subscriptions.retrieve()` で最新を取り upsert する（順序保証なし対策）。
- 冪等性は `stripe_subscription_id` UNIQUE への upsert で担保。同一イベントの再送は無害。
- group の解決は `billing_customers.stripe_customer_id` を主とし、Customer `metadata.group_id` は補助（EDGE-004）。
- 失敗時は 5xx で Stripe に再送させる。部分書き込みを残さない（1 イベント = 1 upsert なので実質アトミック）。

### 3-3. Team プラン（手動契約。Stripe 統一は将来案）

```
get_group_plan(group_id):
  1. billing_plan_overrides（dev 専用）
  2. billing_team_contracts に有効な契約 → team      ← 運営者が SQL で INSERT。Stripe 非依存
  3. billing_subscriptions に active/trialing/past_due → pro
  4. groups.created_at が 30 日以内 → trial
  5. free
```

- Team は「Stripe の外で合意・請求する契約」なので、アプリには契約記録だけを持つ。`monthly_amount_jpy` は表示・記録用で、決済処理には使わない。
- 当面 Stripe を使わない理由（2026-09-27）: Stripe の手数料（カード 3.6% + Billing 0.7%、請求書 + 銀行振込でも約 2.6%）を数チームのうちは払う意味が薄いこと、契約条件（金額・期間・代行の内容）をチームごとに柔軟に決めたいこと。
- Team 列のエンタイトルメントは全開放。契約で変わるのは金額だけ（REQ-207）。
- Pro → Team へ移る場合、Stripe の subscription は自動では止めない。運営者が Stripe で解約する（REQ-209）。

**代行入力はアプリ機能にしない**（2026-09-27）: 運営者のダミーアカウントを招待リンクで Team グループに参加させ、通常メンバーとして記録・注釈を入力する。依頼の受付・枠・状態はチームとのやり取り（契約）で管理する。運営者アカウントはメンバー一覧に表示され、Free に落ちたグループではメンバー数の 1 枠を占める（EDGE-405。必要なら SQL で `deleted_at` を付ける）。

**将来案: Team を Stripe に載せる**（チーム数が増えて請求業務が重くなったら。要件には含めない）:

```
Stripe:  Product「Team」 ─ Price team_<識別子>（チームごと）
Supabase: billing_plan_assignments (group_id → price_lookup_key)   ← 運営者が SQL で INSERT
Checkout: 割当があれば Team Price、なければ pro_monthly
Webhook:  lookup_key が team_ なら billing_subscriptions.plan='team'
get_group_plan: plan='team' の subscription → team（手動契約テーブルと併用可）
```

- 追加は「割当テーブル 1 つ + ミラーの `plan` 列 + Webhook の導出」で、Pro の配管をそのまま共用できる。
- 請求書払いにするなら運営者が Stripe ダッシュボードで subscription を作り、Customer に `metadata.group_id` を付ける運用が要る（REQ-122 保留）。
- Pro → Team の移行は subscription の Price 差し替えで行う（日割りは Stripe）。

### 3-4. 検証環境のプラン上書き（dev だけ書ける仕組み）

```
get_group_plan(group_id):
  1. billing_plan_overrides に行があればその plan   ← dev 専用。prd には行が存在し得ない
  2. billing_subscriptions に active/trialing/past_due があれば pro
  3. groups.created_at が 30 日以内なら trial
  4. free
```

- 「prd には行が存在し得ない」を DB で担保する: 書き込み RLS ポリシーに `is_dev_environment()` を含め、その関数は `current_setting('app.environment', true) = 'dev'` を返す。`app.environment` は **dev プロジェクトにだけ** `ALTER DATABASE postgres SET app.environment = 'dev'` で手動設定する（migration に書くと prd にも適用されるため書かない。手順は `docs/operations/` に記載）。
- UI 側は `runtimeConfig.public.env !== 'production'` で切替コントロールを出す。二重ゲートなので、どちらか一方の設定漏れでも prd で上書きは起きない。
- 上書きは `get_group_plan()` の最上流に入れるだけなので、UI ゲート・DB ガード・表示のすべてに自動で効く（上書き専用の分岐を作らない）。
- Stripe の決済フロー自体は test mode + テストカードで実費なしに検証する。上書きは「Stripe を経由せず素早くプランを変える」用、test mode は「Checkout → Webhook → Portal の配管を通す」用。

### 3-5. owner 不変条件

- `CREATE UNIQUE INDEX ... ON group_members (group_id) WHERE role = 'owner' AND deleted_at IS NULL` で「2 人以上」を禁止。
- 「0 人」の禁止は、owner 行の DELETE / 降格を拒否するトリガ（または `group_members` に UPDATE / DELETE の RLS ポリシーが無いことの確認）で担保。脱退・譲渡機能が無い現状では、RPC 以外から role が変わる経路が無いことをテストで固定する。
- バックフィルは `joined_at` 最古（同時刻は `id` 昇順）。`groups.created_by` が無いための代替（REQ-003 🟡）。

### 3-6. 制限スイッチと DB ガードの同期（NFR-302）

TS 定数 `ENTITLEMENTS.matchLimit.free` と DB 側ガードの上限値を二重管理しないための候補:

| 案 | 仕組み | 長所 | 短所 |
|---|---|---|---|
| (a) DB 関数に定数を持たせ TS はそれを読む | `get_match_limit(plan)` SQL 関数 → TS はビルド時に読めないので RPC で取得 | DB が唯一の真実 | UI が上限を知るのに RPC 1 回増える |
| (b) TS 定数を migration で DB の `app_settings` 行に写す | migration で `INSERT INTO app_settings (key, value)`。TS 側はテストで一致を検証 | UI は同期不要 | 変更時に migration + 定数の 2 箇所（テストで検出） |
| (c) INSERT を RPC 化し、上限をクライアントから渡さず RPC 内定数で判定 | `create_match(...)` RPC | 既存 RLS を触らない | `useCreateMatch` の書き換え |

設計で選ぶ。要件としては「1 箇所で切り替わり、二重管理しない」（NFR-302）のみ。

## 4. 未決事項（ユーザ確認が必要）

1. **バックフィル前の現状確認**: 有効メンバー 0 人のグループが dev / prd に存在するか（EDGE-302）。存在すれば owner 無しを許容するか、そのグループを論理削除するか。
2. ~~累計試合数に削除済みを含めるか~~ → **含めない**で確定（2026-09-27）。削除すれば枠が戻る。
3. **[C] ガードの実装方式**: RLS `WITH CHECK` 拡張か、INSERT の RPC 化か（§3-4）。設計で決めるが、`useCreateMatch` の書き換え可否は先に確認したい。
4. **詳細ダッシュボードの範囲**（REQ-025）: 「ショット統計 4 タブ = 詳細、得点率・ラリー長・ラリー一覧 = 基本」で仮置き。ADR-013 §影響 2「基本 / 詳細でグルーピング」の線引きを確定したい。
5. **特商法ページのルートと事業者情報**: `/tokushoho` を想定。事業者名・所在地・連絡先の記載内容（個人開発の場合、請求があれば遅滞なく開示する旨の省略記載が可能）。
6. **価格**: ADR-019 どおりローンチ時決定。要件では未定のまま（REQ-407）。
7. ~~Trial 終了間近の注意表示の閾値~~ → 不要で確定（2026-09-27、REQ-114 欠番）。
8. **Stripe アカウント**: 開設・本人確認・live mode 審査の着手時期（[B] の前提。ADR-019 §9）。
9. **設定画面の Pro 金額表示の取得経路**（REQ-028 🟡）: (a) server route `GET /api/stripe/price` が `pro_monthly` の Price を取得し短時間キャッシュ、(b) i18n / 定数に金額を書く（Stripe と食い違うリスク）、(c) 金額はアプリに出さず Checkout 画面でのみ見せる。本書は (a) を想定。
10. **特商法ページの価格表示**: Pro は標準価格を明記。Team は「法人・チーム向けの個別契約は別途見積」の一文で足りるか確認したい。
11. ~~Team の契約入口~~ → 当面は手動契約（アプリ外請求）で確定（2026-09-27）。Stripe に載せる将来案は §3-3。REQ-122 はその時に決める（保留）。
12. ~~支払い失敗後の猶予期間と停止方法~~ → **14 日**で確定（2026-09-27）。Stripe の Smart Retries を 14 日以内に設定し、最終アクションは `unpaid`（未払い請求書の支払いで自動復帰）。アプリ側に猶予計算は持たない（REQ-005 / REQ-110 / REQ-117 / NFR-404）。
13. **検証環境の識別方式**（REQ-031 🟡）: `ALTER DATABASE ... SET app.environment = 'dev'` を dev プロジェクトに手動設定する案を想定。代替は `app_settings` テーブルに環境行を手動 INSERT（migration では入れない）。どちらも「prd に設定を入れない」運用ルールが要る。
14. ~~エンタイトルメントの内容~~ → §5 で確定（2026-09-27）。
15. ~~代行依頼の運営者通知手段~~ → 代行はアプリ機能にしないため不要（2026-09-27）。
16. ~~代行の枠の単位~~ → 同上、不要。
17. ~~Pro の代行~~ → 同上、不要。

## 5. エンタイトルメント（確定 2026-09-27）

| キー | Free | Trial（30 日） | Pro | Team | 根拠 |
|---|---|---|---|---|---|
| `matchLimit`（累計の有効な試合数） | **10** | **10** | ∞ | ∞ | ユーザー決定。ローンチ時はスイッチ OFF（null） |
| `playerLimit`（選手登録数） | **10** | **10** | ∞ | ∞ | 同上 |
| `memberLimit`（グループメンバー数） | **4** | **4** | ∞ | ∞ | 同上 |
| `shotAnnotation`（ショット注釈） | × | ○ | ○ | ○ | Free は詳細統計が無いので注釈も不要 |
| `detailedDashboard`（詳細統計 4 タブ） | × | ○ | ○ | ○ | ADR-013 |
| `ads`（広告） | あり | **あり** | なし | なし | Trial も広告あり（ユーザー決定）。実装は後 |
| `aiAutoRecord`（将来） | × | △ | ○ | ○ | ADR-013 |
| `clipExport`（将来） | × | × | ○ | ○ | ADR-013 |

全プランで開放（マトリクスに載せない）: 試合の記録、基本統計とフィルタ、**動画連携（YouTube / ローカル）**、シングルス。代行入力はアプリ機能ではないためマトリクスに持たない。

読み方: **Trial = Free + 注釈 + 詳細統計**。上限も広告も Free と同じなので、Trial の役割は「30 日間だけ詳細統計の価値を見せる」に絞られる。Pro / Team の価値は「上限なし + 広告なし + 注釈・詳細統計」。

ADR-013 §4 のたたき台（Trial 無制限・広告なし）からの変更点として ADR-019 §6 に追記する。

サーバー側ガードの対象（書き込み系）: `matches` INSERT（REQ-022）、`players` INSERT（REQ-047）、`join_group_with_code`（REQ-048）。注釈（`shots`）は UI ゲートのみ（REQ-049 🟡）。

## 6. スコープ外（今後）

- owner の譲渡・脱退・グループ削除（脱退機能自体が未実装）
- 広告（AdSense）
- 年額プラン・複数 Price・クーポン・Stripe Tax
- 詳細ダッシュボードのサーバー側強制（stats read function への `get_group_plan()` 検査）
- Team ごとの機能差（Team 列は全チーム共通で無制限。2026-09-27 決定）
- Team 契約の管理 UI（SQL 運用）
- Team の請求処理（アプリ外）と Team の Stripe 統一（将来案 §3-3）
- 代行入力のアプリ機能（依頼・枠・状態管理）。ダミーアカウント招待による手動運用
- AI 自動記録・切り抜きのゲート実装

## 7. 参考

- Stripe Checkout（subscription mode）: https://docs.stripe.com/payments/checkout
- Stripe Customer Portal: https://docs.stripe.com/customer-management
- Stripe Webhooks（署名検証・順序保証なし・再送）: https://docs.stripe.com/webhooks
- Stripe subscription status 一覧: https://docs.stripe.com/billing/subscriptions/overview#subscription-statuses
- Stripe Smart Retries: https://docs.stripe.com/billing/revenue-recovery/smart-retries
- 特定商取引法 §11（通信販売の広告表示）: https://www.no-trouble.caa.go.jp/what/mailorder/
