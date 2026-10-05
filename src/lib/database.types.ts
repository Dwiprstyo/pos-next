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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          outlet_id: string | null
          staff_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          outlet_id?: string | null
          staff_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          outlet_id?: string | null
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      dining_tables: {
        Row: {
          current_order_id: string | null
          id: string
          label: string
          outlet_id: string
          status: Database["public"]["Enums"]["table_status"]
        }
        Insert: {
          current_order_id?: string | null
          id?: string
          label: string
          outlet_id: string
          status?: Database["public"]["Enums"]["table_status"]
        }
        Update: {
          current_order_id?: string | null
          id?: string
          label?: string
          outlet_id?: string
          status?: Database["public"]["Enums"]["table_status"]
        }
        Relationships: [
          {
            foreignKeyName: "dining_tables_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_dining_tables_current_order"
            columns: ["current_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients: {
        Row: {
          created_at: string
          current_stock: number
          id: string
          min_stock_alert: number
          name: string
          outlet_id: string
          unit: string
        }
        Insert: {
          created_at?: string
          current_stock?: number
          id?: string
          min_stock_alert?: number
          name: string
          outlet_id: string
          unit: string
        }
        Update: {
          created_at?: string
          current_stock?: number
          id?: string
          min_stock_alert?: number
          name?: string
          outlet_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          id: string
          name: string
          outlet_id: string
          sort_order: number
          station: string
        }
        Insert: {
          id?: string
          name: string
          outlet_id: string
          sort_order?: number
          station?: string
        }
        Update: {
          id?: string
          name?: string
          outlet_id?: string
          sort_order?: number
          station?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_ingredients: {
        Row: {
          ingredient_id: string
          menu_item_id: string
          qty_required: number
        }
        Insert: {
          ingredient_id: string
          menu_item_id: string
          qty_required: number
        }
        Update: {
          ingredient_id?: string
          menu_item_id?: string
          qty_required?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_ingredients_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          base_price: number
          category_id: string | null
          created_at: string
          id: string
          image_url: string | null
          is_available: boolean
          name: string
          outlet_id: string
        }
        Insert: {
          base_price: number
          category_id?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_available?: boolean
          name: string
          outlet_id: string
        }
        Update: {
          base_price?: number
          category_id?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_available?: boolean
          name?: string
          outlet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_variants: {
        Row: {
          extra_price: number
          order_item_id: string
          variant_name: string
          variant_option_id: string
        }
        Insert: {
          extra_price?: number
          order_item_id: string
          variant_name: string
          variant_option_id: string
        }
        Update: {
          extra_price?: number
          order_item_id?: string
          variant_name?: string
          variant_option_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_item_variants_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "kds_order_items_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_variants_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_variants_variant_option_id_fkey"
            columns: ["variant_option_id"]
            isOneToOne: false
            referencedRelation: "variant_options"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          kitchen_status: Database["public"]["Enums"]["kitchen_status"]
          kitchen_status_updated_at: string
          kitchen_status_updated_by: string | null
          menu_item_id: string
          menu_name: string
          notes: string | null
          order_id: string
          outlet_id: string
          qty: number
          station: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          kitchen_status?: Database["public"]["Enums"]["kitchen_status"]
          kitchen_status_updated_at?: string
          kitchen_status_updated_by?: string | null
          menu_item_id: string
          menu_name: string
          notes?: string | null
          order_id: string
          outlet_id: string
          qty?: number
          station?: string
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          kitchen_status?: Database["public"]["Enums"]["kitchen_status"]
          kitchen_status_updated_at?: string
          kitchen_status_updated_by?: string | null
          menu_item_id?: string
          menu_name?: string
          notes?: string | null
          order_id?: string
          outlet_id?: string
          qty?: number
          station?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_kitchen_status_updated_by_fkey"
            columns: ["kitchen_status_updated_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string
          discount_amount: number
          discount_approved_by: string | null
          discount_type: string | null
          discount_value: number | null
          id: string
          order_number: number
          order_type: Database["public"]["Enums"]["order_type"]
          outlet_id: string
          paid_at: string | null
          shift_id: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          table_id: string | null
          tax_amount: number
          total: number
          void_reason: string | null
          voided_by: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by: string
          discount_amount?: number
          discount_approved_by?: string | null
          discount_type?: string | null
          discount_value?: number | null
          id?: string
          order_number?: never
          order_type: Database["public"]["Enums"]["order_type"]
          outlet_id: string
          paid_at?: string | null
          shift_id: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_id?: string | null
          tax_amount?: number
          total?: number
          void_reason?: string | null
          voided_by?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string
          discount_amount?: number
          discount_approved_by?: string | null
          discount_type?: string | null
          discount_value?: number | null
          id?: string
          order_number?: never
          order_type?: Database["public"]["Enums"]["order_type"]
          outlet_id?: string
          paid_at?: string | null
          shift_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_id?: string | null
          tax_amount?: number
          total?: number
          void_reason?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_discount_approved_by_fkey"
            columns: ["discount_approved_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "dining_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      outlets: {
        Row: {
          address: string | null
          created_at: string
          discount_approval_threshold: number
          id: string
          is_active: boolean
          name: string
          service_charge_percent: number
          tax_percent: number
          timezone: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          discount_approval_threshold?: number
          id?: string
          is_active?: boolean
          name: string
          service_charge_percent?: number
          tax_percent?: number
          timezone?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          discount_approval_threshold?: number
          id?: string
          is_active?: boolean
          name?: string
          service_charge_percent?: number
          tax_percent?: number
          timezone?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          gateway_response: Json | null
          id: string
          idempotency_key: string | null
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          paid_at: string
          reference_no: string | null
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount: number
          gateway_response?: Json | null
          id?: string
          idempotency_key?: string | null
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          paid_at?: string
          reference_no?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount?: number
          gateway_response?: Json | null
          id?: string
          idempotency_key?: string | null
          method?: Database["public"]["Enums"]["payment_method"]
          order_id?: string
          paid_at?: string
          reference_no?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          cash_variance: number | null
          closed_at: string | null
          closing_cash_actual: number | null
          closing_cash_expected: number | null
          id: string
          opened_at: string
          opening_cash: number
          outlet_id: string
          staff_id: string
        }
        Insert: {
          cash_variance?: number | null
          closed_at?: string | null
          closing_cash_actual?: number | null
          closing_cash_expected?: number | null
          id?: string
          opened_at?: string
          opening_cash?: number
          outlet_id: string
          staff_id: string
        }
        Update: {
          cash_variance?: number | null
          closed_at?: string | null
          closing_cash_actual?: number | null
          closing_cash_expected?: number | null
          id?: string
          opened_at?: string
          opening_cash?: number
          outlet_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          created_at: string
          failed_pin_attempts: number
          full_name: string
          id: string
          is_active: boolean
          is_multi_outlet: boolean
          locked_until: string | null
          outlet_id: string | null
          pin_hash: string
          role: Database["public"]["Enums"]["staff_role"]
          staff_code: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          failed_pin_attempts?: number
          full_name: string
          id?: string
          is_active?: boolean
          is_multi_outlet?: boolean
          locked_until?: string | null
          outlet_id?: string | null
          pin_hash: string
          role: Database["public"]["Enums"]["staff_role"]
          staff_code: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          failed_pin_attempts?: number
          full_name?: string
          id?: string
          is_active?: boolean
          is_multi_outlet?: boolean
          locked_until?: string | null
          outlet_id?: string | null
          pin_hash?: string
          role?: Database["public"]["Enums"]["staff_role"]
          staff_code?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transactions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          ingredient_id: string
          order_id: string | null
          qty_change: number
          reason: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          ingredient_id: string
          order_id?: string | null
          qty_change: number
          reason?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          ingredient_id?: string
          order_id?: string | null
          qty_change?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      variant_groups: {
        Row: {
          id: string
          is_required: boolean
          max_select: number
          menu_item_id: string
          min_select: number
          name: string
        }
        Insert: {
          id?: string
          is_required?: boolean
          max_select?: number
          menu_item_id: string
          min_select?: number
          name: string
        }
        Update: {
          id?: string
          is_required?: boolean
          max_select?: number
          menu_item_id?: string
          min_select?: number
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_groups_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      variant_options: {
        Row: {
          extra_price: number
          id: string
          name: string
          variant_group_id: string
        }
        Insert: {
          extra_price?: number
          id?: string
          name: string
          variant_group_id: string
        }
        Update: {
          extra_price?: number
          id?: string
          name?: string
          variant_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_options_variant_group_id_fkey"
            columns: ["variant_group_id"]
            isOneToOne: false
            referencedRelation: "variant_groups"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      daily_sales_summary: {
        Row: {
          cash_sales: number | null
          discount_total: number | null
          gross_sales: number | null
          net_sales: number | null
          non_cash_sales: number | null
          orders_count: number | null
          outlet_id: string | null
          outlet_name: string | null
          sale_date: string | null
          tax_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      kds_order_items_view: {
        Row: {
          id: string | null
          item_created_at: string | null
          kitchen_status: Database["public"]["Enums"]["kitchen_status"] | null
          kitchen_status_updated_at: string | null
          menu_name: string | null
          notes: string | null
          order_created_at: string | null
          order_id: string | null
          order_number: number | null
          order_status: Database["public"]["Enums"]["order_status"] | null
          order_type: Database["public"]["Enums"]["order_type"] | null
          outlet_id: string | null
          qty: number | null
          station: string | null
          table_label: string | null
          variants: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _audit: {
        Args: {
          p_action: string
          p_entity_id: string
          p_entity_type: string
          p_metadata?: Json
          p_outlet_id: string
          p_staff_id: string
        }
        Returns: undefined
      }
      add_order_items: {
        Args: { p_items: Json; p_order_id: string }
        Returns: {
          client_id: string | null
          created_at: string
          created_by: string
          discount_amount: number
          discount_approved_by: string | null
          discount_type: string | null
          discount_value: number | null
          id: string
          order_number: number
          order_type: Database["public"]["Enums"]["order_type"]
          outlet_id: string
          paid_at: string | null
          shift_id: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          table_id: string | null
          tax_amount: number
          total: number
          void_reason: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      adjust_stock: {
        Args: {
          p_ingredient_id: string
          p_qty_change: number
          p_reason?: string
        }
        Returns: {
          created_at: string
          current_stock: number
          id: string
          min_stock_alert: number
          name: string
          outlet_id: string
          unit: string
        }
        SetofOptions: {
          from: "*"
          to: "ingredients"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_order_discount:
        | {
            Args: { p_order_id: string; p_type: string; p_value: number }
            Returns: {
              client_id: string | null
              created_at: string
              created_by: string
              discount_amount: number
              discount_approved_by: string | null
              discount_type: string | null
              discount_value: number | null
              id: string
              order_number: number
              order_type: Database["public"]["Enums"]["order_type"]
              outlet_id: string
              paid_at: string | null
              shift_id: string
              status: Database["public"]["Enums"]["order_status"]
              subtotal: number
              table_id: string | null
              tax_amount: number
              total: number
              void_reason: string | null
              voided_by: string | null
            }
            SetofOptions: {
              from: "*"
              to: "orders"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_approved_by: string
              p_order_id: string
              p_type: string
              p_value: number
            }
            Returns: {
              client_id: string | null
              created_at: string
              created_by: string
              discount_amount: number
              discount_approved_by: string | null
              discount_type: string | null
              discount_value: number | null
              id: string
              order_number: number
              order_type: Database["public"]["Enums"]["order_type"]
              outlet_id: string
              paid_at: string | null
              shift_id: string
              status: Database["public"]["Enums"]["order_status"]
              subtotal: number
              table_id: string | null
              tax_amount: number
              total: number
              void_reason: string | null
              voided_by: string | null
            }
            SetofOptions: {
              from: "*"
              to: "orders"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      can_access_outlet: { Args: { p_outlet_id: string }; Returns: boolean }
      close_shift: {
        Args: { p_closing_cash_actual: number; p_shift_id: string }
        Returns: {
          cash_variance: number | null
          closed_at: string | null
          closing_cash_actual: number | null
          closing_cash_expected: number | null
          id: string
          opened_at: string
          opening_cash: number
          outlet_id: string
          staff_id: string
        }
        SetofOptions: {
          from: "*"
          to: "shifts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_gateway_payment: {
        Args: {
          p_amount: number
          p_gateway_response: Json
          p_idempotency_key: string
          p_method: Database["public"]["Enums"]["payment_method"]
          p_order_id: string
          p_reference_no: string
        }
        Returns: {
          amount: number
          gateway_response: Json | null
          id: string
          idempotency_key: string | null
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          paid_at: string
          reference_no: string | null
          status: Database["public"]["Enums"]["payment_status"]
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_order: {
        Args: {
          p_client_id: string
          p_items: Json
          p_order_type: Database["public"]["Enums"]["order_type"]
          p_table_id: string
        }
        Returns: {
          client_id: string | null
          created_at: string
          created_by: string
          discount_amount: number
          discount_approved_by: string | null
          discount_type: string | null
          discount_value: number | null
          id: string
          order_number: number
          order_type: Database["public"]["Enums"]["order_type"]
          outlet_id: string
          paid_at: string | null
          shift_id: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          table_id: string | null
          tax_amount: number
          total: number
          void_reason: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      daily_sales: {
        Args: { p_from: string; p_outlet_id?: string; p_to: string }
        Returns: {
          cash_sales: number
          discount_total: number
          gross_sales: number
          net_sales: number
          non_cash_sales: number
          orders_count: number
          outlet_id: string
          outlet_name: string
          sale_date: string
          tax_total: number
        }[]
      }
      is_cashier_or_manager: { Args: never; Returns: boolean }
      is_manager: { Args: never; Returns: boolean }
      jwt_app_role: { Args: never; Returns: string }
      jwt_is_multi_outlet: { Args: never; Returns: boolean }
      jwt_outlet_id: { Args: never; Returns: string }
      jwt_staff_id: { Args: never; Returns: string }
      open_shift: {
        Args: { p_opening_cash: number }
        Returns: {
          cash_variance: number | null
          closed_at: string | null
          closing_cash_actual: number | null
          closing_cash_expected: number | null
          id: string
          opened_at: string
          opening_cash: number
          outlet_id: string
          staff_id: string
        }
        SetofOptions: {
          from: "*"
          to: "shifts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pay_order: {
        Args: {
          p_idempotency_key?: string
          p_order_id: string
          p_payments: Json
        }
        Returns: {
          client_id: string | null
          created_at: string
          created_by: string
          discount_amount: number
          discount_approved_by: string | null
          discount_type: string | null
          discount_value: number | null
          id: string
          order_number: number
          order_type: Database["public"]["Enums"]["order_type"]
          outlet_id: string
          paid_at: string | null
          shift_id: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          table_id: string | null
          tax_amount: number
          total: number
          void_reason: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      recompute_order_totals: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      refresh_daily_sales_summary: { Args: never; Returns: undefined }
      set_kitchen_status: {
        Args: {
          p_new_status: Database["public"]["Enums"]["kitchen_status"]
          p_order_item_id: string
        }
        Returns: {
          created_at: string
          id: string
          kitchen_status: Database["public"]["Enums"]["kitchen_status"]
          kitchen_status_updated_at: string
          kitchen_status_updated_by: string | null
          menu_item_id: string
          menu_name: string
          notes: string | null
          order_id: string
          outlet_id: string
          qty: number
          station: string
          unit_price: number
        }
        SetofOptions: {
          from: "*"
          to: "order_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      settle_gateway_payment: {
        Args: {
          p_amount: number
          p_gateway_response?: Json
          p_method: Database["public"]["Enums"]["payment_method"]
          p_order_id: string
          p_reference_no: string
          p_status?: Database["public"]["Enums"]["payment_status"]
        }
        Returns: {
          client_id: string | null
          created_at: string
          created_by: string
          discount_amount: number
          discount_approved_by: string | null
          discount_type: string | null
          discount_value: number | null
          id: string
          order_number: number
          order_type: Database["public"]["Enums"]["order_type"]
          outlet_id: string
          paid_at: string | null
          shift_id: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          table_id: string | null
          tax_amount: number
          total: number
          void_reason: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      shift_summary: {
        Args: { p_shift_id: string }
        Returns: {
          cash_sales: number
          cash_variance: number
          closed_at: string
          closing_cash_actual: number
          expected_cash: number
          non_cash_sales: number
          opened_at: string
          opening_cash: number
          orders_count: number
          total_sales: number
        }[]
      }
      top_selling_items: {
        Args: {
          p_from: string
          p_limit?: number
          p_outlet_id?: string
          p_to: string
        }
        Returns: {
          menu_item_id: string
          menu_name: string
          qty_sold: number
          revenue: number
        }[]
      }
      void_order:
        | {
            Args: { p_order_id: string; p_reason: string }
            Returns: {
              client_id: string | null
              created_at: string
              created_by: string
              discount_amount: number
              discount_approved_by: string | null
              discount_type: string | null
              discount_value: number | null
              id: string
              order_number: number
              order_type: Database["public"]["Enums"]["order_type"]
              outlet_id: string
              paid_at: string | null
              shift_id: string
              status: Database["public"]["Enums"]["order_status"]
              subtotal: number
              table_id: string | null
              tax_amount: number
              total: number
              void_reason: string | null
              voided_by: string | null
            }
            SetofOptions: {
              from: "*"
              to: "orders"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_approved_by: string
              p_order_id: string
              p_reason: string
            }
            Returns: {
              client_id: string | null
              created_at: string
              created_by: string
              discount_amount: number
              discount_approved_by: string | null
              discount_type: string | null
              discount_value: number | null
              id: string
              order_number: number
              order_type: Database["public"]["Enums"]["order_type"]
              outlet_id: string
              paid_at: string | null
              shift_id: string
              status: Database["public"]["Enums"]["order_status"]
              subtotal: number
              table_id: string | null
              tax_amount: number
              total: number
              void_reason: string | null
              voided_by: string | null
            }
            SetofOptions: {
              from: "*"
              to: "orders"
              isOneToOne: true
              isSetofReturn: false
            }
          }
    }
    Enums: {
      kitchen_status: "new" | "cooking" | "ready" | "served"
      order_status: "open" | "paid" | "void"
      order_type: "dine_in" | "takeaway"
      payment_method: "cash" | "qris" | "card" | "ewallet"
      payment_status: "pending" | "paid" | "failed"
      staff_role: "cashier" | "kitchen" | "manager"
      table_status: "empty" | "occupied" | "unpaid"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
    Enums: {
      kitchen_status: ["new", "cooking", "ready", "served"],
      order_status: ["open", "paid", "void"],
      order_type: ["dine_in", "takeaway"],
      payment_method: ["cash", "qris", "card", "ewallet"],
      payment_status: ["pending", "paid", "failed"],
      staff_role: ["cashier", "kitchen", "manager"],
      table_status: ["empty", "occupied", "unpaid"],
    },
  },
} as const

