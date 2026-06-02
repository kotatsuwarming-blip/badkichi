# TDDテストケース定義書: /join/[code] ページ (TASK-0018)

- **機能名**: 招待リンク着地ページ (`/join/[code]`)
- **タスクID**: TASK-0018
- **要件名**: auth-onboarding
- **実装ファイル**: `app/pages/join/[code].vue`（page）/ `app/utils/redirect.ts`（純粋関数 候補）
- **依存**: `useJoinGroup` (TASK-0011), `default.vue` layout (TASK-0014), `auth.global.ts` middleware (TASK-0013)
- **作成日**: 2026-06-01

---

## 0. テスト方針サマリー（NFR-301 + mock-unit 限定の検証配置）

要件定義書 §5 の検証配置に基づき、本 page の各ロジックを **どの層で検証するか** を確定する。冗長を避けるため、依存層・E2E で既にカバーされる分岐は page では再テストしない。

| 分類 | ロジック | 検証配置 | 本書での扱い |
|---|---|---|---|
| A | join 成功 / `already_in_group` / `invitation_expired` / `invitation_not_found`→`INVITATION_NOT_FOUND_BY_LINK` 変換 / `notice` 設定 / `pending` 遷移 / `refresh()` 呼び出し | 依存層 `useJoinGroup` (TASK-0011, TC1-TC4) で検証済 | **再テストしない** |
| B | RPC `join_group_with_code` + RLS 通し動作 | data-foundation 統合テスト (ADR-012) で検証済 | **スコープ外** |
| C | EDGE-001 リダイレクトチェーン全体 / `<UAlert>`・`<USkeleton>` の実レンダリング・aria | E2E (TASK-0020, NFR-302) | **E2E 委譲** |
| D2 | redirect URL 組み立て（現在パス `/join/[code]` を `/login?redirect=...` に連結し、code を含む実 URL を保持） | 純粋関数化すれば mock-unit で検証可 | **本書のテスト対象（採用）** |
| D1/D3/D4 | 認証状態判定 / 成否で遷移先出し分け / `useRoute().params.code` 結線 | Nuxt 標準 API への単純結線 | **NFR-301 により省略、E2E 委譲** |

### buildLoginRedirect 純粋関数化の採否判定: **採用**

- **根拠**:
  - D2 は「code を含む URL を保持する」点が EDGE-001 リダイレクトチェーン成立の要であり、回帰しても型チェックでは検出されない（文字列連結ミス・エンコード漏れは実行時バグ）。
  - 既存の `app/utils/query.ts`（`resolveQueryParam`）+ `tests/unit/utils/` の前例があり、純粋関数 + mock-unit テストの導線が確立済。`.vue` マウント不要で mock-unit 制約 (ADR-012 D5) に適合する。
  - D1/D3/D4 は `useSupabaseUser()` / `navigateTo` / `useRoute().params` という Nuxt 標準 API への単純結線であり、純粋ロジックを持たないため切り出す価値がなく E2E に委譲する（要件定義書 §5 推奨に一致）。
- **結論**: redirect URL 組み立てのみ純粋関数 `buildLoginRedirect(path: string): string` として `app/utils/redirect.ts` に切り出し、mock-unit で検証する。page (`[code].vue`) 自体の単体テストは作らない（`tests/unit/pages/` は設けない）。

---

## 1. テスト対象（buildLoginRedirect 純粋関数）

```ts
// app/utils/redirect.ts
/**
 * 現在の着地パス（/join/[code]）を /login?redirect= クエリに連結して返す。
 * 未ログイン時に code を含む実 URL を保持し、EDGE-001 リダイレクトチェーンを成立させる。
 */
export function buildLoginRedirect(path: string): string
```

