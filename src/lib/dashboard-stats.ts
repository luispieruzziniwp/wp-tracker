import type { EventBilling, EventSource, EventType, WeeklyStatsRow } from "@/lib/supabase/database.types";
import { localDateKey } from "@/lib/tally-dates";
import { EVENT_TO_WEEKLY_METRIC, safeRate, type WeeklyMetricKey } from "@/lib/weekly-stats";
import {
  bucketKeyOf,
  bucketLabel,
  listBuckets,
  type DateRange,
  type Granularity,
} from "@/lib/dashboard-period";

export type DashEvent = {
  type: EventType;
  occurred_at: string;
  source: EventSource | null;
  amount: number | null;
  billing: EventBilling | null;
};

export interface PeriodTotals {
  connectionRequestsSent: number;
  connectionsAccepted: number;
  leadsReplied: number;
  introCallsDone: number;
  podcastsDone: number;
  salesCallsDone: number;
  enrollments: number;
  salesAmount: number;
  newMrr: number;
  oneTime: number;
  acceptanceRate: number | null;
  replyRate: number | null;
  enrollmentRate: number | null;
}

const CHART_KEYS = [
  "connection_requests_sent",
  "connections_accepted",
  "leads_replied",
  "sales_calls_scheduled",
  "sales_calls_done",
  "podcast_calls_scheduled",
  "podcast_interviews_done",
  "enrollments",
  "sales_amount",
] as const satisfies readonly WeeklyMetricKey[];

export type ChartPoint = { key: string; label: string } & Record<(typeof CHART_KEYS)[number], number>;

export function dateKeyOfEvent(e: { occurred_at: string }): string {
  return localDateKey(new Date(e.occurred_at));
}

function inRange(key: string, range: DateRange): boolean {
  return (range.start === null || key >= range.start) && key <= range.end;
}

export function rowsInRange(rows: WeeklyStatsRow[], range: DateRange): WeeklyStatsRow[] {
  return rows.filter((r) => inRange(r.week_start, range));
}

export function eventsInRange(events: DashEvent[], range: DateRange): DashEvent[] {
  return events.filter((e) => inRange(dateKeyOfEvent(e), range));
}

// weekly_stats rows are assigned to a period by their Monday; live events by
// their own (local) date. The two are additive, never double-counted.
export function computeTotals(
  allRows: WeeklyStatsRow[],
  allEvents: DashEvent[],
  range: DateRange,
): PeriodTotals {
  const rows = rowsInRange(allRows, range);
  const events = eventsInRange(allEvents, range);

  const t = {
    connection_requests_sent: 0,
    connections_accepted: 0,
    leads_replied: 0,
    intro_calls_done: 0,
    podcast_interviews_done: 0,
    sales_calls_done: 0,
    enrollments: 0,
    sales_amount: 0,
  };
  for (const r of rows) {
    t.connection_requests_sent += r.connection_requests_sent;
    t.connections_accepted += r.connections_accepted;
    t.leads_replied += r.leads_replied;
    t.intro_calls_done += r.intro_calls_done;
    t.podcast_interviews_done += r.podcast_interviews_done;
    t.sales_calls_done += r.sales_calls_done;
    t.enrollments += r.enrollments;
    t.sales_amount += r.sales_amount;
  }

  let newMrr = 0;
  let oneTime = 0;
  for (const e of events) {
    const metric = EVENT_TO_WEEKLY_METRIC[e.type];
    if (metric && metric in t) t[metric as keyof typeof t] += 1;
    if (e.type === "paid" && e.amount) {
      const amount = Number(e.amount);
      t.sales_amount += amount;
      if (e.billing === "monthly") newMrr += amount;
      else if (e.billing === "one_time") oneTime += amount;
    }
  }

  return {
    connectionRequestsSent: t.connection_requests_sent,
    connectionsAccepted: t.connections_accepted,
    leadsReplied: t.leads_replied,
    introCallsDone: t.intro_calls_done,
    podcastsDone: t.podcast_interviews_done,
    salesCallsDone: t.sales_calls_done,
    enrollments: t.enrollments,
    salesAmount: t.sales_amount,
    newMrr,
    oneTime,
    acceptanceRate: safeRate(t.connections_accepted, t.connection_requests_sent),
    replyRate: safeRate(t.leads_replied, t.connections_accepted),
    enrollmentRate: safeRate(t.enrollments, t.sales_calls_done),
  };
}

// Continuous series over the range. weekly_stats can't be split by day, so in
// a daily view only live-tapped events contribute.
export function buildChartData(
  allRows: WeeklyStatsRow[],
  allEvents: DashEvent[],
  range: DateRange,
  start: string,
  g: Granularity,
): ChartPoint[] {
  const end = range.end > localDateKey() ? localDateKey() : range.end;
  const points = new Map<string, ChartPoint>();
  for (const key of listBuckets(start, end, g)) {
    const point = { key, label: bucketLabel(key, g) } as ChartPoint;
    for (const k of CHART_KEYS) point[k] = 0;
    points.set(key, point);
  }

  if (g !== "day") {
    for (const r of rowsInRange(allRows, range)) {
      const point = points.get(bucketKeyOf(r.week_start, g));
      if (!point) continue;
      for (const k of CHART_KEYS) point[k] += r[k];
    }
  }

  for (const e of eventsInRange(allEvents, range)) {
    const point = points.get(bucketKeyOf(dateKeyOfEvent(e), g));
    if (!point) continue;
    const metric = EVENT_TO_WEEKLY_METRIC[e.type];
    if (metric && (CHART_KEYS as readonly string[]).includes(metric)) {
      point[metric as (typeof CHART_KEYS)[number]] += 1;
    }
    if (e.type === "paid" && e.amount) point.sales_amount += Number(e.amount);
  }

  return Array.from(points.values());
}
