# match-management 設計ヒアリング記録

**作成日**: 2026-06-05
**ヒアリング実施**: step4 既存情報ベースの差分ヒアリング

## ヒアリング目的

要件定義（🔵94%）と player-management の設計パターン・既存 `matches` 生成型・error-handling 規約を
確認したうえで、設計フェーズで残る選択肢（フォーム形式、youtube URL 検証）を確定する。
その他の細部は player-management 踏襲＋一般決定として Claude が pros/cons で主導し設計文書に明記した。

## 質問と回答

### Q1: 作成/編集フォームの形式

**質問日時**: 2026-06-05
**カテゴリ**: アーキテクチャ / UX
**背景**: player-management は UModal だが、match は項目が多い（試合名・日付・4 選手・動画ソース）。
モーダル / 専用ページ / スライドオーバーで実装とUXが変わる。

**回答**: **UModal（player 踏襲）**。

**信頼性への影響**:
- architecture.md UI 設計・ルーティング（専用ページを設けない）を 🔵 で確定。
- 作成/編集は一覧画面上の `<UModal>`、削除は確認 `<UModal>`。

---

### Q2: youtube URL の検証の厳しさ

**質問日時**: 2026-06-05
**カテゴリ**: データモデル / バリデーション
**背景**: `video_source_url` は text 型で DB 形式制約なし（EDGE-004）。MVP は local 主体だが、
youtube を保存する際に形式検証するか「空でない」のみかで、再生時の失敗可能性が変わる。

**回答**: **youtube 形式を Zod で検証**（youtube.com/youtu.be URL または 11 桁動画 ID、動画 ID 抽出）。

**信頼性への影響**:
- EDGE-004 を 🔵 化。match-form.ts の youtube 検証/ID 抽出を設計に確定。
- video-playback が確実に再生できる値を保存する方針が固まった。

---

## Claude 主導で確定した一般決定（pros/cons 提示済、設計文書に明記）

- **選手選択 UI（NFR-202）**: 4 枠の `<USelectMenu>`、各枠は他枠で選択済の player を選択肢から除外。
  選択肢は既存 `usePlayers`（未削除ロスター）を再利用。
- **選手 4 人未満（REQ-203）**: 「試合を追加」を disabled にし、`/groups/[id]/players` への導線/説明を表示。
- **動画ソース UI**: `<URadioGroup>`(youtube/local) + 条件付きフィールド（local=ファイル選択で
  `file.name` を取得 / youtube=URL 入力）。
- **migration 配置（REQ-408）**: 既存 initial_schema を編集せず新規タイムスタンプ migration を追加。
  CI で db:push、型は Management API で再生成。
- **composable 構成（ADR-007）**: useMatches / useCreateMatch / useUpdateMatch / useDeleteMatch。
- **選手名解決（EDGE-007）**: 削除済 player 名も出すため PostgREST 埋め込みで取得（複合FK埋め込みは
  実装時検証、フォールバックは players を deleted_at 無しで別取得しクライアントで id→name マップ）。

## ヒアリング結果サマリー

### 確認できた事項
- フォームは UModal、youtube は Zod 形式検証＋ID 抽出。

### 設計方針の決定事項
- レイヤード（page → composable → PostgREST/RLS）、player-management 完全踏襲。
- 唯一の DB 変更は matches への additive 列追加 migration（name / match_date）。
- 新規 API / RPC / エラーコードなし。

### 追加ヒアリング（2026-06-05 黄信号レビュー）で確定
- **match_date の DB 制約 = NOT NULL + DEFAULT CURRENT_DATE**（安全網として既定=本日、必須はZodでも担保）。
- **並び替えインデックス `(group_id, match_date DESC) WHERE deleted_at IS NULL` を今回の migration に含める**。

### 残課題（実装で確定）
- PostgREST の複合FK埋め込みで選手名が解決できるかの実地検証（できなければフォールバック明記済）。

### 信頼性レベル分布

**ヒアリング前**:
- 🔵 青信号: 設計骨子の大半（要件 🔵94% 由来）
- 🟡 黄信号: 3（フォーム形式・youtube 検証・選手名解決）
- 🔴 赤信号: 0

**ヒアリング後（黄信号レビュー含む）**:
- 🔵 青信号: ほぼ全項目（フォーム形式・youtube 検証・match_date 制約・インデックスを確定）
- 🟡 黄信号: 1（複合FK埋め込みの実地検証のみ）
- 🔴 赤信号: 0

## 関連文書

- **アーキテクチャ設計**: [architecture.md](architecture.md)
- **データフロー**: [dataflow.md](dataflow.md)
- **型定義**: [interfaces.ts](interfaces.ts)
- **DBスキーマ(migration)**: [database-schema.sql](database-schema.sql)
- **要件定義**: [requirements.md](../../spec/match-management/requirements.md)
