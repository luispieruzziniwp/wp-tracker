import type { EventType, WeeklyStatsRow } from "@/lib/supabase/database.types";

export type RangeOption = "month" | "quarter" | "year" | "all";

export const RANGE_OPTIONS: { value: RangeOption; label: string }[] = [
  { value: "month", label: "This Month" },
  { value: "quarter", label: "This Quarter" },
  { value: "year", label: "This Year" },
  { value: "all", label: "All Time" },
];

// Returns an ISO date (YYYY-MM-DD) lower bound for week_start, or null for "all".
export function rangeStartDate(range: RangeOption): string | null {
  const now = new Date();

  if (range === "month") {
    return toISODate(new Date(now.getFullYear(), now.getMonth(), 1));
  }

  if (range === "quarter") {
    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
    return toISODate(new Date(now.getFullYear(), quarterMonth, 1));
  }

  if (range === "year") {
    return toISODate(new Date(now.getFullYear(), 0, 1));
  }

  return null;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function formatWeekLabel(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

// Guards against divide-by-zero; returns null when the denominator is 0.
export function safeRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

export function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Monday date (YYYY-MM-DD, local calendar) of the week containing the given
// date or timestamp — matches weekly_stats.week_start's convention.
export function mondayOf(dateInput: string | Date): string {
  const d = new Date(dateInput);
  const day = d.getDay(); // 0 = Sunday .. 6 = Saturday
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  return formatDateLocal(monday);
}

function weekEndOf(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00`);
  d.setDate(d.getDate() + 6);
  return formatDateLocal(d);
}

export type WeeklyMetricKey =
  | "connection_requests_sent"
  | "connections_accepted"
  | "leads_replied"
  | "intro_calls_scheduled"
  | "intro_calls_done"
  | "podcast_calls_scheduled"
  | "podcast_interviews_done"
  | "sales_calls_scheduled"
  | "sales_calls_done"
  | "enrollments"
  | "sales_amount"
  | "closed_through_podcast"
  | "used_pc_pitch_to_close";

const ZERO_METRICS: Record<WeeklyMetricKey, number> = {
  connection_requests_sent: 0,
  connections_accepted: 0,
  leads_replied: 0,
  intro_calls_scheduled: 0,
  intro_calls_done: 0,
  podcast_calls_scheduled: 0,
  podcast_interviews_done: 0,
  sales_calls_scheduled: 0,
  sales_calls_done: 0,
  enrollments: 0,
  sales_amount: 0,
  closed_through_podcast: 0,
  used_pc_pitch_to_close: 0,
};

// Live-tap event types that roll up into an existing weekly_stats column.
export const EVENT_TO_WEEKLY_METRIC: Partial<Record<EventType, WeeklyMetricKey>> = {
  sales_call_scheduled: "sales_calls_scheduled",
  sales_call_done: "sales_calls_done",
  intro_call_scheduled: "intro_calls_scheduled",
  intro_call_done: "intro_calls_done",
  podcast_scheduled: "podcast_calls_scheduled",
  podcast_done: "podcast_interviews_done",
  paid: "enrollments",
};

// Live-tap event types with no weekly_stats column — tracked as their own
// weekly series, populated only from taps.
export const EXTRA_EVENT_SERIES: EventType[] = [
  "sales_call_canceled",
  "intro_call_canceled",
  "podcast_canceled",
  "podcast_rescheduled",
  "verbal_agreement",
  "dial",
  "dial_answered",
  "appointment_booked",
  "appointment_converted",
];

export interface CombinedWeek extends Record<WeeklyMetricKey, number> {
  week_start: string;
  week_end: string;
}

export interface WeeklyEvent {
  type: EventType;
  occurred_at: string;
}

// Merges historical weekly_stats rows with live tally/setter taps into one
// per-week series, additive per week (weekly_stats + mapped event counts),
// never double-counted or overwritten. Extra event types with no
// weekly_stats column come back as their own per-week series.
export function mergeWeeklyData(
  weeklyStatsRows: WeeklyStatsRow[],
  events: WeeklyEvent[],
  rangeStart: string | null,
): { weeks: CombinedWeek[]; extraSeries: Record<string, Partial<Record<EventType, number>>> } {
  const weeksMap = new Map<string, CombinedWeek>();

  for (const row of weeklyStatsRows) {
    weeksMap.set(row.week_start, {
      ...ZERO_METRICS,
      connection_requests_sent: row.connection_requests_sent,
      connections_accepted: row.connections_accepted,
      leads_replied: row.leads_replied,
      intro_calls_scheduled: row.intro_calls_scheduled,
      intro_calls_done: row.intro_calls_done,
      podcast_calls_scheduled: row.podcast_calls_scheduled,
      podcast_interviews_done: row.podcast_interviews_done,
      sales_calls_scheduled: row.sales_calls_scheduled,
      sales_calls_done: row.sales_calls_done,
      enrollments: row.enrollments,
      sales_amount: row.sales_amount,
      closed_through_podcast: row.closed_through_podcast,
      used_pc_pitch_to_close: row.used_pc_pitch_to_close,
      week_start: row.week_start,
      week_end: row.week_end,
    });
  }

  const extraSeries: Record<string, Partial<Record<EventType, number>>> = {};

  function weekFor(weekStart: string): CombinedWeek {
    let week = weeksMap.get(weekStart);
    if (!week) {
      week = { ...ZERO_METRICS, week_start: weekStart, week_end: weekEndOf(weekStart) };
      weeksMap.set(weekStart, week);
    }
    return week;
  }

  for (const event of events) {
    const weekStart = mondayOf(event.occurred_at);

    const metricKey = EVENT_TO_WEEKLY_METRIC[event.type];
    if (metricKey) {
      weekFor(weekStart)[metricKey] += 1;
      continue;
    }

    if (EXTRA_EVENT_SERIES.includes(event.type)) {
      weekFor(weekStart);
      const bucket = extraSeries[weekStart] ?? (extraSeries[weekStart] = {});
      bucket[event.type] = (bucket[event.type] ?? 0) + 1;
    }
  }

  let weeks = Array.from(weeksMap.values()).sort((a, b) =>
    a.week_start.localeCompare(b.week_start),
  );

  if (rangeStart) {
    weeks = weeks.filter((w) => w.week_start >= rangeStart);
  }

  const includedWeeks = new Set(weeks.map((w) => w.week_start));
  const filteredExtraSeries: Record<string, Partial<Record<EventType, number>>> = {};
  for (const [weekStart, counts] of Object.entries(extraSeries)) {
    if (includedWeeks.has(weekStart)) filteredExtraSeries[weekStart] = counts;
  }

  return { weeks, extraSeries: filteredExtraSeries };
}