- **入力**: `path` (`string`) — 現在のフルパス。page 側では `useRoute().fullPath`（または `route.path`）を渡す想定。
- **出力**: `string` — `/login?redirect=<encodeURIComponent(path)>` 形式のログイン誘導 URL。
- **page 側結線（テスト対象外・E2E 委譲）**: `navigateTo(buildLoginRedirect(route.fullPath))` を未ログイン分岐で呼ぶ。

> エンコード方針: `redirect` クエリ値はパス区切り `/` を含むため、クエリ値として安全に運搬するには `encodeURIComponent` でエンコードする。login.vue 側は `resolveQueryParam(route.query.redirect)` で取り出すが、Vue Router は query 値を自動でデコードして `route.query.redirect` に格納するため、エンコードして渡すのが正しい往復となる。

---

## 2. 正常系テストケース

### TC-D2-1: 通常の招待コードを含むパスから redirect URL を生成する

- **テスト名**: 通常パス `/join/ABC12345` から `/login?redirect=` 付き URL を生成
  - **何をテストするか**: 着地パス全体（code を含む）が `redirect` クエリ値として保持されること
  - **期待される動作**: `path` を `encodeURIComponent` でエンコードし、`/login?redirect=<encoded>` を返す
- **入力値**: `buildLoginRedirect('/join/ABC12345')`
  - **入力データの意味**: 8 文字想定の標準的な招待コードを含む典型パス（REQ-108 / EDGE-001 の基本ケース）。`/` をクエリに乗せられるか確認するため最小だが代表的な値
- **期待される結果**: `'/login?redirect=%2Fjoin%2FABC12345'`
  - **期待結果の理由**: `/login?redirect=` プレフィックスに、`encodeURIComponent('/join/ABC12345')`（= `%2Fjoin%2FABC12345`）を連結した文字列。login.vue が `route.query.redirect` から `/join/ABC12345` を復元でき、チェーン終点 (UC1) に正しく戻れる
- **テストの目的**: code を含む URL 保持（EDGE-001 リダイレクトチェーンの起点 UC2）の正当性確認
  - **確認ポイント**: プレフィックスが固定であること、code を含むパスが欠落・破損せずエンコードされること
- 🔵 信頼性レベル: REQ-108 / EDGE-001 + 要件定義書 §2 出力仕様 / login.vue・confirm.vue の `resolveQueryParam` 往復実装に基づく（推測なし）

---

## 3. 異常系テストケース

> 本純粋関数は文字列整形のみで I/O・例外経路を持たない。不正 code（空白・特殊文字・極端な長さ）の「無効判定」は DB → `useJoinGroup` 側（EDGE-005, 依存層 TC2）で処理されるため、buildLoginRedirect では**異常系として扱わず、特殊文字を含むパスも忠実にエンコードして保持する**ことを境界値 TC-D2-2 で検証する（page は code の妥当性を意識しない＝責務分離 / 要件定義書 §3）。固有の異常系テストケースは無し。

---

## 4. 境界値テストケース

### TC-D2-2: 特殊文字・スペースを含むパスを安全にエンコードする

- **テスト名**: 特殊文字を含む code (`/join/a b&c`) を URL 安全にエンコード
  - **境界値の意味**: 招待コードに想定外文字（スペース `空白`・`&` 等のクエリ区切り文字）が混入したケース。エンコード漏れがあると `redirect` クエリが途中で切れる / 別クエリと誤認される境界
  - **境界値での動作保証**: page は code の妥当性を判定しない（EDGE-005 で DB に委譲）ため、どんな文字列でも URL として壊れない形で保持できることを保証する
- **入力値**: `buildLoginRedirect('/join/a b&c')`
  - **境界値選択の根拠**: スペース（`%20`）と `&`（`%26`、クエリ区切りと衝突する最も危険な文字）を同時に含む最小ケース。EDGE-005 / EDGE-106（8 文字以外・不正文字）の代表
  - **実際の使用場面**: ユーザが手で URL を改変した / 壊れた招待リンクを踏んだ場合。無効判定は DB が行うが、その手前で login へ正しく運搬できる必要がある
