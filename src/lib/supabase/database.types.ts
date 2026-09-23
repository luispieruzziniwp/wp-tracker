export type UserRole = "owner" | "ops" | "setter";

export type TallyEventType =
  | "sales_call_scheduled"
  | "sales_call_done"
  | "sales_call_canceled"
  | "intro_call_scheduled"
  | "intro_call_done"
  | "intro_call_canceled"
  | "podcast_scheduled"
  | "podcast_done"
  | "podcast_canceled"
  | "podcast_rescheduled"
  | "verbal_agreement"
  | "paid";

export type SetterEventType =
  | "dial"
  | "dial_answered"
  | "appointment_booked"
  | "appointment_converted";

export type EventType = TallyEventType | SetterEventType;

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          role: UserRole;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          role: UserRole;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          role?: UserRole;
        };
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          user_id: string;
          type: EventType;
          occurred_at: string;
          notes: string | null;
          outcome: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: EventType;
          occurred_at?: string;
          notes?: string | null;
          outcome?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: EventType;
          occurred_at?: string;
          notes?: string | null;
          outcome?: string | null;
        };
        Relationships: [];
      };
      weekly_stats: {
        Row: {
          id: string;
          week_start: string;
          week_end: string;
          connection_requests_sent: number;
          connections_accepted: number;
          leads_replied: number;
          intro_calls_scheduled: number;
          intro_calls_done: number;
          podcast_calls_scheduled: number;
          podcast_interviews_done: number;
          sales_calls_scheduled: number;
          sales_calls_done: number;
          enrollments: number;
          sales_amount: number;
          closed_through_podcast: number;
          used_pc_pitch_to_close: number;
        };
        Insert: {
          id?: string;
          week_start: string;
          week_end: string;
          connection_requests_sent?: number;
          connections_accepted?: number;
          leads_replied?: number;
          intro_calls_scheduled?: number;
          intro_calls_done?: number;
          podcast_calls_scheduled?: number;
          podcast_interviews_done?: number;
          sales_calls_scheduled?: number;
          sales_calls_done?: number;
          enrollments?: number;
          sales_amount?: number;
          closed_through_podcast?: number;
          used_pc_pitch_to_close?: number;
        };
        Update: {
          id?: string;
          week_start?: string;
          week_end?: string;
          connection_requests_sent?: number;
          connections_accepted?: number;
          leads_replied?: number;
          intro_calls_scheduled?: number;
          intro_calls_done?: number;
          podcast_calls_scheduled?: number;
          podcast_interviews_done?: number;
          sales_calls_scheduled?: number;
          sales_calls_done?: number;
          enrollments?: number;
          sales_amount?: number;
          closed_through_podcast?: number;
          used_pc_pitch_to_close?: number;
        };
        Relationships: [];
      };
      dripify_daily: {
        Row: {
          id: string;
          date: string;
          campaign: string;
          outreaches: number;
          messages_sent: number;
          connections_accepted: number;
          replies: number;
          entered_by: string;
        };
        Insert: {
          id?: string;
          date: string;
          campaign: string;
          outreaches: number;
          messages_sent: number;
          connections_accepted: number;
          replies: number;
          entered_by: string;
        };
        Update: {
          id?: string;
          date?: string;
          campaign?: string;
          outreaches?: number;
          messages_sent?: number;
          connections_accepted?: number;
          replies?: number;
          entered_by?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type WeeklyStatsRow = Database["public"]["Tables"]["weekly_stats"]["Row"];
