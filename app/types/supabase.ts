export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      group_invitations: {
        Row: {
          code: string
          created_at: string
          created_by: string
          deleted_at: string | null
          expires_at: string
          group_id: string
          id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          expires_at: string
          group_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          expires_at?: string
          group_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_invitations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          created_at: string
          deleted_at: string | null
          group_id: string
          id: string
          joined_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          group_id: string
          id?: string
          joined_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          group_id?: string
          id?: string
          joined_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          group_id: string
          id: string
          match_date: string
          name: string | null
          team_a_player1_id: string
          team_a_player2_id: string
          team_b_player1_id: string
          team_b_player2_id: string
          updated_at: string
          video_source_type: string
          video_source_url: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          group_id: string
          id?: string
          match_date?: string
          name?: string | null
          team_a_player1_id: string
          team_a_player2_id: string
          team_b_player1_id: string
          team_b_player2_id: string
          updated_at?: string
          video_source_type: string
          video_source_url: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          group_id?: string
          id?: string
          match_date?: string
          name?: string | null
          team_a_player1_id?: string
          team_a_player2_id?: string
          team_b_player1_id?: string
          team_b_player2_id?: string
          updated_at?: string
          video_source_type?: string
          video_source_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_group_id_team_a_player1_id_fkey"
            columns: ["group_id", "team_a_player1_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["group_id", "id"]
          },
          {
            foreignKeyName: "matches_group_id_team_a_player2_id_fkey"
            columns: ["group_id", "team_a_player2_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["group_id", "id"]
          },
          {
            foreignKeyName: "matches_group_id_team_b_player1_id_fkey"
            columns: ["group_id", "team_b_player1_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["group_id", "id"]
          },
          {
            foreignKeyName: "matches_group_id_team_b_player2_id_fkey"
            columns: ["group_id", "team_b_player2_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["group_id", "id"]
          },
        ]
      }
      players: {
        Row: {
          created_at: string
          deleted_at: string | null
          group_id: string
          handedness: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          group_id: string
          handedness?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          group_id?: string
          handedness?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      position_overrides: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          override_type: string
          rally_id: string
          team: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          override_type: string
          rally_id: string
          team: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          override_type?: string
          rally_id?: string
          team?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "position_overrides_rally_id_fkey"
            columns: ["rally_id"]
            isOneToOne: false
            referencedRelation: "rallies"
            referencedColumns: ["id"]
          },
        ]
      }
      rallies: {
        Row: {
          camera_near_team: string | null
          created_at: string
          deleted_at: string | null
          id: string
          is_let: boolean
          is_point_confirmed: boolean
          point_winner: string | null
          rally_number: number
          receiver_player_id: string
          server_player_id: string
          server_position: string
          serving_team: string
          set_id: string
          updated_at: string
          video_start_timestamp_ms: number | null
        }
        Insert: {
          camera_near_team?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_let?: boolean
          is_point_confirmed?: boolean
          point_winner?: string | null
          rally_number: number
          receiver_player_id: string
          server_player_id: string
          server_position: string
          serving_team: string
          set_id: string
          updated_at?: string
          video_start_timestamp_ms?: number | null
        }
        Update: {
          camera_near_team?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_let?: boolean
          is_point_confirmed?: boolean
          point_winner?: string | null
          rally_number?: number
          receiver_player_id?: string
          server_player_id?: string
          server_position?: string
          serving_team?: string
          set_id?: string
          updated_at?: string
          video_start_timestamp_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rallies_receiver_player_id_fkey"
            columns: ["receiver_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rallies_server_player_id_fkey"
            columns: ["server_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rallies_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "sets"
            referencedColumns: ["id"]
          },
        ]
      }
      recording_gaps: {
        Row: {
          after_rally_number: number | null
          created_at: string
          deleted_at: string | null
          id: string
          note: string | null
          resumed_score_team_a: number | null
          resumed_score_team_b: number | null
          set_id: string
          updated_at: string
        }
        Insert: {
          after_rally_number?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          note?: string | null
          resumed_score_team_a?: number | null
          resumed_score_team_b?: number | null
          set_id: string
          updated_at?: string
        }
        Update: {
          after_rally_number?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          note?: string | null
          resumed_score_team_a?: number | null
          resumed_score_team_b?: number | null
          set_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recording_gaps_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "sets"
            referencedColumns: ["id"]
          },
        ]
      }
      set_player_positions: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          player_id: string
          position: string
          set_id: string
          team: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          player_id: string
          position: string
          set_id: string
          team: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          player_id?: string
          position?: string
          set_id?: string
          team?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "set_player_positions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "set_player_positions_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "sets"
            referencedColumns: ["id"]
          },
        ]
      }
      sets: {
        Row: {
          camera_near_team_at_start: string | null
          created_at: string
          deleted_at: string | null
          deuce_point_cap: number
          enable_deuce: boolean
          first_serving_team: string
          id: string
          match_id: string
          set_number: number
          target_points: number
          updated_at: string
          winner: string | null
        }
        Insert: {
          camera_near_team_at_start?: string | null
          created_at?: string
          deleted_at?: string | null
          deuce_point_cap?: number
          enable_deuce?: boolean
          first_serving_team: string
          id?: string
          match_id: string
          set_number: number
          target_points?: number
          updated_at?: string
          winner?: string | null
        }
        Update: {
          camera_near_team_at_start?: string | null
          created_at?: string
          deleted_at?: string | null
          deuce_point_cap?: number
          enable_deuce?: boolean
          first_serving_team?: string
          id?: string
          match_id?: string
          set_number?: number
          target_points?: number
          updated_at?: string
          winner?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sets_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      shots: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          input_source: string
          rally_id: string
          shot_number: number
          updated_at: string
          video_timestamp_ms: number | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          input_source?: string
          rally_id: string
          shot_number: number
          updated_at?: string
          video_timestamp_ms?: number | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          input_source?: string
          rally_id?: string
          shot_number?: number
          updated_at?: string
          video_timestamp_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shots_rally_id_fkey"
            columns: ["rally_id"]
            isOneToOne: false
            referencedRelation: "rallies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_group_with_owner: { Args: { group_name: string }; Returns: string }
      generate_invitation_code: {
        Args: { target_group_id: string }
        Returns: string
      }
      is_member_of: { Args: { target_group_id: string }; Returns: boolean }
      join_group_with_code: { Args: { invite_code: string }; Returns: string }
      stats_pair_rates: {
        Args: {
          p_group_id?: string
          p_match_id?: string
          p_match_ids?: string[]
        }
        Returns: {
          player1_id: string
          player2_id: string
          receive_total: number
          receive_won: number
          serve_total: number
          serve_won: number
        }[]
      }
      stats_player_rates: {
        Args: {
          p_group_id?: string
          p_match_id?: string
          p_match_ids?: string[]
        }
        Returns: {
          player_id: string
          receive_total: number
          receive_won: number
          serve_total: number
          serve_won: number
        }[]
      }
      stats_rallies: {
        Args: {
          p_group_id?: string
          p_limit?: number
          p_match_id?: string
          p_match_ids?: string[]
          p_offset?: number
          p_pair_player1_id?: string
          p_pair_player2_id?: string
          p_player_id?: string
          p_receiver_player_id?: string
          p_role?: string
          p_server_player_id?: string
          p_shot_ranges?: Json
        }
        Returns: {
          is_let: boolean
          is_point_confirmed: boolean
          match_date: string
          match_id: string
          match_name: string
          point_winner: string
          rally_duration_ms: number
          rally_id: string
          rally_number: number
          receiver_player_id: string
          score_a: number
          score_b: number
          server_player_id: string
          server_position: string
          serving_team: string
          set_number: number
          shot_count: number
          video_source_type: string
          video_source_url: string
          video_start_timestamp_ms: number
        }[]
      }
      stats_rally_length: {
        Args: {
          p_group_id?: string
          p_match_id?: string
          p_match_ids?: string[]
        }
        Returns: {
          rallies: number
          serve_won: number
          shot_count: number
        }[]
      }
      test_force_collision_invitation_code: {
        Args: { target_group_id: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

