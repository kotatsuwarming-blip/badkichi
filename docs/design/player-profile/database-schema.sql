-- ========================================
-- player-profile データベース設計（additive のみ, REQ-401）
-- PR ① / ② で migration を分ける
-- ========================================

-- PR ①: feat/player-roster-type
ALTER TABLE players
  ADD COLUMN roster_type text NOT NULL DEFAULT 'member'
    CHECK (roster_type IN ('member', 'opponent'));
-- 既存行は DEFAULT で member に初期化される（REQ-001）

-- PR ②: feat/player-profile（全て任意 = NULL 可。sex/play_styles のみ DEFAULT）
ALTER TABLE players
  ADD COLUMN sex text NOT NULL DEFAULT 'unspecified'
    CHECK (sex IN ('male', 'female', 'unspecified')),
  ADD COLUMN height_cm smallint
    CHECK (height_cm BETWEEN 100 AND 250),
  ADD COLUMN weight_kg numeric(4,1)
    CHECK (weight_kg BETWEEN 30.0 AND 150.0),
  ADD COLUMN birthdate date
    CHECK (birthdate >= DATE '1920-01-01'),
  ADD COLUMN badminton_since date,
  ADD COLUMN practice_frequency text
    CHECK (practice_frequency IN ('daily', 'several_per_week', 'weekly', 'monthly', 'rarely')),
  ADD COLUMN play_styles text[] NOT NULL DEFAULT '{}'
    CHECK (play_styles <@ ARRAY[
      'attacker', 'defender', 'all_round', 'front_player', 'rear_player',
      'rally_oriented', 'speed_oriented', 'technical', 'power'
    ]::text[]);

-- badminton_since >= birthdate の関係チェック（両方非 NULL のときのみ, EDGE-001）
ALTER TABLE players
  ADD CONSTRAINT players_since_after_birth_check
    CHECK (birthdate IS NULL OR badminton_since IS NULL OR badminton_since >= birthdate);

-- 未来日の拒否はフォーム層のみ（DB の now() 依存 CHECK は immutable でないため置かない）。
-- RLS: 既存 players ポリシーのまま（列追加はポリシーに影響しない）
