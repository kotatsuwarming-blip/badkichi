# ADR-019: 課金システム (サブスク) の具体設計

## ステータス
Proposed (2026-07-06)

## 背景

ADR-013 で収益化の**方針** (freemium / Free・Trial・Pro の 3 プラン / Stripe / 累計試合数制限 /
機能×プランのエンタイトルメント・マトリクス) は確定済み。ただし実装可能なレベルの
**具体設計** (課金主体・DB スキーマ・Stripe 連携アーキテクチャ・制限の強制ポイント) は
未着手だった。

課金の実装はフェーズ的にまだ先だが、以下の理由で設計だけ先に確定しておく:

- 課金主体の選択がスキーマ全体の形を決めるため、後続機能 (AI 入力補助等) の設計時に
  「どの単位で課金ゲートがかかるか」を前提にできる
- 特商法表記など、課金開始前に必要な非実装タスクを洗い出しておける

本 ADR は**設計の確定**であり、実装は含まない。実装時は本 ADR を入力として
kairo-requirements → kairo-design → kairo-tasks の通常フローに乗せる。

## 決定

### 1. 課金主体: グループ定額 (代表者が支払い、グループ全員に効く)

**ユーザー確認済みの事業判断 (2026-07-06)。**

- サブスクは `groups` に紐づく。代表者 (owner) 1 人が月額を支払うと、
  そのグループの全メンバーが Pro になる
- YouTube Premium ファミリープラン / Notion 旧チームプラン型のモデル
- 席数 (per-seat) 課金ではなく**定額**。メンバー数はプラン判定・請求額に影響しない

採用理由:

- 試合・記録データはすべて `matches.group_id` に紐づく**グループ資源**であり、
  中核の制限である「累計試合数」の集計単位と課金単位が一致する。
  プラン判定が「グループ 1 行を見るだけ」になり、設計が最も素直
- ユーザー個人課金だと「無料メンバーがいるグループの試合数上限は誰のプランで判定するか」
  というグループ資源との不整合が生じ、記録系機能のルールが複雑化する
- 席数課金はメンバー増減のたびに Stripe の数量更新・日割り (proration)・席超過処理が必要で
  実装が最も重く、数人の趣味チームには価格体系としても過剰

#### 1-1. owner 概念の追加が必要

現状 `group_members` に role カラムはない。additive migration で追加する:

```sql
-- 追記 migration (実装フェーズ A)
ALTER TABLE group_members
  ADD COLUMN role text NOT NULL DEFAULT 'member'
  CHECK (role IN ('owner', 'member'));

-- 既存グループはグループ作成者を owner に昇格するバックフィルが必要。
-- 新規グループは作成 RPC (create_group_with_membership 系) で作成者を owner にする
```

- owner はグループに**ちょうど 1 人** (MVP)。課金操作 (Checkout 開始 / Customer Portal) は
  owner のみ実行可能
- owner の譲渡・脱退時の引き継ぎは実装フェーズで設計する (本 ADR では「owner 不在の
  グループを作らない」という不変条件だけ確定)

### 2. Stripe 連携: Hosted Checkout + Customer Portal + Webhook 同期

自前で構築する決済 UI を**ゼロ**にする構成を採る:

| 責務 | 使うもの | 自前実装 |
|---|---|---|
| カード入力・決済画面 | **Stripe Checkout (ホスト型)** | リダイレクトする API 1 本のみ |
| プラン管理・解約・カード変更 | **Stripe Customer Portal** | リダイレクトする API 1 本のみ |
| 請求書・領収書メール | Stripe 標準機能 | なし |
| 支払い失敗の再試行・督促 | Stripe Smart Retries + 督促メール | なし |
| 課金状態の DB 反映 | **Webhook → Supabase 同期** | Webhook ハンドラ 1 本 |

- Product / Price は Stripe ダッシュボードで管理: Product「Pro」× Price 1 本
  (月額 JPY、`lookup_key: 'pro_monthly'`)。**金額はローンチ時に決定** (本 ADR では未定のまま)
- Checkout はホスト型なのでフロントに Stripe.js / publishable key は不要
  (サーバーで作った session の URL にリダイレクトするだけ)
- 決済 UI 3 方式の比較は §理由 2 を参照

### 3. DB スキーマ: Stripe をミラーする 2 テーブル

> **データエンジニア向けの見取り図**: Stripe が SoR (Source of Record)、
> Supabase 側テーブルはその**レプリカ (read model)**、Webhook は **CDC ストリーム**に相当する。
> アプリのプラン判定は常にレプリカを読む (Stripe API を同期パスで叩かない)。