- **期待される結果**: `'/login?redirect=%2Fjoin%2Fa%20b%26c'`
  - **境界での正確性**: `&` が `%26`、スペースが `%20` にエンコードされ、`redirect` クエリ値が単一の値として閉じる
  - **一貫した動作**: TC-D2-1 と同じ `encodeURIComponent` 一本の経路を通り、文字種によらず一貫してエンコードされる
- **テストの目的**: クエリインジェクション・値破損の防止（堅牢性）
  - **堅牢性の確認**: 異常入力でも URL 構文が壊れず、login.vue 側で正しく単一値として復元できる
- 🔵 信頼性レベル: EDGE-005 / EDGE-106 + 要件定義書 §3 責務分離（page は code 妥当性を意識しない）+ `encodeURIComponent` 仕様に基づく

> **境界値の網羅判断**: 「空文字パス」「null/undefined」は page 側で `route.fullPath` が常に非空文字列を返すため到達不能（Nuxt ルーティング保証）。よってテストケースに含めない（冗長排除 / NFR-301）。

---

## 5. テストケース一覧と網羅性

| ID | 分類 | 入力 | 期待値 | カバー要件 |
|---|---|---|---|---|
| TC-D2-1 | 正常系 | `/join/ABC12345` | `/login?redirect=%2Fjoin%2FABC12345` | REQ-108 / EDGE-001 |
| TC-D2-2 | 境界値 | `/join/a b&c` | `/login?redirect=%2Fjoin%2Fa%20b%26c` | EDGE-005 / EDGE-106 |

- **正常系**: 1（標準パスの保持・エンコード）
- **異常系**: 0（純粋関数に例外経路なし。無効 code 判定は依存層 EDGE-005 でカバー済）
- **境界値**: 1（特殊文字エンコードによる堅牢性）
- **合計**: 2 ケース

**意図的に本書のスコープ外としたもの（再テスト・冗長を排除）**:
- A: join 成否・識別子変換・notice・pending・refresh → `useJoinGroup.test.ts` (TC1-TC4) 済
- B: RPC + RLS → data-foundation 統合テスト 済
- C / D1 / D3 / D4: 認証判定・遷移結線・`route.params.code` 結線・UI レンダリング → E2E (TASK-0020) 委譲

---

## 6. 開発言語・フレームワーク

- **プログラミング言語**: TypeScript (strict mode)
  - **言語選択の理由**: プロジェクト標準 (CLAUDE.md)。純粋関数の入出力を型で固定でき、文字列整形の回帰を型 + 値の両面で守れる
  - **テストに適した機能**: 引数・戻り値の string 型が明示され、エンコード結果の完全一致比較が容易
- **テストフレームワーク**: Vitest (mock-unit)
  - **フレームワーク選択の理由**: プロジェクト標準。`.vue` マウント不要の純粋関数テストに最適で、ADR-012 D5（mock-unit 限定）に適合
  - **テスト実行環境**: `vitest.config.ts`（unit）。配置先 `tests/unit/utils/redirect.test.ts`（既存 `tests/unit/utils/` パターンに準拠）
- 🔵 信頼性レベル: CLAUDE.md / note.md §5 / 既存 `tests/unit/utils/` 構成に基づく

---

## 7. テスト実装時の日本語コメント指針（実装例）

