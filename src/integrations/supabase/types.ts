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
          id: string
          label: string | null
          provider: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          email_address: string
          id?: string
          label?: string | null
          provider?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          email_address?: string
          id?: string
          label?: string | null
          provider?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_messages: {
        Row: {
          account_id: string
          category: string | null
          created_at: string
          date: string
          deleted_at: string | null
          followup_due_date: string | null
          id: string
          intent: string | null
          is_archived: boolean
          is_read: boolean
          is_starred: boolean
          labels: string[] | null
          message_id: string
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
          category?: string | null
          created_at?: string
          date?: string
          deleted_at?: string | null
          followup_due_date?: string | null
          id?: string
          intent?: string | null
          is_archived?: boolean
          is_read?: boolean
          is_starred?: boolean
          labels?: string[] | null
          message_id: string
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
          category?: string | null
          created_at?: string
          date?: string
          deleted_at?: string | null
          followup_due_date?: string | null
          id?: string
          intent?: string | null
          is_archived?: boolean
          is_read?: boolean
          is_starred?: boolean
          labels?: string[] | null
          message_id?: string
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
          start_time?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      reminders: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_done: boolean
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
          reminder_time?: string
          task_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
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
          created_at: string
          deleted_at: string | null
          description: string | null
          due_date: string | null
          estimated_minutes: number | null
          id: string
          priority: string
          source: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          estimated_minutes?: number | null
          id?: string
          priority?: string
          source?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          estimated_minutes?: number | null
          id?: string
          priority?: string
          source?: string | null
          status?: string
          title?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
