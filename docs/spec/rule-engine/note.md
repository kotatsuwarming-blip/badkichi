# rule-engine コンテキストノート

**作成日**: 2026-04-10

## 技術スタック

- **言語**: TypeScript（strict mode）
- **テストフレームワーク**: Vitest
- **フレームワーク**: Nuxt 4（ただし rule-engine 自体はフレームワーク非依存の純ロジック）

## 開発ルール

- Vue SFC + Composition API（ただし rule-engine はフレームワーク非依存）
- ESLint: 1tbs brace style, no comma dangle
- 日本語コメント可

## rule-engine の位置付け

ADR-002 で決定された 7 単位のうちの第 1 単位。

- **依存**: なし（Day 1 から完全テスト可能）
- **被依存**: match-recording（統合）、stats-dashboard（統計算出に利用）
- **責務**:
  - サーバー / レシーバー位置の推論
  - スコア状態の計算
  - レット処理
  - PositionOverride を引数として受け取り、現在ポジションを計算
  - セット・試合の勝敗判定
  - デュースルール（30点キャップ / デュースなし）のバリエーション対応
- **責務外**:
  - DB アクセス（一切なし）
  - UI / コンポーネント
  - 動画再生

## API 設計方針

- **純関数の集合**（クラスベースではない）
- 入力 → 出力が決定的。副作用なし
- データエンジニア的アナロジー: dbt の SQL モデルと同じ。入力テーブル → 出力テーブル

## 関連設計文書

- PRD: `.dcs/20260328153038_badminton_analytics/prd.md`（F-03 セクション）
- ADR-002: `docs/decisions/002-requirements-splitting.md`
- ADR-001: `docs/decisions/001-framework.md`

## 関連データモデル（rule-engine が引数として受け取る型）

rule-engine は DB テーブルを直接触らないが、以下のデータ型を引数として受け取る：

- **SetPlayerPosition**: セット開始時の選手立ち位置（player_id, team, position）
- **Rally**: ラリー情報（rally_number, point_winner, is_let）
- **PositionOverride**: 左右入れ替わりミスの記録（rally_id, team, override_type）

## 注意事項

- PositionOverride は**人為的ミスのみ**を記録。通常の左右入れ替わり（得点による）は rule-engine が自動計算
- PositionOverride の `swapped` / `restored` は相対的な変化（前ラリーからの差分）
- スキップ（得点者未入力）機能は**なし**。全ラリーは必ず得点者 or レットが確定
- 新セット開始時のサーバーは前セットの勝者
