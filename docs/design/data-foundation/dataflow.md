# data-foundation データフロー図

**作成日**: 2026-04-22
**関連アーキテクチャ**: [architecture.md](architecture.md)
**関連要件定義**: [requirements.md](../../spec/data-foundation/requirements.md)

**【信頼性レベル凡例】**:
- 🔵 **青信号**: 要件定義書・設計文書・ユーザヒアリングで確実
- 🟡 **黄信号**: 妥当な推測
- 🔴 **赤信号**: 推測

---

## 全体データフロー 🔵

**信頼性**: 🔵 *architecture.md + PRD §5.1*

```
┌────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│  ブラウザ   │────→│  Nuxt アプリ      │────→│  Supabase Cloud      │
│            │←────│  (SSR/CSR)       │←────│  (PostgreSQL + Auth) │
└────────────┘     └──────────────────┘     └──────────────────────┘
                         │                         │
                   @nuxtjs/supabase          RLS 自動フィルタ
                   useSupabaseClient()       is_member_of(group_id)
                   useSupabaseUser()
```

## フロー 1: Google OAuth 認証 🔵

**信頼性**: 🔵 *REQ-002 + @nuxtjs/supabase 公式ドキュメント*
**関連要件**: REQ-002, REQ-010, REQ-201

```
ユーザー          ブラウザ/Nuxt         Supabase Auth       Google
  │                  │                     │                  │
  │  ログインボタン   │                     │                  │
  │─────────────────→│                     │                  │
  │                  │  signInWithOAuth()   │                  │
  │                  │────────────────────→│                  │
  │                  │                     │  OAuth リダイレクト │
  │                  │                     │─────────────────→│
  │                  │                     │                  │
  │  Google 認証画面  │                     │  ← 認証コード     │
  │←─────────────────────────────────────────────────────────│
  │  承認             │                     │                  │
  │─────────────────→│                     │                  │
  │                  │                     │  コード → トークン  │
  │                  │                     │←─────────────────│
  │                  │  callback URL       │                  │
  │                  │←────────────────────│                  │
  │                  │  JWT 保存 (cookie)   │                  │
  │  認証完了         │                     │                  │
  │←─────────────────│                     │                  │
```

**ポイント**:
- Email/Password は disabled。Google OAuth のみ有効
- `@nuxtjs/supabase` が JWT の cookie 管理を自動化
- 未認証状態では RLS により全テーブルアクセス拒否（REQ-201）

## フロー 2: Group 作成 🔵

**信頼性**: 🔵 *REQ-101, REQ-401, ヒアリング 2026-04-16 Q3, ⑦ A-1 + A-2*
**関連要件**: REQ-101, REQ-401

```
認証済みユーザー     Nuxt                Supabase (PostgreSQL)
  │                  │                     │
  │  Group 名入力     │                     │
  │─────────────────→│                     │
  │                  │  rpc('create_group_ │
  │                  │   with_owner',      │
  │                  │   { group_name })   │
  │                  │────────────────────→│
  │                  │                     │  ① auth.uid() チェック
  │                  │                     │     NG → raise 'not_authenticated'
  │                  │                     │  ② 文字数 1〜50 チェック
  │                  │                     │     NG → raise 'invalid_group_name'
  │                  │                     │  ③ groups に INSERT
  │                  │                     │  ④ group_members に
  │                  │                     │     (group_id, auth.uid()) INSERT
  │                  │  ← { group_id }     │
  │                  │←────────────────────│
  │  作成完了         │                     │
  │←─────────────────│                     │
```

**ポイント (⑦ A-1 + A-2)**:
- `groups` および `group_members` の直接 INSERT は RLS で禁止。Group 作成は
  `create_group_with_owner` RPC のみで、groups INSERT + group_members INSERT が 1 トランザクションで原子化される。
- 中途失敗による「孤児 Group」(メンバーゼロで誰も見えない) が生まれない。
- 旧 `group_members_insert` ポリシーの OR 条件 (任意 Group への自己追加) も削除済みで攻撃面が縮小。

## フロー 3: 招待コード発行 🔵

**信頼性**: 🔵 *REQ-102, NFR-103, ヒアリング 2026-04-16 Q7, ⑧ B-12*
**関連要件**: REQ-102, NFR-103, EDGE-101

```
Group メンバー      Nuxt                Supabase (PostgreSQL)
  │                  │                     │
  │  招待コード発行    │                     │
  │─────────────────→│                     │
  │                  │  rpc('generate_     │
  │                  │   invitation_code', │
  │                  │   { target_group_id})│
  │                  │────────────────────→│
  │                  │                     │  ① is_member_of チェック
  │                  │                     │  ② CSPRNG (gen_random_uuid) から 8 hex
  │                  │                     │  ③ group_invitations に INSERT
  │                  │                     │     (expires_at = now() + 7日)
  │                  │                     │     UNIQUE 衝突なら 5 回までリトライ
  │                  │                     │     全失敗で raise
  │                  │                     │     'invitation_code_collision_after_retry'
  │                  │  ← { code }         │
  │                  │←────────────────────│
  │  コード表示       │                     │
  │←─────────────────│                     │
  │                  │                     │
  │  LINE 等で共有    │                     │
```

## フロー 4: 招待コードで Group 参加 🔵

