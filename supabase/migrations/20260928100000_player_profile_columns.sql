-- ========================================
-- player-profile: 選手プロフィール 7 列 (PR ②, REQ-101/102/401)
-- ========================================
--
-- 全項目任意入力 (NULL 可 or DEFAULT 付き additive)。年齢・歴は保存せず
-- birthdate / badminton_since から表示時導出 (REQ-105。直接保存は陳腐化するため禁止)。
-- play_styles の語彙は app/utils/players/profile.ts の PLAY_STYLES と 1:1 (REQ-102)。
-- 未来日の拒否はフォーム層のみ (now() 依存 CHECK は置かない)。

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

-- badminton_since >= birthdate (両方非 NULL のときのみ, EDGE-001)
ALTER TABLE players
  ADD CONSTRAINT players_since_after_birth_check
    CHECK (birthdate IS NULL OR badminton_since IS NULL OR badminton_since >= birthdate);
