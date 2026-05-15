# data-foundation 要件定義書

## 概要

badkichi のデータ基盤となる単位。Supabase プロジェクトのセットアップ、Supabase Auth 設定、
全テーブルスキーマ定義、Group/GroupMember を中心としたマルチテナント基盤、RLS ポリシー、
マイグレーション運用、Nuxt Supabase Client セットアップ、TypeScript 型自動生成、
開発環境のシードデータ枠組みを整備する。

UI（ログイン画面、オンボーディング、Group 作成、招待リンク着地）は含まず、後続の
`auth-onboarding` 単位（ADR-004）の責務とする。

## 関連文書

- **ヒアリング記録**: [💬 interview-record.md](interview-record.md)
- **ユーザストーリー**: [📖 user-stories.md](user-stories.md)
- **受け入れ基準**: [✅ acceptance-criteria.md](acceptance-criteria.md)
- **コンテキストノート**: [📝 note.md](note.md)
- **準備タスク**: [🔧 prep.md](prep.md)
- **PRD**: [.dcs/20260328153038_badminton_analytics/prd.md](../../../.dcs/20260328153038_badminton_analytics/prd.md)
- **ADR-002**: [要件の分割方針](../../decisions/002-requirements-splitting.md)
- **ADR-004**: [auth-onboarding 単位の追加](../../decisions/004-add-auth-onboarding-unit.md)

## 機能要件（EARS 記法）

**【信頼性レベル凡例】**:
- 🔵 **青信号**: PRD・ADR・ユーザヒアリングで確実
- 🟡 **黄信号**: 既存資料から妥当な推測
- 🔴 **赤信号**: 推測

### 通常要件

- REQ-001: システムは Supabase Cloud 上に dev 用と prod 用の 2 プロジェクトを分離して保持しなければならない 🔵 *ヒアリング 2026-04-16（環境戦略）*
- REQ-002: システムは Supabase Auth の Google OAuth プロバイダを有効化しなければならない 🔵 *ヒアリング 2026-04-16（認証方式）*
- REQ-003: システムは PRD §5.2 で定義された全テーブル（groups, group_members, group_invitations, players, matches, sets, set_player_positions, rallies, shots, position_overrides）を dev/prod 両プロジェクトに作成しなければならない 🔵 *PRD §5.2*
- REQ-004: システムは Supabase CLI のマイグレーション機構（`supabase/migrations/` 配下の連番 SQL）によりスキーマ変更を管理しなければならない 🔵 *ヒアリング 2026-04-16（マイグレーション）*
- REQ-005: システムは Nuxt アプリから Supabase に接続するためのクライアント設定（`@nuxtjs/supabase` モジュールまたは同等）を持たなければならない 🔵 *PRD §5.1 アーキテクチャ*
- REQ-006: システムは全 DB テーブルの TypeScript 型定義を `supabase gen types typescript` で自動生成し、リポジトリに保持しなければならない 🔵 *ヒアリング 2026-04-16（型定義）*
- REQ-007: システムは Zod を依存関係に追加しなければならない 🔵 *ヒアリング 2026-04-16（バリデーション）*
- REQ-008: システムは `supabase/seed.sql` ファイルと、`pnpm db:reset` 相当のコマンドスクリプトを整備しなければならない 🔵 *ヒアリング 2026-04-17（シードデータ）*
- REQ-009: システムは `pnpm db:reset` スクリプトに、リンク先が prod プロジェクトの場合に実行を拒否するガード（リンク先名を検査して非 dev なら exit 1）を実装しなければならない 🔵 *ヒアリング 2026-04-17（prod 誤操作ガード）*
- REQ-010: システムは Supabase Auth の Email/Password プロバイダを明示的に **無効化** しなければならない 🔵 *ヒアリング 2026-04-17（Email 認証無効化）*
- REQ-011: システムは CI または pre-commit フックにおいて、`supabase/migrations/` 配下の既存マイグレーションファイルが変更された場合に警告またはエラーを出す仕組みを持たなければならない 🔵 *ヒアリング 2026-04-17（CI/CD 早期充実方針）*

### 条件付き要件

- REQ-101: ユーザーが認証済みの場合、システムは当該ユーザーが所属する Group のデータのみを返さなければならない（RLS ポリシーによる） 🔵 *PRD §1 マルチテナント設計*
- REQ-102: Group 管理者が招待コード発行を要求した場合、システムは有効期限 7 日間・使用回数制限なしの招待コードを生成しなければならない 🔵 *ヒアリング 2026-04-16（招待コード運用）*
- REQ-103: ユーザーが招待コードで Group に参加を試みた場合、システムはコードの有効性（期限内であること）を検証した上で `group_members` に行を追加しなければならない 🔵 *ヒアリング 2026-04-16*

