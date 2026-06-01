# TASK-0015 TDD テストケース: /login + /confirm pages

**機能名**: 認証前ページ (auth-pages: `/login` + `/confirm`)
**タスクID**: TASK-0015
**要件名**: auth-onboarding
**作成日**: 2026-06-01

---

## 信頼性レベル凡例

- 🔵 **青信号**: 要件定義・設計文書・既存実装を参照し、ほぼ推測していない
- 🟡 **黄信号**: 元資料からの妥当な推測
- 🔴 **赤信号**: 元資料にない推測

---

## 0. 結論サマリー（最重要）

**判定: 本タスクで新規テストケースは作成しない（page 単体テスト不要）。** 🔵

- 内訳: 正常系 **0** / 異常系 **0** / 境界値 **0**（新規）
- 根拠: NFR-301（UI 見た目テストを書かない）+ `/login` `/confirm` の振る舞いを構成する全要素が依存層で検証済であることを、本フェーズで現物テストと突き合わせて確認した。
- tdd-red / tdd-green では新規テストファイルを作らず、`login.vue` / `confirm.vue` の実装と `pnpm typecheck` / `pnpm lint` / 既存依存テスト緑で完了確認する。

この判定は「テストを書かないことを確認した」フェーズであり、後続フェーズ（tdd-red 以降）は §5 の「テスト不要の最終確認チェックリスト」に従う。

---

## 1. テスト対象の構成要素と依存層カバレッジ（実物突き合わせ）

`/login` `/confirm` page が担う振る舞いを構成要素に分解し、各要素のテスト責務がどこにあるかを実ファイルで確認した結果。

| # | page が担う振る舞い | 構成要素 | テスト責務の所在 | 確認した実テスト | 状態 |
|---|---|---|---|---|---|
| A | `/login` ボタン押下 → `useLogin().login(redirect)` 呼び出し | `useLogin.login` | TASK-0008 | `tests/unit/composables/useLogin.test.ts` TC1 | ✅ 検証済 🔵 |
| B | `login` 内の redirect 運搬（`/confirm?redirect=` 組み立て） | `useLogin.login` | TASK-0008 | `useLogin.test.ts` TC1（`redirectTo` を `toContain('/confirm?redirect=')` で検証） | ✅ 検証済 🔵 |
| C | `/login` Auth エラー → `notice` セット・リダイレクトなし（EDGE-002） | `useLogin.login` | TASK-0008 | `useLogin.test.ts` TC3 | ✅ 検証済 🔵 |
| D | `/login` 二重送信防止（pending disabled、EDGE-003） | `useLogin.pending` | TASK-0008 | `useLogin.ts` 実装（finally で pending 戻し）。ボタン disabled 結線は見た目領域（NFR-301 除外） | ✅ ロジック検証済 / 結線は除外 🔵 |
| E | `/confirm` 確立後の Group 有無による二次振り分け（`/onboarding` or 目的地 or 通過） | `auth.global.ts` middleware | TASK-0013 | `tests/unit/middleware/auth.test.ts` TC1〜TC7（7 分岐網羅） | ✅ 検証済 🔵 |
| F | `/login` 所属済ユーザの `/` 振り分け（public path 側） | `auth.global.ts` middleware | TASK-0013 | `auth.test.ts` TC5 | ✅ 検証済 🔵 |
| G | `/confirm` `<USkeleton>` ローディング表示（REQ-203 / NFR-202） | template 見た目 | — | NFR-301 により書かない | 🚫 対象外 🔵 |
| H | `/confirm` `<UAlert>` + 「ログイン画面に戻る」表示（EDGE-002） | template 見た目 | — | NFR-301 により書かない | 🚫 対象外 🔵 |
| I | redirect チェーン全体の通し（EDGE-001） | E2E | TASK-0020 | TASK-0020（Playwright / NFR-302）へ委譲 | ⏭ 委譲 🔵 |

→ A〜F はロジックがすべて依存層で検証済。G・H は NFR-301 除外。I は E2E 委譲。**新規 page 単体テストの対象は残らない。**

---

## 2. page 固有ロジックの精査（唯一の検討対象）

`/confirm` 本実装は「セッション確立待ち → `navigateTo(route.query.redirect ?? '/')`」という、依存 composable に存在しない page 固有の結線を持つ。これがテスト新規作成の唯一の候補のため、個別に精査した。

### 2.1 候補ロジック

