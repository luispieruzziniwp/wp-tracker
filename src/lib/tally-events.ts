import type { EventType, TallyEventType } from "@/lib/supabase/database.types";

export const TALLY_EVENTS: { type: TallyEventType; label: string }[] = [
  { type: "sales_call", label: "Sales Call" },
  { type: "intro_call", label: "Intro Call" },
  { type: "podcast_scheduled", label: "Podcast Scheduled" },
  { type: "podcast_rescheduled", label: "Podcast Rescheduled" },
  { type: "podcast_canceled", label: "Podcast Canceled" },
  { type: "podcast_recorded", label: "Podcast Recorded" },
];

const ALL_LABELS: Record<EventType, string> = {
  sales_call: "Sales Call",
  intro_call: "Intro Call",
  podcast_scheduled: "Podcast Scheduled",
  podcast_rescheduled: "Podcast Rescheduled",
  podcast_canceled: "Podcast Canceled",
  podcast_recorded: "Podcast Recorded",
  dial: "Dial",
  dial_answered: "Dial Answered",
  appointment_booked: "Appointment Booked",
  appointment_converted: "Appointment Converted",
};

export function labelForEventType(type: EventType): string {
  return ALL_LABELS[type] ?? type;
}

export function startOfTodayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
