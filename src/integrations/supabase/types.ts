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
      bar_sessions: {
        Row: {
          id: string
          owner_id: string
          opened_at: string
          closed_at: string | null
        }
        Insert: {
          id?: string
          owner_id: string
          opened_at?: string
          closed_at?: string | null
        }
        Update: {
          id?: string
          owner_id?: string
          opened_at?: string
          closed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bar_sessions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bar_sub_sessions: {
        Row: {
          id: string
          owner_id: string
          bar_session_id: string
          opened_at: string
          closed_at: string | null
          cashier_float: number
        }
        Insert: {
          id?: string
          owner_id: string
          bar_session_id: string
          opened_at?: string
          closed_at?: string | null
          cashier_float?: number
        }
        Update: {
          id?: string
          owner_id?: string
          bar_session_id?: string
          opened_at?: string
          closed_at?: string | null
          cashier_float?: number
        }
        Relationships: [
          {
            foreignKeyName: "bar_sub_sessions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_sub_sessions_bar_session_id_fkey"
            columns: ["bar_session_id"]
            isOneToOne: false
            referencedRelation: "bar_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_plans: {
        Row: {
          id: string
          name: string
          amount: number
          duration_months: number
          currency: string
          plan_type: string | null
        }
        Insert: {
          id?: string
          name: string
          amount: number
          duration_months: number
          currency?: string
          plan_type?: string | null
        }
        Update: {
          id?: string
          name?: string
          amount?: number
          duration_months?: number
          currency?: string
          plan_type?: string | null
        }
        Relationships: []
      }
      billing_payments: {
        Row: {
          id: string
          owner_id: string
          plan_id: string
          reference_number: string
          amount: number
          status: string
          payment_date: string | null
          due_date: string
          next_due_date: string | null
          approved_by: string | null
          approved_at: string | null
          notes: string | null
          created_at: string
          updated_at: string
          payment_method: string | null
        }
        Insert: {
          id?: string
          owner_id: string
          plan_id: string
          reference_number: string
          amount: number
          status?: string
          payment_date?: string | null
          due_date: string
          next_due_date?: string | null
          approved_by?: string | null
          approved_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          payment_method?: string | null
        }
        Update: {
          id?: string
          owner_id?: string
          plan_id?: string
          reference_number?: string
          amount?: number
          status?: string
          payment_date?: string | null
          due_date?: string
          next_due_date?: string | null
          approved_by?: string | null
          approved_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          payment_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_payments_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_payments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_bank_details: {
        Row: {
          id: string
          admin_id: string
          bank_name: string
          account_name: string
          account_number: string
          branch: string | null
          swift_code: string | null
          instructions: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          admin_id: string
          bank_name: string
          account_name: string
          account_number: string
          branch?: string | null
          swift_code?: string | null
          instructions?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          admin_id?: string
          bank_name?: string
          account_name?: string
          account_number?: string
          branch?: string | null
          swift_code?: string | null
          instructions?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          id: string
          flag_name: string
          enabled: boolean
          description: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          flag_name: string
          enabled?: boolean
          description?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          flag_name?: string
          enabled?: boolean
          description?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      device_tokens: {
        Row: {
          id: string
          owner_id: string
          token: string
          platform: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          token: string
          platform?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          token?: string
          platform?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_tokens_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_monitor_logs: {
        Row: {
          id: string
          machine_id: string
          owner_id: string
          in_present: number
          out_present: number
          in_last: number
          out_last: number
          in_diff: number
          out_diff: number
          seq: number
          logged_at: string
        }
        Insert: {
          id?: string
          machine_id: string
          owner_id: string
          in_present?: number
          out_present?: number
          in_last?: number
          out_last?: number
          in_diff?: number
          out_diff?: number
          seq?: number
          logged_at?: string
        }
        Update: {
          id?: string
          machine_id?: string
          owner_id?: string
          in_present?: number
          out_present?: number
          in_last?: number
          out_last?: number
          in_diff?: number
          out_diff?: number
          seq?: number
          logged_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_monitor_logs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_monitor: {
        Row: {
          machine_id: string
          owner_id: string
          in_entry: number
          in_total: number
          in_diff: number
          out_entry: number
          out_total: number
          out_diff: number
          updated_at: string
        }
        Insert: {
          machine_id: string
          owner_id: string
          in_entry?: number
          in_total?: number
          in_diff?: number
          out_entry?: number
          out_total?: number
          out_diff?: number
          updated_at?: string
        }
        Update: {
          machine_id?: string
          owner_id?: string
          in_entry?: number
          in_total?: number
          in_diff?: number
          out_entry?: number
          out_total?: number
          out_diff?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_monitor_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: true
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      cashier_salaries: {
        Row: {
          id: string
          cashier_id: string
          owner_id: string
          amount: number
          frequency: string | null
          pay_day: number | null
          pay_time: string | null
          next_pay_at: string | null
          last_paid_at: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          cashier_id: string
          owner_id: string
          amount?: number
          frequency?: string | null
          pay_day?: number | null
          pay_time?: string | null
          next_pay_at?: string | null
          last_paid_at?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          cashier_id?: string
          owner_id?: string
          amount?: number
          frequency?: string | null
          pay_day?: number | null
          pay_time?: string | null
          next_pay_at?: string | null
          last_paid_at?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashier_salaries_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      youtube_api_keys: {
        Row: {
          slot: number
          label: string
          enabled: boolean
          daily_limit: number
          used_today: number
          exhausted: boolean
          last_used_at: string | null
          reset_at: string | null
          created_at: string
        }
        Insert: {
          slot: number
          label?: string
          enabled?: boolean
          daily_limit?: number
          used_today?: number
          exhausted?: boolean
          last_used_at?: string | null
          reset_at?: string | null
          created_at?: string
        }
        Update: {
          slot?: number
          label?: string
          enabled?: boolean
          daily_limit?: number
          used_today?: number
          exhausted?: boolean
          last_used_at?: string | null
          reset_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      youtube_search_log: {
        Row: {
          id: string
          user_id: string | null
          query: string
          type: string
          key_slot: number | null
          success: boolean
          error_code: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          query: string
          type?: string
          key_slot?: number | null
          success?: boolean
          error_code?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          query?: string
          type?: string
          key_slot?: number | null
          success?: boolean
          error_code?: string | null
          created_at?: string
        }
        Relationships: []
      }
      machine_alert_settings: {
        Row: {
          owner_id: string
          enabled: boolean
          threshold: number
          updated_at: string
        }
        Insert: {
          owner_id: string
          enabled?: boolean
          threshold?: number
          updated_at?: string
        }
        Update: {
          owner_id?: string
          enabled?: boolean
          threshold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_alert_settings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bar_sort_order: {
        Row: {
          owner_id: string
          order_json: Json
          updated_at: string
        }
        Insert: {
          owner_id: string
          order_json?: Json
          updated_at?: string
        }
        Update: {
          owner_id?: string
          order_json?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bar_sort_order_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
          discount_amount: number | null
          id: string
          items: Json
          original_total: number | null
          owner_id: string
          paid: number
          total: number
        }
        Insert: {
          cashier_id: string
          change_given: number
          created_at?: string
          discount_amount?: number | null
          id?: string
          items: Json
          original_total?: number | null
          owner_id: string
          paid: number
          total: number
        }
        Update: {
          cashier_id?: string
          change_given?: number
          created_at?: string
          discount_amount?: number | null
          id?: string
          items?: Json
          original_total?: number | null
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
      opened_bottles: {
        Row: {
          id: string
          owner_id: string
          product_id: string
          product_name: string
          shot_price: number
          shots_sold: number
          revenue: number
          opened_at: string
          finished_at: string | null
          status: string
          variation_counts: Json | null
          units_consumed: number | null
        }
        Insert: {
          id?: string
          owner_id: string
          product_id: string
          product_name: string
          shot_price?: number
          shots_sold?: number
          revenue?: number
          opened_at?: string
          finished_at?: string | null
          status?: string
          variation_counts?: Json | null
          units_consumed?: number | null
        }
        Update: {
          id?: string
          owner_id?: string
          product_id?: string
          product_name?: string
          shot_price?: number
          shots_sold?: number
          revenue?: number
          opened_at?: string
          finished_at?: string | null
          status?: string
          variation_counts?: Json | null
          units_consumed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "opened_bottles_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opened_bottles_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      opened_packs: {
        Row: {
          id: string
          owner_id: string
          product_id: string
          product_name: string
          pack_type: string
          unit_price: number
          units_sold: number
          revenue: number
          opened_at: string
          finished_at: string | null
          status: string
        }
        Insert: {
          id?: string
          owner_id: string
          product_id: string
          product_name: string
          pack_type?: string
          unit_price?: number
          units_sold?: number
          revenue?: number
          opened_at?: string
          finished_at?: string | null
          status?: string
        }
        Update: {
          id?: string
          owner_id?: string
          product_id?: string
          product_name?: string
          pack_type?: string
          unit_price?: number
          units_sold?: number
          revenue?: number
          opened_at?: string
          finished_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "opened_packs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opened_packs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_float_sessions: {
        Row: {
          id: string
          owner_id: string
          amount: number
          set_at: string
          created_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          amount: number
          set_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          amount?: number
          set_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_float_sessions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_entries: {
        Row: {
          id: string
          machine_id: string
          owner_id: string
          type: string
          amount: number
          note: string | null
          entry_date: string
          created_at: string
          cashier_id: string | null
          cashier_name: string | null
          proof_image_url: string | null
        }
        Insert: {
          id?: string
          machine_id: string
          owner_id: string
          type: string
          amount: number
          note?: string | null
          entry_date: string
          created_at?: string
          cashier_id?: string | null
          cashier_name?: string | null
          proof_image_url?: string | null
        }
        Update: {
          id?: string
          machine_id?: string
          owner_id?: string
          type?: string
          amount?: number
          note?: string | null
          entry_date?: string
          created_at?: string
          cashier_id?: string | null
          cashier_name?: string | null
          proof_image_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "machine_entries_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_entries_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      machines: {
        Row: {
          id: string
          owner_id: string
          name: string
          created_at: string
          sort_order: number
        }
        Insert: {
          id?: string
          owner_id: string
          name: string
          created_at?: string
          sort_order?: number
        }
        Update: {
          id?: string
          owner_id?: string
          name?: string
          created_at?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "machines_owner_id_fkey"
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
          cost_price: number
          stock_qty: number
          sort_order: number
          stock_qty_undo: number | null
          stock_qty_undo_saved: number | null
          stock_last_expense_id: string | null
          units_per_item: number | null
          bottle_variations: Json | null
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          image_url?: string | null
          name: string
          owner_id: string
          price: number
          cost_price?: number
          stock_qty?: number
          sort_order?: number
          stock_qty_undo?: number | null
          stock_qty_undo_saved?: number | null
          stock_last_expense_id?: string | null
          units_per_item?: number | null
          bottle_variations?: Json | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string
          owner_id?: string
          price?: number
          cost_price?: number
          stock_qty?: number
          sort_order?: number
          stock_qty_undo?: number | null
          stock_qty_undo_saved?: number | null
          stock_last_expense_id?: string | null
          units_per_item?: number | null
          bottle_variations?: Json | null
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
          email: string | null
          phone: string | null
          address: string | null
          billing_status: string | null
          plan_type: string | null
          subscription_start_date: string | null
          subscription_end_date: string | null
          premium_subscription_start_date: string | null
          premium_subscription_end_date: string | null
          machines_addon_active: boolean | null
          machines_addon_start_date: string | null
          machines_addon_end_date: string | null
          bar_addon_active: boolean | null
          music_addon: boolean | null
          chain_addon_active: boolean | null
          chain_bar_count: number | null
          is_bar_account: boolean | null
          bar_session_start: string | null
          bar_closed_at: string | null
          cashier_float: number | null
          cashier_float_set_at: string | null
          job_title: string | null
          has_login: boolean | null
          cashier_access: string | string[] | null
        }
        Insert: {
          created_at?: string
          id: string
          parent_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["user_status"]
          username: string
          wallet_balance?: number
          email?: string | null
          phone?: string | null
          address?: string | null
          billing_status?: string | null
          plan_type?: string | null
          subscription_start_date?: string | null
          subscription_end_date?: string | null
          premium_subscription_start_date?: string | null
          premium_subscription_end_date?: string | null
          machines_addon_active?: boolean | null
          machines_addon_start_date?: string | null
          machines_addon_end_date?: string | null
          bar_addon_active?: boolean | null
          music_addon?: boolean | null
          chain_addon_active?: boolean | null
          chain_bar_count?: number | null
          is_bar_account?: boolean | null
          bar_session_start?: string | null
          bar_closed_at?: string | null
          cashier_float?: number | null
          cashier_float_set_at?: string | null
          job_title?: string | null
          has_login?: boolean | null
          cashier_access?: string[] | null
        }
        Update: {
          created_at?: string
          id?: string
          parent_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["user_status"]
          username?: string
          wallet_balance?: number
          email?: string | null
          phone?: string | null
          address?: string | null
          billing_status?: string | null
          plan_type?: string | null
          subscription_start_date?: string | null
          subscription_end_date?: string | null
          premium_subscription_start_date?: string | null
          premium_subscription_end_date?: string | null
          machines_addon_active?: boolean | null
          machines_addon_start_date?: string | null
          machines_addon_end_date?: string | null
          bar_addon_active?: boolean | null
          music_addon?: boolean | null
          chain_addon_active?: boolean | null
          chain_bar_count?: number | null
          is_bar_account?: boolean | null
          bar_session_start?: string | null
          bar_closed_at?: string | null
          cashier_float?: number | null
          cashier_float_set_at?: string | null
          job_title?: string | null
          has_login?: boolean | null
          cashier_access?: string[] | null
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
      restore_stock_item: { Args: { p_items: Json }; Returns: undefined }
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
      open_bottle: {
        Args: { p_owner_id: string; p_product_id: string; p_shot_price: number }
        Returns: string
      }
      cancel_bottle: { Args: { p_bottle_id: string }; Returns: undefined }
      finish_bottle: {
        Args: { p_bottle_id: string; p_cashier_id: string }
        Returns: undefined
      }
      record_shot: {
        Args: { p_bottle_id: string; p_qty: number; p_revenue: number }
        Returns: undefined
      }
      open_pack: {
        Args: {
          p_owner_id: string
          p_product_id: string
          p_pack_type: string
          p_unit_price: number
        }
        Returns: string
      }
      cancel_pack: { Args: { p_pack_id: string }; Returns: undefined }
      finish_pack: {
        Args: { p_pack_id: string; p_cashier_id: string }
        Returns: undefined
      }
      record_pack_unit: {
        Args: { p_pack_id: string; p_qty: number; p_revenue: number }
        Returns: undefined
      }
      generate_payment_reference: {
        Args: Record<string, never>
        Returns: string
      }
      delete_own_account: {
        Args: { _user_id: string }
        Returns: undefined
      }
      get_youtube_daily_stats: {
        Args: Record<string, never>
        Returns: {
          searches_today: number
          successful_today: number
          failed_today: number
          quota_used_today: number
          quota_remaining: number
          unique_users_today: number
          active_keys: number
          total_keys: number
        }
      }
      reset_youtube_key_counts: {
        Args: Record<string, never>
        Returns: undefined
      }
      reset_cashier_wallets: {
        Args: { _owner_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "owner" | "cashier" | "admin" | "manager" | "custom"
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
      app_role: ["owner", "cashier", "admin", "manager", "custom"],
      user_status: ["pending", "approved", "suspended", "expelled"],
    },
  },
} as const
