export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      access_logs: {
        Row: {
          action: string
          allowed: boolean
          created_at: string | null
          email: string
          id: string
          ip_address: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          allowed: boolean
          created_at?: string | null
          email: string
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          allowed?: boolean
          created_at?: string | null
          email?: string
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      allowed_emails: {
        Row: {
          created_at: string | null
          email: string
          id: string
          role: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          role?: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          role?: string
        }
        Relationships: []
      }
      company_bu_map: {
        Row: {
          business_unit: Database["public"]["Enums"]["business_unit"]
          company_name: string
          created_at: string | null
          notes: string | null
          source_system: string
        }
        Insert: {
          business_unit: Database["public"]["Enums"]["business_unit"]
          company_name: string
          created_at?: string | null
          notes?: string | null
          source_system: string
        }
        Update: {
          business_unit?: Database["public"]["Enums"]["business_unit"]
          company_name?: string
          created_at?: string | null
          notes?: string | null
          source_system?: string
        }
        Relationships: []
      }
      engagement_dept_scores: {
        Row: {
          department: string
          enps: number | null
          enps_delta: number | null
          enps_gap_ent: number | null
          id: string
          retention_risk: number | null
          rr_delta_pp: number | null
          rr_gap_ent_pp: number | null
          sat_delta: number | null
          sat_gap_ent: number | null
          satisfaction: number | null
          status: string | null
          status_level: string | null
          wave: string
        }
        Insert: {
          department: string
          enps?: number | null
          enps_delta?: number | null
          enps_gap_ent?: number | null
          id?: string
          retention_risk?: number | null
          rr_delta_pp?: number | null
          rr_gap_ent_pp?: number | null
          sat_delta?: number | null
          sat_gap_ent?: number | null
          satisfaction?: number | null
          status?: string | null
          status_level?: string | null
          wave: string
        }
        Update: {
          department?: string
          enps?: number | null
          enps_delta?: number | null
          enps_gap_ent?: number | null
          id?: string
          retention_risk?: number | null
          rr_delta_pp?: number | null
          rr_gap_ent_pp?: number | null
          sat_delta?: number | null
          sat_gap_ent?: number | null
          satisfaction?: number | null
          status?: string | null
          status_level?: string | null
          wave?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_dept_scores_wave_fkey"
            columns: ["wave"]
            isOneToOne: false
            referencedRelation: "engagement_waves"
            referencedColumns: ["wave"]
          },
        ]
      }
      engagement_questions: {
        Row: {
          driver: string
          evaluation: string | null
          id: string
          prev_score: number | null
          question: string
          score: number | null
          wave: string
        }
        Insert: {
          driver: string
          evaluation?: string | null
          id?: string
          prev_score?: number | null
          question: string
          score?: number | null
          wave: string
        }
        Update: {
          driver?: string
          evaluation?: string | null
          id?: string
          prev_score?: number | null
          question?: string
          score?: number | null
          wave?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_questions_wave_fkey"
            columns: ["wave"]
            isOneToOne: false
            referencedRelation: "engagement_waves"
            referencedColumns: ["wave"]
          },
        ]
      }
      engagement_waves: {
        Row: {
          created_at: string | null
          enps: number | null
          id: string
          label: string
          notes: string | null
          participation_pct: number | null
          retention_risk: number | null
          satisfaction: number | null
          wave: string
        }
        Insert: {
          created_at?: string | null
          enps?: number | null
          id?: string
          label: string
          notes?: string | null
          participation_pct?: number | null
          retention_risk?: number | null
          satisfaction?: number | null
          wave: string
        }
        Update: {
          created_at?: string | null
          enps?: number | null
          id?: string
          label?: string
          notes?: string | null
          participation_pct?: number | null
          retention_risk?: number | null
          satisfaction?: number | null
          wave?: string
        }
        Relationships: []
      }
      leavers: {
        Row: {
          ano_desligamento: string | null
          career_band: string | null
          cargo: string | null
          created_at: string | null
          data_admissao: string | null
          data_desligamento: string | null
          data_desligamento_str: string | null
          departamento: string | null
          faixa_salarial: string | null
          genero: string | null
          id: string
          job_family: string | null
          level: string | null
          mes_desligamento: string | null
          motivo_desligamento: string | null
          nome: string
          raca: string | null
          salario: number | null
          tempo_casa_dias: number | null
          tempo_casa_faixa: string | null
          time: string | null
          tipo_desligamento: string | null
          tipo_desligamento_agrupado: string | null
          vinculo: string | null
          workday_level: string | null
        }
        Insert: {
          ano_desligamento?: string | null
          career_band?: string | null
          cargo?: string | null
          created_at?: string | null
          data_admissao?: string | null
          data_desligamento?: string | null
          data_desligamento_str?: string | null
          departamento?: string | null
          faixa_salarial?: string | null
          genero?: string | null
          id: string
          job_family?: string | null
          level?: string | null
          mes_desligamento?: string | null
          motivo_desligamento?: string | null
          nome: string
          raca?: string | null
          salario?: number | null
          tempo_casa_dias?: number | null
          tempo_casa_faixa?: string | null
          time?: string | null
          tipo_desligamento?: string | null
          tipo_desligamento_agrupado?: string | null
          vinculo?: string | null
          workday_level?: string | null
        }
        Update: {
          ano_desligamento?: string | null
          career_band?: string | null
          cargo?: string | null
          created_at?: string | null
          data_admissao?: string | null
          data_desligamento?: string | null
          data_desligamento_str?: string | null
          departamento?: string | null
          faixa_salarial?: string | null
          genero?: string | null
          id?: string
          job_family?: string | null
          level?: string | null
          mes_desligamento?: string | null
          motivo_desligamento?: string | null
          nome?: string
          raca?: string | null
          salario?: number | null
          tempo_casa_dias?: number | null
          tempo_casa_faixa?: string | null
          time?: string | null
          tipo_desligamento?: string | null
          tipo_desligamento_agrupado?: string | null
          vinculo?: string | null
          workday_level?: string | null
        }
        Relationships: []
      }
      leavers_access_log: {
        Row: {
          accessed_at: string
          context: string | null
          id: number
          rows_returned: number
          user_email: string
        }
        Insert: {
          accessed_at?: string
          context?: string | null
          id?: number
          rows_returned: number
          user_email: string
        }
        Update: {
          accessed_at?: string
          context?: string | null
          id?: number
          rows_returned?: number
          user_email?: string
        }
        Relationships: []
      }
      monthly_metrics: {
        Row: {
          attrition_rate: number | null
          avg_salary_leaders: number | null
          avg_salary_non_leaders: number | null
          brand: string
          business_unit: Database["public"]["Enums"]["business_unit"] | null
          created_at: string | null
          dept_data: Json
          exit_survey: Json | null
          gender_female: number | null
          gender_female_pct: number | null
          gender_male: number | null
          headcount: number
          id: string
          joiners: number
          leader_female: number | null
          leader_female_pct: number | null
          leaders: number | null
          leaders_pct: number | null
          leavers: number
          month: string
          promotions: number | null
          quality_flag: string | null
          salary_band_attrition: Json | null
          source: string
          state_mix: Json
          updated_at: string | null
        }
        Insert: {
          attrition_rate?: number | null
          avg_salary_leaders?: number | null
          avg_salary_non_leaders?: number | null
          brand: string
          business_unit?: Database["public"]["Enums"]["business_unit"] | null
          created_at?: string | null
          dept_data?: Json
          exit_survey?: Json | null
          gender_female?: number | null
          gender_female_pct?: number | null
          gender_male?: number | null
          headcount: number
          id?: string
          joiners?: number
          leader_female?: number | null
          leader_female_pct?: number | null
          leaders?: number | null
          leaders_pct?: number | null
          leavers?: number
          month: string
          promotions?: number | null
          quality_flag?: string | null
          salary_band_attrition?: Json | null
          source?: string
          state_mix?: Json
          updated_at?: string | null
        }
        Update: {
          attrition_rate?: number | null
          avg_salary_leaders?: number | null
          avg_salary_non_leaders?: number | null
          brand?: string
          business_unit?: Database["public"]["Enums"]["business_unit"] | null
          created_at?: string | null
          dept_data?: Json
          exit_survey?: Json | null
          gender_female?: number | null
          gender_female_pct?: number | null
          gender_male?: number | null
          headcount?: number
          id?: string
          joiners?: number
          leader_female?: number | null
          leader_female_pct?: number | null
          leaders?: number | null
          leaders_pct?: number | null
          leavers?: number
          month?: string
          promotions?: number | null
          quality_flag?: string | null
          salary_band_attrition?: Json | null
          source?: string
          state_mix?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      onboarding_survey_aggregates: {
        Row: {
          id: string
          loaded_at: string
          metrics: Json
          n: number
          slice_type: string
          slice_value: string
          survey_stage: string
        }
        Insert: {
          id?: string
          loaded_at?: string
          metrics: Json
          n: number
          slice_type: string
          slice_value: string
          survey_stage: string
        }
        Update: {
          id?: string
          loaded_at?: string
          metrics?: Json
          n?: number
          slice_type?: string
          slice_value?: string
          survey_stage?: string
        }
        Relationships: []
      }
      salary_bands: {
        Row: {
          contract: string
          created_at: string | null
          effective_from: string
          id: string
          job_family: string
          level: string
          maximum: number
          midpoint: number
          minimum: number
          q1: number | null
          q2: number | null
          q3: number | null
          q4: number | null
        }
        Insert: {
          contract: string
          created_at?: string | null
          effective_from?: string
          id?: string
          job_family: string
          level: string
          maximum: number
          midpoint: number
          minimum: number
          q1?: number | null
          q2?: number | null
          q3?: number | null
          q4?: number | null
        }
        Update: {
          contract?: string
          created_at?: string | null
          effective_from?: string
          id?: string
          job_family?: string
          level?: string
          maximum?: number
          midpoint?: number
          minimum?: number
          q1?: number | null
          q2?: number | null
          q3?: number | null
          q4?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      business_unit: "nsx_br" | "betfair" | "flutter_intl"
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
  public: {
    Enums: {
      business_unit: ["nsx_br", "betfair", "flutter_intl"],
    },
  },
} as const
