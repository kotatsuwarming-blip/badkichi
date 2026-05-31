# ADR-011: レイアウト戦略 (認証前後の 2 レイアウト構成)

## ステータス
Accepted (2026-05-30)

## 用語の前提

本 ADR で扱う **layout** は Nuxt の用語で、`app/layouts/` 配下に置く「複数 page で共有する外枠
(ヘッダー・フッター・コンテナ等) を定義する Vue コンポーネント」を指す。page は `<slot />` の中身
として描画される。

- 既定レイアウトは `default.vue` (page 側で `definePageMeta({ layout })` を指定しなければ自動適用)
- page ごとに `definePageMeta({ layout: 'auth' })` で明示的に切り替え可能

データエンジニアアナロジー: layout = BI ツールのダッシュボード共通テンプレート (ヘッダー / ナビは
テンプレ側に 1 回だけ定義し、各レポートはコンテンツ領域だけ差し込む)。

## 背景

auth-onboarding 単位 (requirements.md REQ-001〜108) で、本プロジェクト初の `app/layouts/` を導入する。
画面は認証前後で外枠の性質が根本的に異なる:

| 区分 | 該当 page | 外枠の要件 |
|------|----------|----------|
| 認証**前** | `/login`, `/confirm` | 中央寄せ・ロゴのみ。ヘッダー (ユーザアバター / ログアウト) は存在しえない (未ログインのため) |
| 認証**後** | `/onboarding`, `/groups/new`, `/join/[code]`, `/groups/[id]/settings`, および player-management 以降の全 page | 共通ヘッダー (ロゴ + ユーザアバター + **ログアウト**) + コンテンツ領域 |

ADR-008 は middleware を `auth.global.ts` 1 本に集約し「保護漏れゼロ」を**構造的に**保証した。
同じ「事故を構造で防ぐ」思想を、**レイアウト (ヘッダー / ログアウトの付け忘れ防止)** にも適用する
論点が残っていた (architecture.md でレイアウト戦略が 🟡 黄信号だった)。本 ADR でこれを確定する。

**残る論点**: レイアウトを何枚に分けるか、REQ-008 (ログアウト) をどこに 1 回だけ実装するか。

## 決定

### D1: 認証前後で 2 レイアウト構成

| レイアウト | 適用 page | 内容 | 指定方法 |
|-----------|----------|------|---------|
| `app/layouts/auth.vue` | `/login`, `/confirm` | 中央寄せ・ロゴのみ・ヘッダーなし | 各 page で `definePageMeta({ layout: 'auth' })` |
| `app/layouts/default.vue` | 認証後の全 page (`/onboarding`, `/groups/new`, `/join/[code]`, `/groups/[id]/settings` および後続単位の全 page) | ヘッダー (ロゴ + ユーザアバター + **ログアウト**) + `<slot />` | 無指定で自動適用 |

- **認証後ページは `default.vue` を「無指定で」使う**。明示指定を要求すると後続単位で付け忘れが起こる
  ため、既定レイアウト = 認証後レイアウトとし、例外 (`auth`) だけを明示する。
- `/join/[code]` は public path (未ログインでも URL に着地しうる) だが、レイアウトは認証後の
  `default.vue` を使う。未認証時のリダイレクトは page 内で行う (ADR-008 D1 の例外) ため、
  レイアウト分岐とは独立。

### D2: REQ-008 (ログアウト) は `default.vue` ヘッダーに 1 回だけ実装

ログアウトボタン / ユーザアバターは `default.vue` のヘッダーに**唯一の実装**として置く。

- player-management 以降で page を追加しても、既定レイアウト適用により**自動でヘッダー +
  ログアウトが付く** (付け忘れが構造的に発生しない)。
- これは ADR-008 D1 の「middleware global 一本で保護漏れゼロ」と同じ事故防止思想 (NFR-104) を
  レイアウト層に展開したもの。

### D3: レイアウト内部の具体マークアップは kairo-implement で確定