- `confirm.vue` が `useSupabaseUser()` を watch し、確立後に `navigateTo(route.query.redirect ?? '/')` を呼ぶ。
- 既存スタブ（`app/pages/confirm.vue`）は `navigateTo('/')` 固定。本実装で `route.query.redirect ?? '/'`（redirect クエリ尊重 + デフォルト `/`）に置換される。
- `useLogin.ts` 実物を確認: `login` は OAuth 開始までが責務で、確立待ち・確立後遷移は **持たない**。よって §2 のロジックは純粋に page 固有。

### 2.2 redirect 解決の境界（あり / なし）

- **redirect なし** → `route.query.redirect` が `undefined` → `?? '/'` で `/` へ遷移（UC-2）。
- **redirect あり** → `route.query.redirect` の値（例 `/join/abc12345`）へ遷移（UC-3 / EDGE-001）。

この 2 ケースが境界値の全量。ただし下記理由により新規テストを書かない。

### 2.3 新規テストを書かない理由 🔵

1. **NFR-301**: 「UI 全体の見た目テストは書かない」「ボタンクリック → composable 呼び出しの結線の単体テストも、依存層検証済かつ見た目領域のため新規作成しない」と要件定義 §5.2 が明示。`route.query.redirect ?? '/'` の解決も page template/script の結線であり、`useSupabaseUser()` watch・`navigateTo`・`route.query` の各構成要素は依存層・Nuxt 標準で検証済。
2. **遷移先二次判定の委譲**: `navigateTo(...)` の遷移先で実際にどこへ着地するか（Group 有無分岐）は middleware TC1〜TC7（特に着地時の §1 判定）で検証済。`/confirm` は「redirect クエリを読んで navigate する」だけで、振り分け判断を持たない（要件定義 §3 public path 制約）。
3. **`?? '/'` デフォルトの自明性**: nullish 合体演算子による単純デフォルトで、分岐ロジックとしての複雑さがない。境界値テストを起こす価値が冗長判定基準（境界値 + 分岐カバレッジのみ）に照らして低い。
4. **E2E 委譲**: redirect チェーン全体（EDGE-001: `/join/[code]` → `/login?redirect=` → OAuth → `/confirm?redirect=` → 元 page）の通し検証は TASK-0020（NFR-302）が担う。page 単体で部分検証しても E2E と重複する。

→ 以上より、§2 の候補ロジックも新規 page 単体テストの対象としない。

---

## 3. 正常系・異常系・境界値（新規分: いずれも 0 件）

NFR-301 と §1〜§2 の精査により、本タスクで新規作成するテストは以下のとおりゼロ。参考として「もし NFR-301 がなければ書いていたであろうケース」と「その代替検証先」を記録する（実装はしない）。

### 3.1 正常系（新規 0 件）

| 仮テスト名 | 代替検証先（実在） | 新規要否 |
|---|---|---|
| `/login` ボタン押下で `login(redirect)` が呼ばれる | `useLogin.test.ts` TC1 + 見た目結線（NFR-301 除外） | 不要 🔵 |
| `/confirm` 確立後 redirect なしで `/` へ遷移 | page 結線（NFR-301 除外）+ middleware TC で着地検証 | 不要 🔵 |

### 3.2 異常系（新規 0 件）

| 仮テスト名 | 代替検証先（実在） | 新規要否 |
|---|---|---|
| `/confirm` Auth エラー時に `<UAlert>` + 戻るボタン表示 | `useLogin.test.ts` TC3（notice セット）+ 見た目（NFR-301 除外） | 不要 🔵 |
| `/login` 二重押下が抑止される | `useLogin.ts` pending 実装 + 見た目 disabled（NFR-301 除外） | 不要 🔵 |

### 3.3 境界値（新規 0 件）

| 仮テスト名 | 代替検証先（実在） | 新規要否 |
|---|---|---|
| redirect クエリ あり（`/join/...`） / なし（`undefined` → `/`） | §2.2 の自明結線 + EDGE-001 を TASK-0020 E2E で通し検証 | 不要 🔵 |

---

## 4. 開発言語・フレームワーク（参考: 新規テスト作成時の前提）

新規テストは作成しないが、もし依存層に不足が判明した場合に追加する際の前提を記録する。

- **プログラミング言語**: TypeScript (strict mode)
  - **言語選択の理由**: プロジェクト全体が Nuxt 4 + TypeScript strict。型でテストデータ・mock の整合を担保できる。
  - **テストに適した機能**: 型推論により mock の戻り値型ずれをコンパイル時に検出。
