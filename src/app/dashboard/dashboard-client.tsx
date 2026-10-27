"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/client";
import type { EventSource, EventType, UserRole, WeeklyStatsRow } from "@/lib/supabase/database.types";
import { CHART_AXIS, CHART_COLORS, CHART_GRID } from "@/lib/chart-colors";
import { SOURCES } from "@/lib/sources";
import { formatCurrency, formatRate } from "@/lib/weekly-stats";
import {
  defaultPeriod,
  granularityFor,
  periodFromHash,
  periodToHash,
  previousRange,
  rangeLabel,
  resolvePeriod,
  type Period,
} from "@/lib/dashboard-period";
import {
  buildChartData,
  computeTotals,
  dateKeyOfEvent,
  eventsInRange,
  type DashEvent,
} from "@/lib/dashboard-stats";
import { localDateKey, parseDateKey, shiftDateKey } from "@/lib/tally-dates";
import { PeriodSelector } from "./period-selector";

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: `1px solid ${CHART_GRID}`,
  fontSize: 12,
};

const SOURCE_METRIC_TYPES = new Set<EventType>([
  "sales_call_done",
  "intro_call_done",
  "verbal_agreement",
  "paid",
]);

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function DashboardClient() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [period, setPeriod] = useState<Period | null>(null);
  const [weeklyStatsRows, setWeeklyStatsRows] = useState<WeeklyStatsRow[]>([]);
  const [eventRows, setEventRows] = useState<DashEvent[]>([]);
  const [fetching, setFetching] = useState(false);
  const [sourceTrackingStartedAt, setSourceTrackingStartedAt] = useState<string | null>(null);
  const loadSeqRef = useRef(0);

  // The selected period lives in the URL hash so a view can be bookmarked or
  // shared. Read after mount (the hash isn't available during SSR).
  useEffect(() => {
    const apply = () => {
      const next = periodFromHash(window.location.hash) ?? defaultPeriod();
      setPeriod(next);
      if (window.location.hash !== periodToHash(next)) {
        window.history.replaceState(null, "", periodToHash(next));
      }
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  function changePeriod(next: Period) {
    setPeriod(next);
    window.history.replaceState(null, "", periodToHash(next));
  }

  const loadRole = useCallback(async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    setRole(profile?.role ?? null);
    setLoading(false);
  }, [router, supabase]);

  useEffect(() => {
    loadRole();
  }, [loadRole]);

  const loadStats = useCallback(async () => {
    if (!period) return;
    const seq = ++loadSeqRef.current;
    setFetching(true);

    // Fetch the current period plus the previous one (for the change vs.
    // previous period on each card).
    const cur = resolvePeriod(period);
    const prev = previousRange(period);
    const fetchStart = prev?.start ?? cur.start;
    const endExclusiveISO = parseDateKey(shiftDateKey(cur.end, 1)).toISOString();

    let weeklyStatsQuery = supabase
      .from("weekly_stats")
      .select("*")
      .lte("week_start", cur.end)
      .order("week_start", { ascending: true });
    if (fetchStart) weeklyStatsQuery = weeklyStatsQuery.gte("week_start", fetchStart);

    // PostgREST caps a response at 1000 rows, so page through events.
    const PAGE = 1000;
    const events: DashEvent[] = [];
    let eventsError: string | null = null;
    for (let from = 0; ; from += PAGE) {
      let q = supabase
        .from("events")
        .select("type, occurred_at, source, amount, billing")
        .lt("occurred_at", endExclusiveISO)
        .order("occurred_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (fetchStart) q = q.gte("occurred_at", parseDateKey(fetchStart).toISOString());
      const { data, error } = await q;
      if (error) {
        eventsError = error.message;
        break;
      }
      events.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }

    const weeklyStatsResult = await weeklyStatsQuery;
    if (seq !== loadSeqRef.current) return; // superseded by a newer selection
    setFetching(false);

    if (weeklyStatsResult.error) {
      toast.error(weeklyStatsResult.error.message);
      return;
    }
    if (eventsError) {
      toast.error(eventsError);
      return;
    }

    setWeeklyStatsRows(weeklyStatsResult.data ?? []);
    setEventRows(events);
  }, [period, supabase]);

  useEffect(() => {
    if (role === "owner" || role === "ops") {
      loadStats();
    }
  }, [role, loadStats]);

  // Independent of the period selection — this is an absolute fact about the
  // whole account's history, not something that should change as you filter.
  useEffect(() => {
    if (role !== "owner" && role !== "ops") return;
    supabase
      .from("events")
      .select("occurred_at")
      .not("source", "is", null)
      .order("occurred_at", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setSourceTrackingStartedAt(data?.occurred_at ?? null));
  }, [role, supabase]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const range = useMemo(() => (period ? resolvePeriod(period) : null), [period]);
  const prevRange = useMemo(() => (period ? previousRange(period) : null), [period]);
  const curEvents = useMemo(
    () => (range ? eventsInRange(eventRows, range) : []),
    [eventRows, range],
  );

  const totals = useMemo(
    () => (range ? computeTotals(weeklyStatsRows, eventRows, range) : null),
    [weeklyStatsRows, eventRows, range],
  );
  const prevTotals = useMemo(
    () => (prevRange ? computeTotals(weeklyStatsRows, eventRows, prevRange) : null),
    [weeklyStatsRows, eventRows, prevRange],
  );

  const chartData = useMemo(() => {
    if (!period || !range) return [];
    let start = range.start;
    if (start === null) {
      // All Time starts at the earliest data we have.
      const firstRow = weeklyStatsRows[0]?.week_start;
      const firstEvent = eventRows[0] ? dateKeyOfEvent(eventRows[0]) : undefined;
      start = [firstRow, firstEvent].filter((v): v is string => !!v).sort()[0] ?? localDateKey();
    }
    return buildChartData(weeklyStatsRows, eventRows, range, start, granularityFor(period));
  }, [period, range, weeklyStatsRows, eventRows]);

  const hasData = useMemo(() => {
    if (!range) return false;
    return (
      eventsInRange(eventRows, range).length > 0 ||
      weeklyStatsRows.some(
        (r) => (range.start === null || r.week_start >= range.start) && r.week_start <= range.end,
      )
    );
  }, [range, eventRows, weeklyStatsRows]);

  const isDaily = period ? granularityFor(period) === "day" : false;

  const bySource = useMemo(() => {
    const zero = () => Object.fromEntries(SOURCES.map((s) => [s.key, 0])) as Record<EventSource, number>;
    const introCallsDone = zero();
    const salesCallsDone = zero();
    const verbalAgreements = zero();
    const paid = zero();

    for (const row of curEvents) {
      if (!row.source || !SOURCE_METRIC_TYPES.has(row.type)) continue;
      if (row.type === "intro_call_done") introCallsDone[row.source] += 1;
      else if (row.type === "sales_call_done") salesCallsDone[row.source] += 1;
      else if (row.type === "verbal_agreement") verbalAgreements[row.source] += 1;
      else if (row.type === "paid") paid[row.source] += 1;
    }

    const chartData = [
      { metric: "Sales Calls Done", ...salesCallsDone },
      { metric: "Intro Calls Done", ...introCallsDone },
      { metric: "Paid", ...paid },
    ];

    const rows = SOURCES.map((s) => {
      const sc = salesCallsDone[s.key];
      const p = paid[s.key];
      return {
        source: s.key,
        label: s.label,
        color: s.color,
        introCallsDone: introCallsDone[s.key],
        salesCallsDone: sc,
        verbalAgreements: verbalAgreements[s.key],
        paid: p,
        closeRate: sc > 0 ? p / sc : null,
      };
    });

    return { chartData, rows };
  }, [curEvents]);

  const setterFunnel = useMemo(() => {
    const counts = { dial: 0, dial_answered: 0, appointment_booked: 0, appointment_converted: 0 };
    for (const e of curEvents) {
      if (e.type in counts) counts[e.type as keyof typeof counts] += 1;
    }
    return [
      { stage: "Dial", value: counts.dial },
      { stage: "Answered", value: counts.dial_answered },
      { stage: "Booked", value: counts.appointment_booked },
      { stage: "Converted", value: counts.appointment_converted },
    ];
  }, [curEvents]);

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (role !== "owner" && role !== "ops") {
    return (
      <AppShell role={role} onSignOut={handleSignOut}>
        <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
          <p className="text-sm text-muted-foreground">
            This page isn&apos;t available for your role.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell role={role} onSignOut={handleSignOut}>
      <div className="flex flex-col gap-6">
      <h1 className="font-serif text-2xl tracking-tight">Dashboard</h1>

      {period && (
        <div className="flex flex-col gap-1.5">
          <PeriodSelector period={period} onChange={changePeriod} />
          {prevRange && (
            <p className="text-xs text-muted-foreground">
              Changes compare with {rangeLabel(prevRange)}
            </p>
          )}
        </div>
      )}

      {!period || !totals ? null : !hasData ? (
        <p className="text-sm text-muted-foreground">
          {fetching ? "Loading stats..." : "No stats in this period."}
        </p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Requests Sent" value={totals.connectionRequestsSent} cur={totals.connectionRequestsSent} prev={prevTotals?.connectionRequestsSent} />
            <StatCard label="Connections Accepted" value={totals.connectionsAccepted} cur={totals.connectionsAccepted} prev={prevTotals?.connectionsAccepted} />
            <StatCard label="Leads Replied" value={totals.leadsReplied} cur={totals.leadsReplied} prev={prevTotals?.leadsReplied} />
            <StatCard label="Intro Calls Done" value={totals.introCallsDone} cur={totals.introCallsDone} prev={prevTotals?.introCallsDone} />
            <StatCard label="Podcasts Done" value={totals.podcastsDone} cur={totals.podcastsDone} prev={prevTotals?.podcastsDone} />
            <StatCard label="Sales Calls Done" value={totals.salesCallsDone} cur={totals.salesCallsDone} prev={prevTotals?.salesCallsDone} />
            <StatCard label="Enrollments" value={totals.enrollments} cur={totals.enrollments} prev={prevTotals?.enrollments} />
            <StatCard
              label="Total Sales"
              value={formatCurrency(totals.salesAmount)}
              cur={totals.salesAmount}
              prev={prevTotals?.salesAmount}
              sub={`New MRR ${formatCurrency(totals.newMrr)} · One-time ${formatCurrency(totals.oneTime)}`}
            />
          </section>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <RateCard label="Acceptance Rate" rate={totals.acceptanceRate} prev={prevTotals ? prevTotals.acceptanceRate : undefined} />
            <RateCard label="Reply Rate" rate={totals.replyRate} prev={prevTotals ? prevTotals.replyRate : undefined} />
            <RateCard label="Enrollment Rate" rate={totals.enrollmentRate} prev={prevTotals ? prevTotals.enrollmentRate : undefined} />
          </section>

          {isDaily && (
            <p className="text-xs text-muted-foreground">
              Daily charts show live-tapped events only; historical weekly totals can&apos;t be split by day.
            </p>
          )}

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title="Outreach Funnel">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_GRID} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: CHART_AXIS }} tickLine={false} axisLine={{ stroke: CHART_GRID }} />
                  <YAxis tick={{ fontSize: 12, fill: CHART_AXIS }} tickLine={false} axisLine={false} width={36} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="connection_requests_sent" name="Requests Sent" stroke={CHART_COLORS.teal} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="connections_accepted" name="Accepted" stroke={CHART_COLORS.blue} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="leads_replied" name="Replied" stroke={CHART_COLORS.mist} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Sales Calls: Scheduled vs Done">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_GRID} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: CHART_AXIS }} tickLine={false} axisLine={{ stroke: CHART_GRID }} />
                  <YAxis tick={{ fontSize: 12, fill: CHART_AXIS }} tickLine={false} axisLine={false} width={36} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="sales_calls_scheduled" name="Scheduled" fill={CHART_COLORS.teal} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="sales_calls_done" name="Done" fill={CHART_COLORS.blue} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Podcast: Scheduled vs Done">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_GRID} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: CHART_AXIS }} tickLine={false} axisLine={{ stroke: CHART_GRID }} />
                  <YAxis tick={{ fontSize: 12, fill: CHART_AXIS }} tickLine={false} axisLine={false} width={36} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="podcast_calls_scheduled" name="Scheduled" fill={CHART_COLORS.mist} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="podcast_interviews_done" name="Done" fill={CHART_COLORS.gold} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Enrollments & Sales Amount">
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_GRID} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: CHART_AXIS }} tickLine={false} axisLine={{ stroke: CHART_GRID }} />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 12, fill: CHART_COLORS.blue }}
                    tickLine={false}
                    axisLine={false}
                    width={32}
                    allowDecimals={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 12, fill: CHART_COLORS.blue }}
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    tickFormatter={(v: number) => formatCurrency(v)}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value, name) =>
                      name === "Sales Amount"
                        ? [formatCurrency(Number(value)), name]
                        : [value, name]
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="left" dataKey="enrollments" name="Enrollments" fill={CHART_COLORS.teal} radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="sales_amount" name="Sales Amount" stroke={CHART_COLORS.blue} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
          </section>

          <section className="grid grid-cols-1 gap-4">
            <ChartCard title="Setter Funnel">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={setterFunnel} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_GRID} vertical={false} />
                  <XAxis dataKey="stage" tick={{ fontSize: 12, fill: CHART_AXIS }} tickLine={false} axisLine={{ stroke: CHART_GRID }} />
                  <YAxis tick={{ fontSize: 12, fill: CHART_AXIS }} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="value" name="Count" fill={CHART_COLORS.teal} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </section>

          <section className="grid grid-cols-1 gap-4">
            <ChartCard title="By Source">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={bySource.chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_GRID} vertical={false} />
                  <XAxis dataKey="metric" tick={{ fontSize: 12, fill: CHART_AXIS }} tickLine={false} axisLine={{ stroke: CHART_GRID }} />
                  <YAxis tick={{ fontSize: 12, fill: CHART_AXIS }} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {SOURCES.map((s) => (
                    <Bar key={s.key} dataKey={s.key} name={s.label} stackId="source" fill={s.color} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Source Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">Source</th>
                        <th className="py-2 pr-4 text-right font-medium">Intro Calls Done</th>
                        <th className="py-2 pr-4 text-right font-medium">Sales Calls Done</th>
                        <th className="py-2 pr-4 text-right font-medium">Verbal Agreements</th>
                        <th className="py-2 pr-4 text-right font-medium">Paid</th>
                        <th className="py-2 text-right font-medium">Close Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bySource.rows.map((row) => (
                        <tr key={row.source} className="border-b border-border last:border-0">
                          <td className="py-2 pr-4">
                            <span className="inline-flex items-center gap-2">
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: row.color }}
                                aria-hidden
                              />
                              {row.label}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums">{row.introCallsDone}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{row.salesCallsDone}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{row.verbalAgreements}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{row.paid}</td>
                          <td className="py-2 text-right tabular-nums">{formatRate(row.closeRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {sourceTrackingStartedAt
                    ? `Source tracking started ${formatFullDate(sourceTrackingStartedAt)}`
                    : "Source tracking hasn't started yet."}
                </p>
              </CardContent>
            </Card>
          </section>
        </>
      )}
      </div>
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  cur,
  prev,
  sub,
}: {
  label: string;
  value: number | string;
  cur: number;
  prev?: number | null;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-2xl font-bold tabular-nums">{value}</span>
        {prev !== undefined && prev !== null && <Delta change={percentChange(cur, prev)} />}
        {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
      </CardContent>
    </Card>
  );
}

function RateCard({
  label,
  rate,
  prev,
}: {
  label: string;
  rate: number | null;
  prev?: number | null;
}) {
  // prev is undefined when there is no comparison (All Time); null when the
  // previous period had no denominator.
  const change =
    prev === undefined
      ? undefined
      : rate === null || prev === null
        ? ({ kind: "none" } as const)
        : pointChange(rate, prev);
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="flex flex-col items-end gap-0.5">
          <span className="text-lg font-semibold tabular-nums">{formatRate(rate)}</span>
          {change && <Delta change={change} />}
        </span>
      </CardContent>
    </Card>
  );
}

type Change =
  | { kind: "none" }
  | { kind: "flat" }
  | { kind: "new" }
  | { kind: "up" | "down"; text: string };

function percentChange(cur: number, prev: number): Change {
  if (prev === 0) return cur === 0 ? { kind: "none" } : { kind: "new" };
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 0.05) return { kind: "flat" };
  const abs = Math.abs(pct);
  return { kind: pct > 0 ? "up" : "down", text: `${abs < 10 ? abs.toFixed(1) : Math.round(abs)}%` };
}

function pointChange(cur: number, prev: number): Change {
  const pts = (cur - prev) * 100;
  if (Math.abs(pts) < 0.05) return { kind: "flat" };
  return { kind: pts > 0 ? "up" : "down", text: `${Math.abs(pts).toFixed(1)} pts` };
}

// Every dashboard metric is "higher is better": up is green, down is red.
function Delta({ change }: { change: Change }) {
  if (change.kind === "none") {
    return <span className="text-[11px] text-muted-foreground">— vs prev</span>;
  }
  if (change.kind === "flat") {
    return <span className="text-[11px] text-muted-foreground">0% vs prev</span>;
  }
  if (change.kind === "new") {
    return <span className="text-[11px] font-medium text-positive">▲ new vs prev</span>;
  }
  return (
    <span
      className={`text-[11px] font-medium ${change.kind === "up" ? "text-positive" : "text-negative"}`}
    >
      {change.kind === "up" ? "▲" : "▼"} {change.text} vs prev
    </span>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}
