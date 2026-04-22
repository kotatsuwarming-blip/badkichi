# ADR-004: auth-onboarding 単位の追加（ADR-002 の修正）

## ステータス
Accepted (2026-04-17)

## 背景

ADR-002 では MVP を 7 単位に分割し、`data-foundation` に「認証」を含める方針とした。

data-foundation の要件定義ヒアリング（`docs/spec/data-foundation/interview-record.md`）で、
「認証 UI（ログイン画面・サインアップ画面・オンボーディング・Group 作成・招待コード入力）」を
data-foundation に含めるか別単位に分けるかを議論した。

開発者から「data-foundation はデータ基盤の単位のはず。UI まで入ると責務が混ざる」との指摘があり、
ADR-002 の「認証」記述を **Supabase Auth の設定・基盤**（Google OAuth provider 有効化、JWT 設定、
リダイレクト URL 設定など）に限定し、UI 画面は別単位とすることにした。

## 決定

MVP を **8 単位** に分割する（7 → 8）。`data-foundation` の直後に `auth-onboarding` 単位を追加する。

### 単位一覧（改訂版）

| # | 単位 | 主な責務 | 依存 |
|---|------|----------|------|
| 1 | **rule-engine** | 純 TypeScript ロジック。サーバー/レシーバー推論、スコア状態、レット処理、PositionOverride 消費 | なし |
| 2 | **data-foundation** | Supabase プロジェクト作成、Supabase Auth 設定（Google OAuth 有効化）、全テーブルのスキーマ、Group/GroupMember マルチテナント基盤、RLS ポリシー、マイグレーション、Nuxt Supabase Client セットアップ、TypeScript 型自動生成、seed.sql 枠組み | なし |
| 3 | **auth-onboarding** 🆕 | ログイン画面、サインアップ、オンボーディング、Group 作成画面、招待コード入力画面、Group 設定画面（招待コード発行） | data-foundation |
| 4 | **player-management** | 選手 CRUD（名前・利き手） | data-foundation, auth-onboarding |
| 5 | **match-management** | 試合作成（4人選択、初期立ち位置、動画ソース） | data-foundation, auth-onboarding, player-management |
| 6 | **video-playback** | YouTube IFrame API + HTML5 Video API の統一インターフェース | なし |
| 7 | **match-recording** | 録画画面 UI。ルールエンジン + 動画プレーヤー + 入力コントロールの統合 | rule-engine, data-foundation, auth-onboarding, match-management, video-playback |
| 8 | **stats-dashboard** | サービス/レシーブ得点率チャート、ラリー長分析、動画ジャンプ機能付きラリー一覧 | data-foundation, auth-onboarding, match-recording, video-playback |

### 実装順序（改訂版）

```
1. rule-engine（✅ 完了）
2. data-foundation（Supabase 基盤、全スキーマ、認証基盤、型生成、seed枠組み）
3. auth-onboarding（ログイン/Group作成/招待コード UI）
4. player-management
5. match-management
6. video-playback
7. match-recording
8. stats-dashboard
```

## 理由

- **責務分離の明確化**: data-foundation は「データ基盤＋認証設定」、auth-onboarding は「ユーザーがログインしグループに所属するまでの UI 体験」と役割が一本化される
- **MVP 最初の UI 単位として学習に適す**: 開発者が Nuxt UI・Vue コンポーネント・Supabase client からのユーザー取得などを学ぶ場として、auth-onboarding は比較的小さく閉じている
- **後続 UI 単位の依存が簡潔になる**: player-management 以降は「ログイン済み + Group 所属済み」を前提にできる

## 影響

- ADR-002 で 7 単位だった箇所を 8 単位に読み替える
- `docs/spec/auth-onboarding/` は data-foundation 完了後に要件定義を起こす
- 各要件定義書の「依存」欄は本 ADR に従って更新する

## 採用しなかった選択肢

- **data-foundation に UI を含める（ADR-002 原案）**: 責務が混在、学習対象が多すぎて単位サイズが膨らむ
- **match-management の前段として UI を含める**: match-management が肥大化、認証 UI の独立テストがしにくい