- **テストフレームワーク**: Vitest v4.1.4 + @nuxt/test-utils v4.0.2
  - **フレームワーク選択の理由**: 既存依存テスト（useLogin.test.ts / auth.test.ts）が Vitest + `#imports` / `#nuxt-router` / `#supabase-client` alias mock パターンで確立済。追加が必要になっても同パターンを踏襲できる。
  - **テスト実行環境**: mock unit は `tests/unit/`（pre-commit + CI）。integration は `*.integration.test.ts`（CI 専用、fileParallelism: false）。
- 🔵 信頼性レベル: note.md §5 / vitest.config.ts / 既存テスト実物に基づく

---

## 5. tdd-red / tdd-green 向け「テスト不要の最終確認チェックリスト」

後続フェーズで「本当にテスト不要か」を再確認するためのチェックリスト。すべて ✅ なら新規テストなしで tdd-green（実装）へ進む。

- [ ] `confirm.vue` 本実装が `useLogin` / `useCurrentGroup` 以外の **新しいドメインロジック**（バリデーション・状態計算・条件分岐）を持ち込んでいないか → 持ち込むなら、そのロジックに限り最小の境界値 + 分岐テストを追加。
- [ ] `login.vue` が `useLogin().login()` 呼び出し **以外**の副作用を持っていないか。
- [ ] redirect 解決が `route.query.redirect ?? '/'` の単純結線にとどまっているか（複雑な正規化・検証を足していないか）。複雑化したらその部分のみテスト対象化。
- [ ] EDGE-002 のエラー表示が `useLogin.notice` の `<UAlert>` バインドにとどまり、page で独自エラー判定を書いていないか。
- [ ] 依存層（useLogin TC1〜TC3 / middleware TC1〜TC7）が緑のままか（`pnpm test`）。

→ いずれかのチェックで「page が新規ロジックを獲得した」場合のみ、その**獲得分に限定**して上記フレームワーク（§4）で最小テストを追加する。それ以外は新規テストなしを維持。

---

## 6. 要件定義との対応関係

- **参照した機能概要**: auth-pages-requirements.md §1（`/login` `/confirm` の責務）
- **参照した入力・出力仕様**: auth-pages-requirements.md §2.1 / §2.2（redirect 入力・navigateTo 副作用・page meta）
- **参照した制約条件**: auth-pages-requirements.md §3（REQ-406 Supabase 直叩き禁止 / public path / NFR-301 テスト除外）
- **参照した使用例**: auth-pages-requirements.md §4（UC-1〜UC-3 / EDGE-001/002/003）
- **参照したテスト対象範囲**: auth-pages-requirements.md §5（5.1 新規対象なし / 5.2 書かないもの / 5.3 E2E 委譲）
- **参照した既存実装**:
  - `app/composables/useLogin.ts`（login が OAuth 開始まで・確立待ちは持たないことを確認）
  - `app/pages/confirm.vue`（置換対象スタブの現状）
  - `tests/unit/composables/useLogin.test.ts`（TC1〜TC3 でカバレッジ A/B/C/D を確認）
  - `tests/unit/middleware/auth.test.ts`（TC1〜TC7 でカバレッジ E/F を確認）
- **参照したコンテキストノート**: `docs/implements/auth-onboarding/TASK-0015/note.md` §5（テスト関連）/ §7（注意事項）

---

## 7. 品質判定

| 観点 | 判定 |
|---|---|
| テストケース分類 | 正常系・異常系・境界値を §3 で網羅的に検討し、各々「依存層検証済 / NFR-301 除外 / E2E 委譲」で新規 0 件と結論 ✅ |
| 期待値定義 | 各構成要素の検証責務所在を実テストファイル・行レベル（TC 番号）で特定済 ✅ |
| 技術選択 | TypeScript + Vitest + @nuxt/test-utils で確定（既存パターン踏襲） ✅ |
| 実装可能性 | 新規テストなしのため実装リスクなし。追加が必要化した場合の手順も §5 に明示 ✅ |
| 信頼性レベル | 🔵 が大多数（要件定義 §5 明示 + 依存テスト実物突き合わせ済）。🟡/🔴 なし |

**総合品質評価**: ✅ 高品質（新規テスト不要の判定を、実テスト突き合わせで根拠づけ）