```sql
-- グループ ⇄ Stripe Customer の恒久的な ID マッピング (1:1)
CREATE TABLE billing_customers (
  group_id           uuid PRIMARY KEY REFERENCES groups(id),
  stripe_customer_id text NOT NULL UNIQUE,
  created_by         uuid NOT NULL REFERENCES auth.users(id),  -- Checkout を開始した owner
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- サブスク状態のミラー (customer 1 : N subscription — Stripe のオブジェクトモデルに合わせる)
CREATE TABLE billing_subscriptions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id               uuid NOT NULL REFERENCES groups(id),
  stripe_subscription_id text NOT NULL UNIQUE,
  status                 text NOT NULL,      -- Stripe の status をそのまま保持 (変換しない)
  price_lookup_key       text,               -- 'pro_monthly' 等。将来の複数プラン対応
  current_period_end     timestamptz,
  cancel_at_period_end   boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
```

設計判断:

- **2 テーブルに分ける**: customer は「一度作ったら消えない ID マッピング」、
  subscription は「解約→再契約で行が増減する状態」。ライフサイクルが違うものを分離する
- **`status` は Stripe の値をそのまま保存** (`active` / `trialing` / `past_due` /
  `canceled` / `unpaid` …)。独自 enum に変換すると Stripe 側の状態遷移との突き合わせ
  (デバッグ) が困難になる。プランへの解釈は読み取り側の関数 (§4) に集約する
- **RLS**: グループメンバーは自グループの行を SELECT 可 (課金状態の表示用)。
  INSERT / UPDATE / DELETE は一切のポリシーを作らない = **service role (Webhook) のみ書ける**

### 4. プラン判定: SQL 関数 1 本に集約

ADR-013 §5 の判定ロジックを、DB 関数として一箇所に実装する
(UI・RLS・RPC のどこから使っても同じ答えになるようにするため):

```sql
CREATE FUNCTION get_group_plan(p_group_id uuid)
RETURNS text  -- 'free' | 'trial' | 'pro'
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT CASE
    -- past_due (支払い失敗の再試行中) は猶予として pro 扱い。
    -- Smart Retries が全滅すると Stripe 側で canceled/unpaid に遷移し、自然に free へ落ちる
    WHEN EXISTS (
      SELECT 1 FROM billing_subscriptions
      WHERE group_id = p_group_id
        AND status IN ('active', 'trialing', 'past_due')
    ) THEN 'pro'
    -- Trial = グループ作成から 30 日以内かつ未課金 (ADR-013 §5)。Stripe には依存しない
    WHEN EXISTS (
      SELECT 1 FROM groups
      WHERE id = p_group_id
        AND created_at > now() - interval '30 days'
    ) THEN 'trial'
    ELSE 'free'
  END
$$;
```

- **Trial は Stripe を使わない** (カード登録不要の試用)。`groups.created_at` からの純粋な
  計算なので、テーブルも Webhook も不要
- 既存の仲間内グループは `created_at` が古く Trial 終了済み扱いになるが、
  ローンチ時は制限スイッチ OFF (ADR-013 §理由 4) なので実害なし

### 5. Webhook 同期: Nuxt server route on Vercel

- エンドポイント: `server/api/stripe/webhook.post.ts` (Nitro / Vercel Functions)。
  Supabase Edge Functions ではなく Nuxt に同居させる (§理由 3)
- 署名検証: `STRIPE_WEBHOOK_SECRET` で必ず検証 (なりすまし防止)
- 購読イベント: `checkout.session.completed`,
  `customer.subscription.created / updated / deleted`
- **イベントは「トリガー」としてだけ使い、状態はその場で Stripe API から最新を再取得して
  upsert する** (fetch-then-upsert)。Webhook は順序保証がないため、イベントの payload を
  信じて書くと古い状態で上書きする競合が起きる。再取得なら常に最新に収束する
  (CDC でいう「イベントを notification に格下げし、スナップショットを引き直す」パターン)
- 冪等性: `stripe_subscription_id` UNIQUE への upsert なので、同一イベントの重複配送は無害
- 書き込みは service role key で行う。key は Vercel の環境変数でのみ渡す
  (`.env` ファイルには書かない — 既存 secret ポリシー通り)

#### 課金開始のシーケンス

```
owner                Nuxt server route           Stripe              Webhook → Supabase
  │ 「Pro にする」        │                         │                        │
  ├──────────────────────▶│ POST /api/stripe/checkout                        │
  │                       │ ① owner か検証           │                        │
  │                       │ ② customer 作成/再利用 ──▶│ (metadata: group_id)   │
  │                       │ ③ Checkout Session 作成 ─▶│                        │
  │ ◀── session.url ──────┤                         │                        │
  │ ─── カード入力・決済 ──────────────────────────────▶│                        │
  │                       │                         ├─ checkout.session.completed
  │                       │                         │        ──────────────▶ │ upsert
  │ ◀── success_url へ戻る ─────────────────────────── │                        │
  │   (プラン表示は反映まで数秒リトライ — Webhook との競合対策)                        │
```

