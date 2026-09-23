import type {
  EventType,
  SetterEventType,
  TallyEventType,
} from "@/lib/supabase/database.types";

export const TALLY_SECTIONS: {
  section: string;
  events: { type: TallyEventType; label: string }[];
}[] = [
  {
    section: "Sales Calls",
    events: [
      { type: "sales_call_scheduled", label: "Scheduled" },
      { type: "sales_call_done", label: "Done" },
      { type: "sales_call_canceled", label: "Canceled" },
    ],
  },
  {
    section: "Intro Calls",
    events: [
      { type: "intro_call_scheduled", label: "Scheduled" },
      { type: "intro_call_done", label: "Done" },
      { type: "intro_call_canceled", label: "Canceled" },
    ],
  },
  {
    section: "Podcast",
    events: [
      { type: "podcast_scheduled", label: "Scheduled" },
      { type: "podcast_done", label: "Done" },
      { type: "podcast_canceled", label: "Canceled" },
      { type: "podcast_rescheduled", label: "Rescheduled" },
    ],
  },
  {
    section: "Outcomes",
    events: [
      { type: "verbal_agreement", label: "Verbal Agreement" },
      { type: "paid", label: "Paid" },
    ],
  },
];

export const TALLY_EVENTS: { type: TallyEventType; label: string }[] =
  TALLY_SECTIONS.flatMap((s) => s.events);

export const SETTER_EVENTS: { type: SetterEventType; label: string }[] = [
  { type: "dial", label: "Dial" },
  { type: "dial_answered", label: "Dial Answered" },
  { type: "appointment_booked", label: "Appointment Booked" },
  { type: "appointment_converted", label: "Appointment Converted" },
];

const ALL_LABELS: Record<EventType, string> = {
  sales_call_scheduled: "Sales Call Scheduled",
  sales_call_done: "Sales Call Done",
  sales_call_canceled: "Sales Call Canceled",
  intro_call_scheduled: "Intro Call Scheduled",
  intro_call_done: "Intro Call Done",
  intro_call_canceled: "Intro Call Canceled",
  podcast_scheduled: "Podcast Scheduled",
  podcast_done: "Podcast Done",
  podcast_canceled: "Podcast Canceled",
  podcast_rescheduled: "Podcast Rescheduled",
  verbal_agreement: "Verbal Agreement",
  paid: "Paid",
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
