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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          actor_id: string
          created_at: string
          event_type: string
          id: string
          payload: Json
          project_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          project_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_call_log: {
        Row: {
          byok_user: boolean
          calling_function: string
          created_at: string
          duration_ms: number | null
          error_code: string | null
          fallback_provider: string | null
          id: string
          primary_provider: string
          snapshot_len: number
          used_provider: string
          user_id: string
          was_truncated: boolean
        }
        Insert: {
          byok_user?: boolean
          calling_function?: string
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          fallback_provider?: string | null
          id?: string
          primary_provider?: string
          snapshot_len?: number
          used_provider?: string
          user_id: string
          was_truncated?: boolean
        }
        Update: {
          byok_user?: boolean
          calling_function?: string
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          fallback_provider?: string | null
          id?: string
          primary_provider?: string
          snapshot_len?: number
          used_provider?: string
          user_id?: string
          was_truncated?: boolean
        }
        Relationships: []
      }
      assistant_runs: {
        Row: {
          created_at: string
          id: string
          result_json: Json
          snapshot_json: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          result_json?: Json
          snapshot_json?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          result_json?: Json
          snapshot_json?: Json
          user_id?: string
        }
        Relationships: []
      }
      attachments: {
        Row: {
          created_at: string
          deleted_at: string | null
          entity_id: string
          entity_type: string
          file_name: string
          file_size_bytes: number | null
          file_type: string | null
          file_url: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          entity_id: string
          entity_type: string
          file_name: string
          file_size_bytes?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          entity_id?: string
          entity_type?: string
          file_name?: string
          file_size_bytes?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_name: string
          bank_name: string
          created_at: string
          currency: string
          deleted_at: string | null
          id: string
          last4: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name?: string
          bank_name: string
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          last4?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string
          bank_name?: string
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          last4?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bank_statement_imports: {
        Row: {
          bank_account_id: string
          created_at: string
          deleted_at: string | null
          error_message: string | null
          file_path: string
          file_type: string
          id: string
          imported_at: string
          stats_json: Json
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bank_account_id: string
          created_at?: string
          deleted_at?: string | null
          error_message?: string | null
          file_path: string
          file_type?: string
          id?: string
          imported_at?: string
          stats_json?: Json
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bank_account_id?: string
          created_at?: string
          deleted_at?: string | null
          error_message?: string | null
          file_path?: string
          file_type?: string
          id?: string
          imported_at?: string
          stats_json?: Json
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_imports_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          balance: number | null
          bank_account_id: string
          category: string | null
          created_at: string
          deleted_at: string | null
          description: string
          finance_entry_id: string | null
          fingerprint_hash: string
          id: string
          import_id: string
          merchant: string | null
          reference: string | null
          txn_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          balance?: number | null
          bank_account_id: string
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string
          finance_entry_id?: string | null
          fingerprint_hash: string
          id?: string
          import_id: string
          merchant?: string | null
          reference?: string | null
          txn_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          balance?: number | null
          bank_account_id?: string
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string
          finance_entry_id?: string | null
          fingerprint_hash?: string
          id?: string
          import_id?: string
          merchant?: string | null
          reference?: string | null
          txn_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "bank_statement_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      beta_testers: {
        Row: {
          assisted_ai_expires_at: string | null
          assisted_ai_remaining: number
          assisted_ai_used: number
          cohort_tag: string
          created_at: string
          id: string
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          assisted_ai_expires_at?: string | null
          assisted_ai_remaining?: number
          assisted_ai_used?: number
          cohort_tag?: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          assisted_ai_expires_at?: string | null
          assisted_ai_remaining?: number
          assisted_ai_used?: number
          cohort_tag?: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      business_cases: {
        Row: {
          created_at: string
          customer: string
          deleted_at: string | null
          id: string
          model: string
          offer: string
          problem: string
          project_id: string
          risks_json: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer?: string
          deleted_at?: string | null
          id?: string
          model?: string
          offer?: string
          problem?: string
          project_id: string
          risks_json?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer?: string
          deleted_at?: string | null
          id?: string
          model?: string
          offer?: string
          problem?: string
          project_id?: string
          risks_json?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_cases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          reference_code: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          reference_code?: string | null
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          reference_code?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      compliance_reminders: {
        Row: {
          created_at: string
          deleted_at: string | null
          due_date: string
          id: string
          is_done: boolean
          label: string
          notes: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          due_date: string
          id?: string
          is_done?: boolean
          label: string
          notes?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          due_date?: string
          id?: string
          is_done?: boolean
          label?: string
          notes?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      debts: {
        Row: {
          created_at: string
          deleted_at: string | null
          due_day: number | null
          id: string
          interest_rate: number | null
          lender_name: string
          notes: string | null
          principal: number
          repayment_amount: number | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          due_day?: number | null
          id?: string
          interest_rate?: number | null
          lender_name: string
          notes?: string | null
          principal?: number
          repayment_amount?: number | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          due_day?: number | null
          id?: string
          interest_rate?: number | null
          lender_name?: string
          notes?: string | null
          principal?: number
          repayment_amount?: number | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_accounts: {
        Row: {
          created_at: string
          deleted_at: string | null
          display_name: string | null
          email_address: string
          history_id: string | null
          id: string
          label: string | null
          last_sync_at: string | null
          provider: string
          refresh_token_encrypted: string | null
          scopes: string[] | null
          status: string
          token_encrypted: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          email_address: string
          history_id?: string | null
          id?: string
          label?: string | null
          last_sync_at?: string | null
          provider?: string
          refresh_token_encrypted?: string | null
          scopes?: string[] | null
          status?: string
          token_encrypted?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          email_address?: string
          history_id?: string | null
          id?: string
          label?: string | null
          last_sync_at?: string | null
          provider?: string
          refresh_token_encrypted?: string | null
          scopes?: string[] | null
          status?: string
          token_encrypted?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_extracts: {
        Row: {
          confidence: number
          created_at: string
          deleted_at: string | null
          detected_type: string
          email_id: string
          entities_json: Json
          id: string
          requires_user_confirmation: boolean
          suggested_routes_json: Json
          summary: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          deleted_at?: string | null
          detected_type?: string
          email_id: string
          entities_json?: Json
          id?: string
          requires_user_confirmation?: boolean
          suggested_routes_json?: Json
          summary?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          deleted_at?: string | null
          detected_type?: string
          email_id?: string
          entities_json?: Json
          id?: string
          requires_user_confirmation?: boolean
          suggested_routes_json?: Json
          summary?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_extracts_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      email_inbox_items: {
        Row: {
          account_id: string | null
          created_at: string
          id: string
          last_touched_at: string
          project_id: string | null
          source: string
          source_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          id?: string
          last_touched_at?: string
          project_id?: string | null
          source?: string
          source_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          id?: string
          last_touched_at?: string
          project_id?: string | null
          source?: string
          source_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_inbox_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_inbox_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          account_id: string
          body_preview: string | null
          category: string | null
          cc: string[] | null
          created_at: string
          date: string
          deleted_at: string | null
          followup_due_date: string | null
          gmail_message_id: string | null
          gmail_thread_id: string | null
          has_body: boolean | null
          id: string
          intent: string | null
          internal_date: number | null
          is_archived: boolean
          is_read: boolean
          is_starred: boolean
          label_ids: string[] | null
          labels: string[] | null
          message_id: string
          permalink: string | null
          raw_size: number | null
          recipients: string[] | null
          sender: string
          snippet: string | null
          snoozed_until: string | null
          subject: string
          thread_id: string | null
          updated_at: string
          urgency: string | null
          user_id: string
          waiting_on: boolean
        }
        Insert: {
          account_id: string
          body_preview?: string | null
          category?: string | null
          cc?: string[] | null
          created_at?: string
          date?: string
          deleted_at?: string | null
          followup_due_date?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          has_body?: boolean | null
          id?: string
          intent?: string | null
          internal_date?: number | null
          is_archived?: boolean
          is_read?: boolean
          is_starred?: boolean
          label_ids?: string[] | null
          labels?: string[] | null
          message_id: string
          permalink?: string | null
          raw_size?: number | null
          recipients?: string[] | null
          sender?: string
          snippet?: string | null
          snoozed_until?: string | null
          subject?: string
          thread_id?: string | null
          updated_at?: string
          urgency?: string | null
          user_id: string
          waiting_on?: boolean
        }
        Update: {
          account_id?: string
          body_preview?: string | null
          category?: string | null
          cc?: string[] | null
          created_at?: string
          date?: string
          deleted_at?: string | null
          followup_due_date?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          has_body?: boolean | null
          id?: string
          intent?: string | null
          internal_date?: number | null
          is_archived?: boolean
          is_read?: boolean
          is_starred?: boolean
          label_ids?: string[] | null
          labels?: string[] | null
          message_id?: string
          permalink?: string | null
          raw_size?: number | null
          recipients?: string[] | null
          sender?: string
          snippet?: string | null
          snoozed_until?: string | null
          subject?: string
          thread_id?: string | null
          updated_at?: string
          urgency?: string | null
          user_id?: string
          waiting_on?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_oauth_tokens: {
        Row: {
          access_token: string
          account_id: string
          created_at: string
          id: string
          refresh_token: string
          scopes: string[] | null
          token_expiry: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string
          account_id: string
          created_at?: string
          id?: string
          refresh_token?: string
          scopes?: string[] | null
          token_expiry?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          account_id?: string
          created_at?: string
          id?: string
          refresh_token?: string
          scopes?: string[] | null
          token_expiry?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_oauth_tokens_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_client_links: {
        Row: {
          client_id: string
          created_at: string
          deleted_at: string | null
          entity_id: string
          entity_type: string
          id: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          deleted_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          deleted_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_client_links_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_tags: {
        Row: {
          created_at: string
          deleted_at: string | null
          entity_id: string
          entity_type: string
          id: string
          tag_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          tag_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          tag_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      executive_context: {
        Row: {
          context_key: string
          context_value: string
          created_at: string
          deleted_at: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          context_key: string
          context_value: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          context_key?: string
          context_value?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      extension_pairing_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      extension_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          revoked_at: string | null
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      finance_budget_events: {
        Row: {
          amount: number
          budget_item_id: string
          created_at: string
          deleted_at: string | null
          due_at: string
          id: string
          notes: string | null
          paid_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          budget_item_id: string
          created_at?: string
          deleted_at?: string | null
          due_at: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          budget_item_id?: string
          created_at?: string
          deleted_at?: string | null
          due_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_budget_events_budget_item_id_fkey"
            columns: ["budget_item_id"]
            isOneToOne: false
            referencedRelation: "finance_budget_items"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_budget_items: {
        Row: {
          amount: number
          autopay: boolean
          cadence: string
          category: string | null
          created_at: string
          currency: string
          deleted_at: string | null
          description: string | null
          due_date_custom: string | null
          due_day_of_month: number | null
          due_month_of_year: number | null
          end_date: string | null
          id: string
          name: string
          notify_days_before: number
          start_date: string
          status: string
          type: string
          updated_at: string
          user_id: string
          vendor: string | null
        }
        Insert: {
          amount?: number
          autopay?: boolean
          cadence?: string
          category?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          due_date_custom?: string | null
          due_day_of_month?: number | null
          due_month_of_year?: number | null
          end_date?: string | null
          id?: string
          name: string
          notify_days_before?: number
          start_date?: string
          status?: string
          type?: string
          updated_at?: string
          user_id: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          autopay?: boolean
          cadence?: string
          category?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          due_date_custom?: string | null
          due_day_of_month?: number | null
          due_month_of_year?: number | null
          end_date?: string | null
          id?: string
          name?: string
          notify_days_before?: number
          start_date?: string
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
          vendor?: string | null
        }
        Relationships: []
      }
      finance_entries: {
        Row: {
          amount: number
          category: string
          created_at: string
          deleted_at: string | null
          entry_date: string
          id: string
          notes: string | null
          source: string
          source_email_id: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          deleted_at?: string | null
          entry_date?: string
          id?: string
          notes?: string | null
          source?: string
          source_email_id?: string | null
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          deleted_at?: string | null
          entry_date?: string
          id?: string
          notes?: string | null
          source?: string
          source_email_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      finance_notes: {
        Row: {
          content: string
          created_at: string
          deleted_at: string | null
          id: string
          note_month: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          note_month?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          note_month?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      finance_profiles: {
        Row: {
          bankability: string
          created_at: string
          currency: string
          deleted_at: string | null
          id: string
          payroll_employer: boolean
          provisional_tax: boolean
          role_profile: string
          updated_at: string
          user_id: string
          vat_registered: boolean
        }
        Insert: {
          bankability?: string
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          payroll_employer?: boolean
          provisional_tax?: boolean
          role_profile?: string
          updated_at?: string
          user_id: string
          vat_registered?: boolean
        }
        Update: {
          bankability?: string
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          payroll_employer?: boolean
          provisional_tax?: boolean
          role_profile?: string
          updated_at?: string
          user_id?: string
          vat_registered?: boolean
        }
        Relationships: []
      }
      financial_models: {
        Row: {
          assumptions_json: Json
          cashflow_json: Json
          created_at: string
          currency: string
          deleted_at: string | null
          funding_target_amount: number | null
          id: string
          monthly_costs_json: Json
          pricing_json: Json
          project_id: string
          runway_months: number | null
          startup_costs_json: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          assumptions_json?: Json
          cashflow_json?: Json
          created_at?: string
          currency?: string
          deleted_at?: string | null
          funding_target_amount?: number | null
          id?: string
          monthly_costs_json?: Json
          pricing_json?: Json
          project_id: string
          runway_months?: number | null
          startup_costs_json?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          assumptions_json?: Json
          cashflow_json?: Json
          created_at?: string
          currency?: string
          deleted_at?: string | null
          funding_target_amount?: number | null
          id?: string
          monthly_costs_json?: Json
          pricing_json?: Json
          project_id?: string
          runway_months?: number | null
          startup_costs_json?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_models_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_cache: {
        Row: {
          created_at: string
          eligibility: string | null
          expires_at: string | null
          fetched_at: string
          funding_type: string
          id: string
          org_name: string
          program_name: string
          project_id: string | null
          region: string
          source_name: string | null
          source_url: string
          summary: string
          ticket_size_range: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          eligibility?: string | null
          expires_at?: string | null
          fetched_at?: string
          funding_type?: string
          id?: string
          org_name: string
          program_name: string
          project_id?: string | null
          region?: string
          source_name?: string | null
          source_url: string
          summary?: string
          ticket_size_range?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          eligibility?: string | null
          expires_at?: string | null
          fetched_at?: string
          funding_type?: string
          id?: string
          org_name?: string
          program_name?: string
          project_id?: string | null
          region?: string
          source_name?: string | null
          source_url?: string
          summary?: string
          ticket_size_range?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funding_cache_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_packs: {
        Row: {
          ask_amount: number | null
          created_at: string
          deadline: string | null
          deleted_at: string | null
          id: string
          milestones_json: Json
          project_id: string
          status: string
          updated_at: string
          use_of_funds_json: Json
          user_id: string
        }
        Insert: {
          ask_amount?: number | null
          created_at?: string
          deadline?: string | null
          deleted_at?: string | null
          id?: string
          milestones_json?: Json
          project_id: string
          status?: string
          updated_at?: string
          use_of_funds_json?: Json
          user_id: string
        }
        Update: {
          ask_amount?: number | null
          created_at?: string
          deadline?: string | null
          deleted_at?: string | null
          id?: string
          milestones_json?: Json
          project_id?: string
          status?: string
          updated_at?: string
          use_of_funds_json?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funding_packs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      income_streams: {
        Row: {
          created_at: string
          current_month_income: number
          deleted_at: string | null
          id: string
          label: string
          monthly_target: number
          notes: string | null
          stream_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_month_income?: number
          deleted_at?: string | null
          id?: string
          label?: string
          monthly_target?: number
          notes?: string | null
          stream_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_month_income?: number
          deleted_at?: string | null
          id?: string
          label?: string
          monthly_target?: number
          notes?: string | null
          stream_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invest_alerts: {
        Row: {
          asset_type: string
          created_at: string
          deleted_at: string | null
          enabled: boolean
          id: string
          params: Json
          rule_type: string
          symbol: string
          triggered_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          asset_type?: string
          created_at?: string
          deleted_at?: string | null
          enabled?: boolean
          id?: string
          params?: Json
          rule_type?: string
          symbol: string
          triggered_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          asset_type?: string
          created_at?: string
          deleted_at?: string | null
          enabled?: boolean
          id?: string
          params?: Json
          rule_type?: string
          symbol?: string
          triggered_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invest_manual_holdings: {
        Row: {
          asset_type: string
          avg_cost: number | null
          created_at: string
          currency: string
          deleted_at: string | null
          id: string
          notes: string | null
          qty: number
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          asset_type?: string
          avg_cost?: number | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          qty?: number
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          asset_type?: string
          avg_cost?: number | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          qty?: number
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invest_paper_trades: {
        Row: {
          asset_type: string
          created_at: string
          currency: string
          deleted_at: string | null
          id: string
          notes: string | null
          occurred_at: string
          price_at_time: number
          qty: number
          side: string
          symbol: string
          user_id: string
        }
        Insert: {
          asset_type?: string
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          occurred_at?: string
          price_at_time?: number
          qty?: number
          side?: string
          symbol: string
          user_id: string
        }
        Update: {
          asset_type?: string
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          occurred_at?: string
          price_at_time?: number
          qty?: number
          side?: string
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      invest_watchlist_items: {
        Row: {
          asset_type: string
          created_at: string
          deleted_at: string | null
          id: string
          symbol: string
          user_id: string
          watchlist_id: string
        }
        Insert: {
          asset_type?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          symbol: string
          user_id: string
          watchlist_id: string
        }
        Update: {
          asset_type?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          symbol?: string
          user_id?: string
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invest_watchlist_items_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "invest_watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      invest_watchlists: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invites: {
        Row: {
          cohort: string | null
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          is_used: boolean
          label: string
          max_uses: number
          require_byok: boolean
          token: string
          used_at: string | null
          used_by: string | null
          uses_count: number
        }
        Insert: {
          cohort?: string | null
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          is_used?: boolean
          label?: string
          max_uses?: number
          require_byok?: boolean
          token?: string
          used_at?: string | null
          used_by?: string | null
          uses_count?: number
        }
        Update: {
          cohort?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_used?: boolean
          label?: string
          max_uses?: number
          require_byok?: boolean
          token?: string
          used_at?: string | null
          used_by?: string | null
          uses_count?: number
        }
        Relationships: []
      }
      kb_files: {
        Row: {
          created_at: string
          deleted_at: string | null
          file_size_bytes: number | null
          filename: string | null
          id: string
          provider: string
          provider_container_id: string
          provider_file_id: string
          status: string
          tags: Json | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          file_size_bytes?: number | null
          filename?: string | null
          id?: string
          provider: string
          provider_container_id: string
          provider_file_id: string
          status?: string
          tags?: Json | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          file_size_bytes?: number | null
          filename?: string | null
          id?: string
          provider?: string
          provider_container_id?: string
          provider_file_id?: string
          status?: string
          tags?: Json | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_files_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "kb_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_query_log: {
        Row: {
          created_at: string
          had_pii: boolean | null
          id: string
          pii_counts: Json | null
          provider: string
          query_redacted: string
          tokens_used: number | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          had_pii?: boolean | null
          id?: string
          pii_counts?: Json | null
          provider: string
          query_redacted: string
          tokens_used?: number | null
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          had_pii?: boolean | null
          id?: string
          pii_counts?: Json | null
          provider?: string
          query_redacted?: string
          tokens_used?: number | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_query_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "kb_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_workspaces: {
        Row: {
          created_at: string
          default_provider: string
          deleted_at: string | null
          id: string
          openai_vector_store_id: string | null
          updated_at: string
          user_id: string
          vertex_corpus_resource: string | null
          workspace_id: string
          workspace_type: string
        }
        Insert: {
          created_at?: string
          default_provider?: string
          deleted_at?: string | null
          id?: string
          openai_vector_store_id?: string | null
          updated_at?: string
          user_id: string
          vertex_corpus_resource?: string | null
          workspace_id: string
          workspace_type?: string
        }
        Update: {
          created_at?: string
          default_provider?: string
          deleted_at?: string | null
          id?: string
          openai_vector_store_id?: string | null
          updated_at?: string
          user_id?: string
          vertex_corpus_resource?: string | null
          workspace_id?: string
          workspace_type?: string
        }
        Relationships: []
      }
      market_news_cache: {
        Row: {
          created_at: string
          id: string
          published_at: string
          source: string | null
          summary: string | null
          tags: Json | null
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          published_at?: string
          source?: string | null
          summary?: string | null
          tags?: Json | null
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          published_at?: string
          source?: string | null
          summary?: string | null
          tags?: Json | null
          title?: string
        }
        Relationships: []
      }
      market_prices_cache: {
        Row: {
          asof: string
          asset_type: string
          change_1d: number | null
          change_7d: number | null
          currency: string
          id: string
          price: number
          symbol: string
        }
        Insert: {
          asof?: string
          asset_type?: string
          change_1d?: number | null
          change_7d?: number | null
          currency?: string
          id?: string
          price?: number
          symbol: string
        }
        Update: {
          asof?: string
          asset_type?: string
          change_1d?: number | null
          change_7d?: number | null
          currency?: string
          id?: string
          price?: number
          symbol?: string
        }
        Relationships: []
      }
      meetings: {
        Row: {
          attendees: Json | null
          created_at: string
          deleted_at: string | null
          description: string | null
          end_time: string
          id: string
          location: string | null
          notes: string | null
          project_id: string | null
          start_time: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attendees?: Json | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          end_time: string
          id?: string
          location?: string | null
          notes?: string | null
          project_id?: string | null
          start_time: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attendees?: Json | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          end_time?: string
          id?: string
          location?: string | null
          notes?: string | null
          project_id?: string | null
          start_time?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_rules: {
        Row: {
          category: string
          created_at: string
          deleted_at: string | null
          id: string
          pattern: string
          priority: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          pattern: string
          priority?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          pattern?: string
          priority?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notes_daily: {
        Row: {
          content: string
          created_at: string
          deleted_at: string | null
          id: string
          links_json: Json
          note_date: string
          structure_json: Json
          structured_mode: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          links_json?: Json
          note_date?: string
          structure_json?: Json
          structured_mode?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          links_json?: Json
          note_date?: string
          structure_json?: Json
          structured_mode?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          message: string
          read_at: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          message: string
          read_at?: string | null
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          message?: string
          read_at?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      opportunities: {
        Row: {
          ai_generated: boolean
          created_at: string
          deleted_at: string | null
          difficulty: string
          estimated_value: number | null
          id: string
          notes: string | null
          status: string
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_generated?: boolean
          created_at?: string
          deleted_at?: string | null
          difficulty?: string
          estimated_value?: number | null
          id?: string
          notes?: string | null
          status?: string
          title: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_generated?: boolean
          created_at?: string
          deleted_at?: string | null
          difficulty?: string
          estimated_value?: number | null
          id?: string
          notes?: string | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_accomplishments: {
        Row: {
          category: string
          created_at: string
          details: string | null
          happened_at: string
          id: string
          link_url: string | null
          project_id: string
          title: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          details?: string | null
          happened_at?: string
          id?: string
          link_url?: string | null
          project_id: string
          title: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          details?: string | null
          happened_at?: string
          id?: string
          link_url?: string | null
          project_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_accomplishments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_documents: {
        Row: {
          created_at: string
          deleted_at: string | null
          doc_type: string
          expires_at: string | null
          id: string
          label: string
          project_id: string
          url: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          doc_type?: string
          expires_at?: string | null
          id?: string
          label?: string
          project_id: string
          url: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          doc_type?: string
          expires_at?: string | null
          id?: string
          label?: string
          project_id?: string
          url?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_inbox_items: {
        Row: {
          body: string | null
          created_at: string
          deleted_at: string | null
          id: string
          project_id: string
          source_context_id: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          project_id: string
          source_context_id?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          project_id?: string
          source_context_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_inbox_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_inbox_items_source_context_id_fkey"
            columns: ["source_context_id"]
            isOneToOne: false
            referencedRelation: "source_context"
            referencedColumns: ["id"]
          },
        ]
      }
      project_links: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          label: string
          project_id: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          label?: string
          project_id: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          label?: string
          project_id?: string
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_milestones: {
        Row: {
          created_at: string
          deleted_at: string | null
          due_date: string | null
          evidence_url: string | null
          id: string
          project_id: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          due_date?: string | null
          evidence_url?: string | null
          id?: string
          project_id: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          due_date?: string | null
          evidence_url?: string | null
          id?: string
          project_id?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_notes: {
        Row: {
          content: string
          created_at: string
          deleted_at: string | null
          id: string
          note_date: string
          project_id: string
          structured_json: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          note_date?: string
          project_id: string
          structured_json?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          note_date?: string
          project_id?: string
          structured_json?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_partner_memory: {
        Row: {
          auto_update_enabled: boolean
          business_model: string | null
          created_at: string
          id: string
          key_assumptions: Json | null
          key_risks: Json | null
          last_partner_summary: string | null
          north_star: string | null
          primary_constraint: string | null
          project_id: string
          stage: string
          target_customer: string | null
          updated_at: string
          user_id: string
          weekly_focus: string | null
        }
        Insert: {
          auto_update_enabled?: boolean
          business_model?: string | null
          created_at?: string
          id?: string
          key_assumptions?: Json | null
          key_risks?: Json | null
          last_partner_summary?: string | null
          north_star?: string | null
          primary_constraint?: string | null
          project_id: string
          stage?: string
          target_customer?: string | null
          updated_at?: string
          user_id: string
          weekly_focus?: string | null
        }
        Update: {
          auto_update_enabled?: boolean
          business_model?: string | null
          created_at?: string
          id?: string
          key_assumptions?: Json | null
          key_risks?: Json | null
          last_partner_summary?: string | null
          north_star?: string | null
          primary_constraint?: string | null
          project_id?: string
          stage?: string
          target_customer?: string | null
          updated_at?: string
          user_id?: string
          weekly_focus?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_partner_memory_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_partner_scores: {
        Row: {
          id: string
          last_audit_at: string | null
          last_brief_at: string | null
          momentum_score: number | null
          project_id: string
          risk_level: string | null
          sell_readiness_score: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          last_audit_at?: string | null
          last_brief_at?: string | null
          momentum_score?: number | null
          project_id: string
          risk_level?: string | null
          sell_readiness_score?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          last_audit_at?: string | null
          last_brief_at?: string | null
          momentum_score?: number | null
          project_id?: string
          risk_level?: string | null
          sell_readiness_score?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_partner_scores_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          blocked_by: string | null
          blocked_reason: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          health: string
          id: string
          is_blocked: boolean
          is_pinned: boolean
          name: string
          progress_manual: number
          progress_mode: string
          solution_type: string
          status: string
          tags: string[] | null
          unblock_eta: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          blocked_by?: string | null
          blocked_reason?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          health?: string
          id?: string
          is_blocked?: boolean
          is_pinned?: boolean
          name: string
          progress_manual?: number
          progress_mode?: string
          solution_type?: string
          status?: string
          tags?: string[] | null
          unblock_eta?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          blocked_by?: string | null
          blocked_reason?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          health?: string
          id?: string
          is_blocked?: boolean
          is_pinned?: boolean
          name?: string
          progress_manual?: number
          progress_mode?: string
          solution_type?: string
          status?: string
          tags?: string[] | null
          unblock_eta?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_done: boolean
          project_id: string | null
          reminder_time: string
          task_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_done?: boolean
          project_id?: string | null
          reminder_time: string
          task_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_done?: boolean
          project_id?: string | null
          reminder_time?: string
          task_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      source_context: {
        Row: {
          captured_at: string
          created_at: string
          dedupe_key: string
          domain: string | null
          id: string
          metadata_json: Json
          snippet_text: string | null
          source_title: string | null
          source_type: string
          source_url: string
          user_id: string
        }
        Insert: {
          captured_at?: string
          created_at?: string
          dedupe_key: string
          domain?: string | null
          id?: string
          metadata_json?: Json
          snippet_text?: string | null
          source_title?: string | null
          source_type?: string
          source_url: string
          user_id: string
        }
        Update: {
          captured_at?: string
          created_at?: string
          dedupe_key?: string
          domain?: string | null
          id?: string
          metadata_json?: Json
          snippet_text?: string | null
          source_title?: string | null
          source_type?: string
          source_url?: string
          user_id?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          dedupe_key: string | null
          deleted_at: string | null
          description: string | null
          due_date: string | null
          estimated_minutes: number | null
          id: string
          last_touched_at: string
          note_id: string | null
          order_index: number
          priority: string
          project_id: string | null
          source: string | null
          start_date: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          dedupe_key?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          estimated_minutes?: number | null
          id?: string
          last_touched_at?: string
          note_id?: string | null
          order_index?: number
          priority?: string
          project_id?: string | null
          source?: string | null
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          dedupe_key?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          estimated_minutes?: number | null
          id?: string
          last_touched_at?: string
          note_id?: string | null
          order_index?: number
          priority?: string
          project_id?: string | null
          source?: string | null
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tender_compliance_items: {
        Row: {
          created_at: string
          deleted_at: string | null
          doc_id: string | null
          expires_at: string | null
          id: string
          item_name: string
          required: boolean
          status: string
          tender_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          doc_id?: string | null
          expires_at?: string | null
          id?: string
          item_name: string
          required?: boolean
          status?: string
          tender_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          doc_id?: string | null
          expires_at?: string | null
          id?: string
          item_name?: string
          required?: boolean
          status?: string
          tender_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tender_compliance_items_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      tender_pricing: {
        Row: {
          assumptions_json: Json
          cashflow_impact_json: Json
          created_at: string
          deleted_at: string | null
          id: string
          margin_pct: number | null
          pricing_csv_url: string | null
          tender_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assumptions_json?: Json
          cashflow_impact_json?: Json
          created_at?: string
          deleted_at?: string | null
          id?: string
          margin_pct?: number | null
          pricing_csv_url?: string | null
          tender_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assumptions_json?: Json
          cashflow_impact_json?: Json
          created_at?: string
          deleted_at?: string | null
          id?: string
          margin_pct?: number | null
          pricing_csv_url?: string | null
          tender_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tender_pricing_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      tender_proposals: {
        Row: {
          created_at: string
          deleted_at: string | null
          exec_summary: string
          experience: string
          id: string
          methodology: string
          qa_plan: string
          risk_mitigation: string
          team: string
          tender_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          exec_summary?: string
          experience?: string
          id?: string
          methodology?: string
          qa_plan?: string
          risk_mitigation?: string
          team?: string
          tender_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          exec_summary?: string
          experience?: string
          id?: string
          methodology?: string
          qa_plan?: string
          risk_mitigation?: string
          team?: string
          tender_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tender_proposals_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      tender_requirements: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          mandatory: boolean
          requirement: string
          source_section: string | null
          status: string
          tender_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          mandatory?: boolean
          requirement: string
          source_section?: string | null
          status?: string
          tender_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          mandatory?: boolean
          requirement?: string
          source_section?: string | null
          status?: string
          tender_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tender_requirements_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      tender_submissions: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          method: string
          proof_url: string | null
          submitted_at: string
          tender_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          method?: string
          proof_url?: string | null
          submitted_at?: string
          tender_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          method?: string
          proof_url?: string | null
          submitted_at?: string
          tender_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tender_submissions_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      tenders: {
        Row: {
          briefing_required: boolean
          closing_at: string | null
          contact: string | null
          created_at: string
          deleted_at: string | null
          entity: string
          id: string
          project_id: string
          ref_no: string
          status: string
          submission_method: string
          updated_at: string
          user_id: string
        }
        Insert: {
          briefing_required?: boolean
          closing_at?: string | null
          contact?: string | null
          created_at?: string
          deleted_at?: string | null
          entity?: string
          id?: string
          project_id: string
          ref_no?: string
          status?: string
          submission_method?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          briefing_required?: boolean
          closing_at?: string | null
          contact?: string | null
          created_at?: string
          deleted_at?: string | null
          entity?: string
          id?: string
          project_id?: string
          ref_no?: string
          status?: string
          submission_method?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json
          user_id?: string
        }
        Relationships: []
      }
      user_ai_keys: {
        Row: {
          created_at: string
          gemini_key_encrypted: string | null
          gemini_key_last4: string | null
          id: string
          openai_key_encrypted: string | null
          openai_key_last4: string | null
          updated_at: string
          use_own_keys: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          gemini_key_encrypted?: string | null
          gemini_key_last4?: string | null
          id?: string
          openai_key_encrypted?: string | null
          openai_key_last4?: string | null
          updated_at?: string
          use_own_keys?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          gemini_key_encrypted?: string | null
          gemini_key_last4?: string | null
          id?: string
          openai_key_encrypted?: string | null
          openai_key_last4?: string | null
          updated_at?: string
          use_own_keys?: boolean
          user_id?: string
        }
        Relationships: []
      }
      user_allowed_domains: {
        Row: {
          created_at: string
          domain: string
          enabled: boolean
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          domain: string
          enabled?: boolean
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          domain?: string
          enabled?: boolean
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          preference_key: string
          preference_value: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          preference_key: string
          preference_value?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          preference_key?: string
          preference_value?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      verified_sources: {
        Row: {
          created_at: string
          deleted_at: string | null
          fetched_at: string | null
          id: string
          source_url: string | null
          title: string | null
          type: string | null
          updated_at: string
          user_id: string
          verified: boolean | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          fetched_at?: string | null
          id?: string
          source_url?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string
          user_id: string
          verified?: boolean | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          fetched_at?: string | null
          id?: string
          source_url?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string
          user_id?: string
          verified?: boolean | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verified_sources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "kb_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_tasks_by_priority: {
        Args: { p_limit?: number; p_project_id?: string; p_user_id: string }
        Returns: {
          created_at: string
          due_date: string
          id: string
          last_touched_at: string
          priority: string
          project_id: string
          status: string
          title: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      priority_rank: { Args: { p: string }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