```ts
// tests/unit/utils/redirect.test.ts
import { describe, it, expect } from 'vitest'
import { buildLoginRedirect } from '~/utils/redirect'

describe('buildLoginRedirect', () => {
  it('TC-D2-1: 通常パスから redirect クエリ付き login URL を生成する', () => {
    // 【テスト目的】: code を含む着地パスが redirect クエリとして欠落せず保持されることを確認
    // 【テスト内容】: 標準的な /join/ABC12345 を入力し /login?redirect=<encoded> を得る
    // 【期待される動作】: encodeURIComponent でエンコードされ /login へ正しく運搬される
    // 🔵 REQ-108 / EDGE-001

    // 【テストデータ準備】: 8 文字想定 code を含む典型パス。リダイレクトチェーン起点 (UC2) を代表
    const path = '/join/ABC12345'

    // 【実際の処理実行】: 純粋関数 buildLoginRedirect を呼ぶ（副作用なし）
    const result = buildLoginRedirect(path)

    // 【結果検証】: プレフィックス + エンコード済みパスの完全一致
    // 【検証項目】: code を含むパスが %2F エンコードで保持されること 🔵
    expect(result).toBe('/login?redirect=%2Fjoin%2FABC12345')
  })

  it('TC-D2-2: 特殊文字を含むパスを URL 安全にエンコードする', () => {
    // 【テスト目的】: スペース・& を含む不正 code でも URL 構文が壊れないことを確認
    // 【テスト内容】: /join/a b&c を入力し %20 / %26 にエンコードされることを検証
    // 【期待される動作】: redirect クエリ値が単一値として閉じ、クエリ衝突を起こさない
    // 🔵 EDGE-005 / EDGE-106（無効判定は DB に委譲、page は妥当性を意識しない）

    // 【テストデータ準備】: スペース + & を同時に含む最も危険な境界入力
    const path = '/join/a b&c'

    // 【実際の処理実行】: buildLoginRedirect を呼ぶ
    const result = buildLoginRedirect(path)

    // 【結果検証】: & が %26、スペースが %20 にエンコードされ単一クエリ値になる
    // 【検証項目】: クエリインジェクション・値破損が起きないこと 🔵
    expect(result).toBe('/login?redirect=%2Fjoin%2Fa%20b%26c')
  })
})
```

> page (`[code].vue`) には単体テストを作らない（NFR-301 / mock-unit 限定）。page 側は `navigateTo(buildLoginRedirect(route.fullPath))` の結線のみ行い、結線・遷移・UI は E2E (TASK-0020) で担保する。

---

## 8. 要件定義との対応関係

- **参照した機能概要**: 要件定義書 §1（未ログイン → ログイン動線誘導、code を失わない URI 保持）
- **参照した入力・出力仕様**: 要件定義書 §2（未ログイン時 `navigateTo('/login?redirect=/join/[code]')` の出力生成）
- **参照した制約条件**: 要件定義書 §3（ADR-008 D1 例外 / 責務分離 EDGE-005 / mock-unit 限定 / NFR-301）
- **参照した使用例**: 要件定義書 §4 UC2（未ログイン起点）, EC3（EDGE-005 不正 code）, §5 D2（テスト候補）
- **参照したEARS要件**: REQ-108（未ログイン redirect）, EDGE-001（リダイレクトチェーン）, EDGE-005 / EDGE-106（不正 code → DB 委譲）, NFR-301（page テスト最小化）, NFR-302（E2E 委譲）
- **参照した実装パターン**: `app/utils/query.ts`（`resolveQueryParam` の往復）, `app/pages/login.vue` / `app/pages/confirm.vue`（redirect クエリ消費側）

---

## 品質判定

- テストケース分類: 正常系 1 / 境界値 1 / 異常系 0（純粋関数に例外経路なし、理由明示）→ 必要十分で網羅
- 期待値定義: 完全一致の具体文字列で明確
- 技術選択: TypeScript + Vitest mock-unit で確定
- 実装可能性: 確実（既存 `tests/unit/utils/` + `app/utils/` パターン踏襲）
- 信頼性レベル分布: 🔵 2 / 🟡 0 / 🔴 0（全ケース要件・既存実装に裏付け）
- buildLoginRedirect 純粋関数化: **採用**（D2 は回帰しやすく型で守れないため。D1/D3/D4 は E2E 委譲）
- **総合判定**: ✅ 高品質
</content>
</invoke>