### 状態要件

- REQ-201: ユーザーが未認証である場合、システムは全テーブルへのアクセスを拒否しなければならない（RLS anon ロール制限） 🔵 *PRD §4 セキュリティ要件*
- REQ-202: ユーザーが認証済みだが所属 Group が 0 個である場合、システムは Group 作成または招待コード参加の前提条件を満たす状態を提供しなければならない（API レベルで Group 作成 / 参加のみ許可） 🔵 *ヒアリング 2026-04-16（Group 参加フロー）*

### オプション要件

（現時点なし）

### 制約要件

- REQ-401: システムは全データ行に `group_id`（または間接的に Group に辿れる FK）を持たせなければならない 🔵 *PRD §1 マルチテナント設計*
- REQ-402: システムは MVP では削除 API・削除トリガーを実装してはならない（REQ-301 のカラムを入れる場合も未使用） 🔵 *ヒアリング 2026-04-16*
- REQ-403: システムは Supabase ローカル（Docker Supabase）に依存してはならない。dev 検証はクラウド dev プロジェクトで行う 🔵 *ヒアリング 2026-04-16*
- REQ-404: システムは対戦相手の個人情報を保持しないこと（PRD §1.3 MVP ターゲット） 🔵 *PRD §1 「MVPでは対戦相手の情報は管理しない」*
- REQ-405: システムは全主要テーブル（groups, group_members, group_invitations, players, matches, sets, set_player_positions, rallies, shots, position_overrides）に `deleted_at timestamptz NULL` カラムを持たなければならない。MVP では常に NULL を維持する 🔵 *ヒアリング 2026-04-17（deleted_at を最初から全テーブルに）*

## 非機能要件

### パフォーマンス

- NFR-001: `supabase db push` によるマイグレーション適用は 30 秒以内に完了すること（dev 環境、標準スキーマ規模） 🟡 *Supabase CLI の標準的挙動からの妥当な推測（実測での確認推奨）*

### セキュリティ

- NFR-101: Supabase の `service_role` キーはクライアント側コード（Nuxt ブラウザ側バンドル）に含めてはならない 🔵 *Supabase 公式推奨*
- NFR-102: `anon` キーおよび Supabase URL は環境変数（`.env.*`）経由で Nuxt `runtimeConfig.public` に渡すこと 🔵 *Nuxt + Supabase 標準*
- NFR-103: 招待コードの値は 8 文字（英数字）のランダム文字列とすること。文字数は将来拡張可能な設計（DB カラム長を 8 固定にせず text 型で可変）とする 🔵 *ヒアリング 2026-04-17（8 文字で開始、将来拡張可能）*
- NFR-104: 全テーブルで RLS を **有効化** し、認証ユーザーが自分の所属 Group 以外のデータを参照・変更できないポリシーを定義すること 🔵 *PRD §1 マルチテナント設計*

### ユーザビリティ

- NFR-201: 新規開発者がリポジトリを clone した後、`pnpm install` → `pnpm db:reset` を実行するだけで動作可能な dev 環境の初期状態を得られること 🔵 *ヒアリング 2026-04-17（シードデータ枠組み）*

### 保守性

- NFR-301: スキーマ変更（マイグレーション追加）時は、TypeScript 型も再生成されること。手動同期は不可 🔵 *ヒアリング 2026-04-16（型定義）*
- NFR-302: マイグレーションファイルは追記のみで、既存ファイルの内容変更は行わないこと（マイグレーション運用の標準） 🔵 *Supabase CLI / マイグレーション一般原則*

## Edge ケース

### エラー処理

- EDGE-001: 招待コードが期限切れの場合、システムは参加を拒否し、明示的なエラー（expired）を返すこと 🔵 *ヒアリング 2026-04-16*
- EDGE-002: 同じ user_id が同じ group_id に対して二重に `group_members` に INSERT された場合、ユニーク制約で弾くこと 🟡 *整合性観点の妥当な推測*
- EDGE-003: Group に所属していないユーザーが Group 所有のテーブルを SELECT した場合、空集合を返すこと（RLS による暗黙的フィルタ） 🔵 *Supabase RLS 挙動*

### 境界値

- EDGE-101: 招待コードの有効期限は 7 日ちょうど（発行時刻から 604800 秒）とすること 🔵 *ヒアリング 2026-04-16*
- EDGE-102: 1 ユーザーが複数 Group に所属する場合、`group_members` は複数行持てること 🔵 *PRD §1「1ユーザーは複数のグループに所属可能」*