解約は Customer Portal 内で完結: `cancel_at_period_end = true` → 期末までは Pro のまま →
期末に `customer.subscription.deleted` → free へ。

### 6. エンタイトルメント・マトリクスは TypeScript 定数 (DB テーブルにしない)

```ts
// shared/entitlements.ts — ADR-013 §4 のマトリクスの実装置き場
export const ENTITLEMENTS = {
  //                     free   trial   pro
  matchLimit:          { free: 10,    trial: null, pro: null },  // null = 無制限。
                                                                 // ローンチ時は free も null にして
                                                                 // 「スイッチ OFF」を表現 (ADR-013)
  detailedDashboard:   { free: false, trial: true, pro: true },
  ads:                 { free: true,  trial: false, pro: false },
  aiAutoRecord:        { free: false, trial: 'limited', pro: true },  // 将来
  clipExport:          { free: false, trial: false, pro: true }       // 将来。trial でも×
} as const
```

- 3 プラン × 十数機能の規模では、マトリクスの変更は必ずそれを使うコードの変更と
  同時に出荷される → コード定数が単純で型も効く
- DB テーブル化が勝つのは「デプロイなしで値を切り替えたい」「グループ個別の override が
  要る」段階。その時に移行すればよい (定数の形は上記のままテーブルに写せる)
- フロントは `useEntitlements()` composable (`usePlan()` + `can(feature)`) でこの定数を引く

### 7. 制限の強制は 2 層 (UI ゲート + サーバー側ガード)

| 層 | 役割 | 実装 |
|---|---|---|
| UI ゲート | UX (ロック表示 + アップグレード導線) | `useEntitlements()` で出し分け |
| サーバー側 | 改竄不能な本体 | 下記 |

- **累計試合数制限 (書き込み系)**: `matches` INSERT 時に
  `get_group_plan()` + `COUNT(matches)` を検査する DB 側ガード (RLS ポリシー拡張
  または INSERT を RPC 経由に寄せる — 実装フェーズで既存の書き込み経路に合わせて選択)。
  クライアント判定だけでは DevTools から直接 INSERT できてしまうため必須
- **詳細ダッシュボード (読み取り系)**: 当面 UI ゲートのみ。ADR-013 の分類で
  「消える価値型」= 突破されても資産が残らず従量コストもないため、サーバー強制の
  優先度は低い。公開規模が出たら stats 系 read function (ADR 済の
  `stats_dashboard_read_functions`) に `get_group_plan()` 検査を足す

### 8. 環境・運用

- **Stripe test mode = dev / live mode = prd** の 2 環境。キーと Webhook secret は環境ごとに
  分離し、Vercel 環境変数 / GitHub Environment Secrets で渡す
  (`.env*` ファイルには書かない)
- ローカルでの Webhook 検証は `stripe listen --forward-to localhost:3000/api/stripe/webhook`
  (Stripe CLI)
- 消費税は当面**内税表示** (Stripe Tax は規模が出てから)。領収書は Stripe の
  receipt メールに委譲

### 9. 課金開始前に必要な非実装タスク

- **特定商取引法に基づく表記**ページ (ADR-013 で記録済み。事業者名・価格・支払方法・
  解約条件・返金ポリシー「日割り返金なし、期末まで利用可」を記載)
- 利用規約に課金条項を追記 (プラン・自動更新・解約)
- Stripe アカウント開設と本人確認 (live mode の有効化には審査があるため先行して着手可)

### 10. 実装フェーズ分割 (実装時の kairo フローの単位)

| フェーズ | 内容 | Stripe 依存 |
|---|---|---|
| **A. プラン基盤** | `group_members.role` 追加 / billing 2 テーブル / `get_group_plan()` / `useEntitlements()` / 設定画面にプラン表示 | なし (free/trial 判定だけで動く) |
| **B. 決済** | Checkout / Customer Portal / Webhook ハンドラ / 特商法ページ | あり |
| **C. 制限スイッチ ON** | free の `matchLimit` に実数を設定 + サーバー側ガード有効化 | なし |

A は Stripe なしで完結するため、課金を始める前でも「トライアル残り日数の表示」等に使える。
C は公開時まで寝かせる (仲間内ローンチは制限なし — ADR-013 §理由 4)。