**信頼性**: 🔵 *REQ-103, EDGE-001, EDGE-002, ヒアリング 2026-04-16 Q3*
**関連要件**: REQ-103, REQ-202, EDGE-001, EDGE-002

```
新規ユーザー        Nuxt                Supabase (PostgreSQL)
  │                  │                     │
  │  コード入力       │                     │
  │─────────────────→│                     │
  │                  │  rpc('join_group_   │
  │                  │   with_code',       │
  │                  │   { code })         │
  │                  │────────────────────→│
  │                  │                     │  ① code で group_invitations 検索
  │                  │                     │  ② expires_at > now() チェック
  │                  │                     │     NG → raise 'expired'
  │                  │                     │  ③ group_members に INSERT
  │                  │                     │     重複 → ユニーク制約エラー
  │                  │  ← { group_id }     │
  │                  │←────────────────────│
  │  参加完了         │                     │
  │←─────────────────│                     │
```

**エラーケース**:
- コード不存在: `NOT FOUND` エラー
- 期限切れ: `EXPIRED` エラー
- 既に所属済み: ユニーク制約違反

## フロー 5: RLS によるデータアクセス制御 🔵

**信頼性**: 🔵 *REQ-101, REQ-201, NFR-104*
**関連要件**: REQ-101, REQ-201, REQ-401, NFR-104

```
ユーザー A          Nuxt                Supabase (PostgreSQL)
(Group X 所属)       │                     │
  │                  │                     │
  │  選手一覧取得     │                     │
  │─────────────────→│                     │
  │                  │  SELECT * FROM      │
  │                  │  players            │
  │                  │────────────────────→│
  │                  │                     │  RLS 自動適用:
  │                  │                     │  WHERE is_member_of(group_id)
  │                  │                     │    = true
  │                  │                     │
  │                  │                     │  → Group X の選手のみ返す
  │                  │                     │  → Group Y の選手は見えない
  │                  │  ← players[]        │
  │                  │←────────────────────│
  │  一覧表示         │                     │
  │←─────────────────│                     │
```

**ポイント**:
- アプリ側は `WHERE group_id = ...` を書く必要がない
- PostgreSQL が RLS ポリシーに従って自動的にフィルタする
- anon ロール（未認証）は全拒否

## フロー 6: マイグレーション適用 🔵

**信頼性**: 🔵 *REQ-004, NFR-302*
**関連要件**: REQ-004, NFR-302, REQ-011

```
開発者              ターミナル           Supabase Cloud (dev)
  │                  │                     │
  │  スキーマ変更     │                     │
  │─────────────────→│                     │
  │                  │  supabase migration  │
  │                  │  new add_xxx        │
  │                  │  → migrations/ に    │
  │                  │    SQL ファイル追加   │
  │                  │                     │
  │  SQL 編集         │                     │
  │─────────────────→│                     │
  │                  │  pnpm db:push       │
  │                  │────────────────────→│
  │                  │                     │  未適用の SQL を実行
  │                  │  ← 成功              │
  │                  │←────────────────────│
  │                  │                     │
  │                  │  pnpm db:types      │
  │                  │────────────────────→│
  │                  │                     │  スキーマから型生成
  │                  │  ← types/supabase.ts │
  │                  │←────────────────────│
  │                  │                     │
  │  git commit       │                     │
  │  (pre-commit:    │                     │
  │   migration      │                     │
  │   改変チェック)    │                     │
  │─────────────────→│                     │
```

## フロー 7: dev 環境リセット 🔵

**信頼性**: 🔵 *REQ-008, REQ-009, NFR-201*
**関連要件**: REQ-008, REQ-009

```
開発者              ターミナル           Supabase Cloud
  │                  │                     │
  │  pnpm db:reset   │                     │
  │─────────────────→│                     │
  │                  │  ① リンク先チェック   │
  │                  │  prod なら exit 1    │
  │                  │                     │
  │                  │  supabase db reset   │
  │                  │  --linked            │
  │                  │────────────────────→│
  │                  │                     │  ① 全テーブル DROP
  │                  │                     │  ② migrations/ 再適用
  │                  │                     │  ③ seed.sql 投入
  │                  │  ← 成功              │
  │                  │←────────────────────│
  │  リセット完了     │                     │
  │←─────────────────│                     │
```

## 状態遷移: ユーザーのライフサイクル 🔵

**信頼性**: 🔵 *REQ-201, REQ-202, ヒアリング 2026-04-16 Q3*

```
[未認証] ──Google OAuth──→ [認証済み・Group未所属]
                              │
                    ┌─────────┴──────────┐
                    │                    │
              Group 作成           招待コードで参加
                    │                    │
                    └─────────┬──────────┘
                              │
                       [認証済み・Group所属]
                              │
                    アプリの全機能が利用可能
                    (RLS で自分の Group のみ)
```

## 関連文書

- **アーキテクチャ**: [architecture.md](architecture.md)
- **DB スキーマ**: [database-schema.sql](database-schema.sql)
- **要件定義**: [requirements.md](../../spec/data-foundation/requirements.md)

## 信頼性レベルサマリー

- 🔵 青信号: 7 件（100%）
- 🟡 黄信号: 0 件（0%）
- 🔴 赤信号: 0 件（0%）

**品質評価**: 高品質
