export type UserRole = "owner" | "ops" | "setter";

export type TallyEventType =
  | "sales_call"
  | "intro_call"
  | "podcast_scheduled"
  | "podcast_rescheduled"
  | "podcast_canceled"
  | "podcast_recorded";

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