## 理由

### 1. 課金主体の比較 (ユーザー決定の記録)

| 案 | 実例 | 長所 | 短所 |
|---|---|---|---|
| **グループ定額 (採用)** | YouTube Premium ファミリー | 課金単位 = 試合データの単位。判定が 1 行参照。友人チームに導入しやすい | owner 概念の追加と譲渡設計が必要。収益は 1 チーム 1 件 |
| ユーザー個人課金 | Strava, Duolingo | 収益がユーザー数比例。owner 不要 | グループ資源 (試合数上限) と個人プランの不整合。記録系ルールが複雑化 |
| 席数課金 | Slack, Notion | 収益がチーム規模比例 | 数量更新・日割り・席超過の実装が最重量。趣味チームに過剰 |

### 2. 決済 UI 3 方式の比較

| 方式 | 実装量 | カスタマイズ | PCI 対応 | 判定 |
|---|---|---|---|---|
| **Hosted Checkout (採用)** | リダイレクト API 1 本 | 低 (ロゴ・色程度) | Stripe に完全委譲 | 個人開発の定番。決済画面の品質を無料で得る |
| Payment Element 埋め込み | フォーム統合 + 状態管理 | 高 | SAQ A (自己申告) | 自サイト内で完結させたい規模になったら |
| Payment Links | ダッシュボードで URL 発行のみ | 最低 | 委譲 | group_id との紐付け (metadata / client_reference_id) をコードで制御できず同期設計が崩れる |

### 3. Webhook の置き場所: Nuxt server route vs Supabase Edge Functions

| | Nuxt server route (採用) | Supabase Edge Functions |
|---|---|---|
| デプロイ | `git push` で本体と一緒 (Vercel) | `supabase functions deploy` の別パイプライン |
| 言語/ランタイム | 本体と同じ Nitro/Node | Deno (別知識) |
| コード共有 | `shared/entitlements.ts` 等をそのまま import | 不可 (別バンドル) |
| DB への近さ | ネットワーク越し (service role) | 同上 (優位性なし) |

どちらも成立するが、デプロイ・言語・コード共有の全てで本体同居が単純。
分ける理由が生まれるまで Vercel に寄せる。

### 4. 「Stripe を都度 API で読む」を採らない理由

プラン判定のたびに Stripe API を叩く案は、(a) レイテンシ (数百 ms) が全画面に乗る、
(b) rate limit、(c) **SQL (RLS / 集計関数) の中から参照できない**、の 3 点で不採用。
ミラーテーブル + Webhook (= レプリカ + CDC) が Stripe 公式も推奨する定番構成。

## 影響

- 実装フェーズ A の前提として、グループ作成 RPC に owner 付与の変更が入る
  (auth-onboarding ユニットの既存実装への追記)
- 今後の新機能は設計時に `ENTITLEMENTS` へ 1 行足すだけで課金ゲートを宣言できる
  (ADR-013 §影響 の「3 列メモ」の置き場所が確定した)
- ADR-013 の決定内容 (プラン構成・マトリクス・累計制限) は変更しない。本 ADR は
  その実現手段の確定のみ

## 採用しなかった選択肢

| 案 | 却下理由 |
|---|---|
| ユーザー個人課金 / 席数課金 | §理由 1 (ユーザー決定 2026-07-06) |
| Payment Element / Payment Links | §理由 2 |
| Supabase Edge Functions で Webhook | §理由 3 |
| プラン判定のたびに Stripe API を参照 | §理由 4 |
| エンタイトルメントの DB テーブル化 | 現規模ではコード定数が単純・型安全。リモート切替や個別 override が要る段階で移行 (§6) |
| Stripe の trial 機能 (trial_period_days) | Trial にカード登録を要求してしまう。ADR-013 の Trial は「登録から 30 日」の計算で足り、Stripe 非依存にできる (§4) |
| stripe-sync-engine 等の全量ミラー | Stripe の全オブジェクトを同期するのは過剰。必要なのは subscription の状態だけ |

## 関連

- ADR-013 (収益化方針 — 本 ADR の上位方針)
- ADR-006 (single group per user — owner 概念の追加先)
- ADR-010 (SSR/CSR 境界 — server route は Nitro 側で完結)
- ADR-016 (法務ページ — 特商法表記の追加先の兄弟ページ)
- Stripe Checkout: https://docs.stripe.com/payments/checkout
- Stripe Customer Portal: https://docs.stripe.com/customer-management
- Stripe Webhooks (順序保証なし・冪等性): https://docs.stripe.com/webhooks
- Stripe Smart Retries: https://docs.stripe.com/billing/revenue-recovery/smart-retries