本 ADR が確定するのは「**枚数 (2 枚)・各レイアウトの責務・ログアウトの所在**」のみ。
どの Nuxt UI コンポーネント (`UContainer` / `UHeader` 等) でヘッダーを組むか、ロゴ画像の配置等の
具体マークアップは実装フェーズ (kairo-implement) で決める。設計を過剰に固めない。

## 理由

1. **認証前後で外枠が本質的に異なる** (D1): 未ログイン画面にユーザアバター / ログアウトは存在しえず、
   認証後画面には必須。1 レイアウトに `v-if="user"` で両対応させると外枠ロジックが肥大化し、
   SSR 時のちらつき (未ログイン枠 → 認証後枠) の温床になる。物理的に 2 枚に分ける方が単純。
2. **既定 = 認証後レイアウトで付け忘れゼロ** (D2): 認証後 page が圧倒的多数 (MVP 6 page 中 4、
   後続単位ではほぼ全部)。多数派を既定にし少数派 (`auth`) を明示することで、後続単位の page 追加時に
   「ログアウト付け忘れ」が構造的に起こらない。ADR-008 の「保護漏れゼロ」と一貫した思想。
3. **設計と実装の責務分離** (D3): レイアウトの枚数・責務は設計判断、内部マークアップは実装判断。
   後者を本 ADR で固定すると実装の自由度を不当に奪う。

## 影響

### auth-onboarding 単位への影響

| 新規ファイル | 内容 |
|------------|------|
| `app/layouts/auth.vue` | 中央寄せ・ロゴのみ。`/login`, `/confirm` が使用 |
| `app/layouts/default.vue` | ヘッダー (ロゴ + アバター + ログアウト) + `<slot />`。認証後全 page が自動使用 |

- `/login`, `/confirm` の page に `definePageMeta({ layout: 'auth' })` を付与。
- ログアウト処理は `useLogin().logout()` (ADR-007 / architecture.md) を `default.vue` ヘッダーから呼ぶ。

### 後続 UI 単位への影響

player-management 以降の全 page は **`definePageMeta({ layout })` を指定しない**ことで `default.vue`
を自動適用し、ヘッダー + ログアウトを継承する。新たなレイアウトが必要になった場合 (例: 印刷専用ビュー)
のみ本 ADR を再評価する。

### data-foundation への影響

なし (UI 層のみ)。

## 採用しなかった選択肢

| 案 | 却下理由 |
|---|---|
| A. 1 レイアウトに集約し `v-if="user"` でヘッダー出し分け | 外枠ロジックが肥大化、SSR で未ログイン枠→認証後枠のちらつき、責務が不明確 |
| B. レイアウトを使わず各 page でヘッダーを直書き | REQ-008 (ログアウト) が page ごとに分散、後続単位で付け忘れ多発。NFR-104 の事故防止思想に反する |
| C. 3 枚以上に細分化 (例: onboarding 専用 / settings 専用) | MVP では認証後の外枠は共通で足り、過剰分割。必要になってから分ければよい (YAGNI) |
| D. 認証後レイアウトを `auth-required.vue` 等の明示名にし default を空にする | 認証後 page が多数派なので明示指定は付け忘れリスク。既定 = 多数派が事故防止に最適 (D2) |

## 関連メモリ

- `[[project-auth-onboarding-design-progress]]`: 本 ADR は architecture.md のレイアウト戦略 🟡 を 🔵 化する起票
- `[[project-adr-candidates-pre-kairo-design]]`: レイアウト戦略は kairo-design 中に顕在化した追加 ADR 論点

## 参考

- Nuxt 4 公式 docs (layouts): https://nuxt.com/docs/guide/directory-structure/layouts
- ADR-008 (middleware 戦略) D1: 「global 一本で保護漏れゼロ」— 本 ADR の事故防止思想の源流
- ADR-007 (composable 命名) / architecture.md: `useLogin().logout()` をヘッダーから呼ぶ
- `docs/design/auth-onboarding/architecture.md` §レイアウト戦略 / §画面構成
- `docs/spec/auth-onboarding/requirements.md` REQ-008, NFR-104
