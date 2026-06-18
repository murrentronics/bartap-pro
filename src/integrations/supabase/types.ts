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
      credit_accounts: {
        Row: {
          id: string
          owner_id: string
          full_name: string
          contact_number: string | null
          id_image_url: string | null
          id_number: string | null
          balance_owed: number
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          full_name: string
          contact_number?: string | null
          id_image_url?: string | null
          id_number?: string | null
          balance_owed?: number
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          full_name?: string
          contact_number?: string | null
          id_image_url?: string | null
          id_number?: string | null
          balance_owed?: number
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_accounts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          id: string
          credit_account_id: string
          owner_id: string
          cashier_id: string
          type: string
          amount: number
          note: string | null
          items: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          credit_account_id: string
          owner_id: string
          cashier_id: string
          type: string
          amount: number
          note?: string | null
          items?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          credit_account_id?: string
          owner_id?: string
          cashier_id?: string
          type?: string
          amount?: number
          note?: string | null
          items?: Json | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cashier_id: string
          change_given: number
          created_at: string
          id: string
          items: Json
          owner_id: string
          paid: number
          total: number
        }
        Insert: {
          cashier_id: string
          change_given: number
          created_at?: string
          id?: string
          items: Json
          owner_id: string
          paid: number
          total: number
        }
        Update: {
          cashier_id?: string
          change_given?: number
          created_at?: string
          id?: string
          items?: Json
          owner_id?: string
          paid?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string
          created_at: string
          id: string
          image_url: string | null
          name: string
          owner_id: string
          price: number
          stock_qty: number
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          image_url?: string | null
          name: string
          owner_id: string
          price: number
          stock_qty?: number
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string
          owner_id?: string
          price?: number
          stock_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          parent_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["user_status"]
          username: string
          wallet_balance: number
        }
        Insert: {
          created_at?: string
          id: string
          parent_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["user_status"]
          username: string
          wallet_balance?: number
        }
        Update: {
          created_at?: string
          id?: string
          parent_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["user_status"]
          username?: string
          wallet_balance?: number
        }
        Relationships: [
          {
            foreignKeyName: "profiles_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          created_at: string
          due_date: string
          id: string
          owner_id: string
          paid_at: string
        }
        Insert: {
          created_at?: string
          due_date: string
          id?: string
          owner_id: string
          paid_at?: string
        }
        Update: {
          created_at?: string
          due_date?: string
          id?: string
          owner_id?: string
          paid_at?: string
        }
        Relationships: []
      }
      template_images: {
        Row: {
          category: string
          created_at: string
          id: string
          label: string
          url: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          label: string
          url: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          label?: string
          url?: string
        }
        Relationships: []
      }
      owner_expenses: {
        Row: {
          id: string
          owner_id: string
          amount: number
          description: string | null
          expense_date: string
          created_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          amount: number
          description?: string | null
          expense_date?: string
          created_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          amount?: number
          description?: string | null
          expense_date?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_expenses_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_financials: {
        Row: {
          id: string
          owner_id: string
          initial_expense: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          initial_expense?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          initial_expense?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_financials_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          note: string | null
          order_id: string | null
          profile_id: string
          type: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          note?: string | null
          order_id?: string | null
          profile_id: string
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          note?: string | null
          order_id?: string | null
          profile_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_delete_user: { Args: { _user_id: string }; Returns: undefined }
      record_credit_charge: {
        Args: {
          p_credit_account_id: string
          p_cashier_id: string
          p_amount: number
          p_items: Json
          p_note?: string
        }
        Returns: undefined
      }
      record_credit_payment: {
        Args: {
          p_credit_account_id: string
          p_cashier_id: string
          p_amount: number
        }
        Returns: undefined
      }
      reduce_credit_balance: {
        Args: {
          p_credit_account_id: string
          p_amount: number
        }
        Returns: undefined
      }
      admin_list_profiles: {
        Args: never
        Returns: {
          created_at: string
          email: string
          id: string
          parent_id: string
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["user_status"]
          username: string
          wallet_balance: number
        }[]
      }
      decrement_stock_item: { Args: { p_items: Json }; Returns: undefined }
      get_owner_id: { Args: { _user_id: string }; Returns: string }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_owner: { Args: { _user_id: string }; Returns: boolean }
      owner_reset_wallet: {
        Args: { _owner_id: string; _prev_balance: number }
        Returns: undefined
      }
      transfer_cashier_to_owner: {
        Args: { _cashier_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "owner" | "cashier" | "admin"
      user_status: "pending" | "approved" | "suspended" | "expelled"
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
      app_role: ["owner", "cashier", "admin"],
      user_status: ["pending", "approved", "suspended", "expelled"],
    },
  },
} as const
