import type {
  EventType,
  SetterEventType,
  TallyEventType,
} from "@/lib/supabase/database.types";

export type EventTone = "neutral" | "positive" | "negative";

export type TallyEventDef = {
  type: TallyEventType;
  label: string;
  toast: string;
  tone: EventTone;
};

export type SetterEventDef = {
  type: SetterEventType;
  label: string;
  toast: string;
  tone: EventTone;
};

export const TALLY_SECTIONS: { section: string; events: TallyEventDef[] }[] = [
  {
    section: "Sales Calls",
    events: [
      { type: "sales_call_scheduled", label: "Scheduled", toast: "Sales call scheduled ✓", tone: "neutral" },
      { type: "sales_call_done", label: "Done", toast: "Sales call done ✓", tone: "neutral" },
      { type: "sales_call_canceled", label: "Canceled", toast: "Sales call canceled", tone: "negative" },
    ],
  },
  {
    section: "Intro Calls",
    events: [
      { type: "intro_call_scheduled", label: "Scheduled", toast: "Intro call scheduled ✓", tone: "neutral" },
      { type: "intro_call_done", label: "Done", toast: "Intro call done ✓", tone: "neutral" },
      { type: "intro_call_canceled", label: "Canceled", toast: "Intro call canceled", tone: "negative" },
    ],
  },
  {
    section: "Podcast",
    events: [
      { type: "podcast_scheduled", label: "Scheduled", toast: "Podcast scheduled ✓", tone: "neutral" },
      { type: "podcast_done", label: "Done", toast: "Podcast done ✓", tone: "neutral" },
      { type: "podcast_canceled", label: "Canceled", toast: "Podcast canceled", tone: "negative" },
      { type: "podcast_rescheduled", label: "Rescheduled", toast: "Podcast rescheduled", tone: "negative" },
    ],
  },
  {
    section: "Outcomes",
    events: [
      { type: "verbal_agreement", label: "Verbal Agreement", toast: "Verbal agreement ✓", tone: "positive" },
      { type: "paid", label: "Paid", toast: "Paid ✓", tone: "positive" },
    ],
  },
];

export const TALLY_EVENTS: TallyEventDef[] = TALLY_SECTIONS.flatMap((s) => s.events);

export const SETTER_EVENTS: SetterEventDef[] = [
  { type: "dial", label: "Dial", toast: "Dial logged ✓", tone: "neutral" },
  { type: "dial_answered", label: "Dial Answered", toast: "Dial answered ✓", tone: "neutral" },
  { type: "appointment_booked", label: "Appointment Booked", toast: "Appointment booked ✓", tone: "positive" },
  { type: "appointment_converted", label: "Appointment Converted", toast: "Appointment converted ✓", tone: "positive" },
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

export function startOfWeekISO(): string {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
