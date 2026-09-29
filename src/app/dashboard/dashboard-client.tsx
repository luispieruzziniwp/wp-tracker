"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/client";
import type { EventSource, EventType, UserRole, WeeklyStatsRow } from "@/lib/supabase/database.types";
import { CHART_AXIS, CHART_COLORS, CHART_GRID } from "@/lib/chart-colors";
import { SOURCES } from "@/lib/sources";
import {
  RANGE_OPTIONS,
  RangeOption,
  formatCurrency,
  formatRate,
  formatWeekLabel,
  mergeWeeklyData,
  rangeStartDate,
  safeRate,
  sum,
} from "@/lib/weekly-stats";

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: `1px solid ${CHART_GRID}`,
  fontSize: 12,
};

// Extends the shape mergeWeeklyData() reads (type, occurred_at) with the new
// source column, used only for the "By source" section below — the history
// merge itself is untouched and never reads this extra field.
type SourceEvent = { type: EventType; occurred_at: string; source: EventSource | null };

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
  const [range, setRange] = useState<RangeOption>("month");
  const [weeklyStatsRows, setWeeklyStatsRows] = useState<WeeklyStatsRow[]>([]);
  const [eventRows, setEventRows] = useState<SourceEvent[]>([]);
  const [fetching, setFetching] = useState(false);
  const [sourceTrackingStartedAt, setSourceTrackingStartedAt] = useState<string | null>(null);

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
    setFetching(true);

    const start = rangeStartDate(range);

    let weeklyStatsQuery = supabase
      .from("weekly_stats")
      .select("*")
      .order("week_start", { ascending: true });
    if (start) {
      weeklyStatsQuery = weeklyStatsQuery.gte("week_start", start);
    }

    let eventsQuery = supabase
      .from("events")
      .select("type, occurred_at, source")
      .order("occurred_at", { ascending: true });
    if (start) {
      eventsQuery = eventsQuery.gte("occurred_at", start);
    }

    const [weeklyStatsResult, eventsResult] = await Promise.all([
      weeklyStatsQuery,
      eventsQuery,
    ]);
    setFetching(false);

    if (weeklyStatsResult.error) {
      toast.error(weeklyStatsResult.error.message);
      return;
    }
    if (eventsResult.error) {
      toast.error(eventsResult.error.message);
      return;
    }

    setWeeklyStatsRows(weeklyStatsResult.data ?? []);
    setEventRows(eventsResult.data ?? []);
  }, [range, supabase]);

  useEffect(() => {
    if (role === "owner" || role === "ops") {
      loadStats();
    }
  }, [role, loadStats]);

  // Independent of the range toggle — this is an absolute fact about the
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

  const combined = useMemo(
    () => mergeWeeklyData(weeklyStatsRows, eventRows, rangeStartDate(range)),
    [weeklyStatsRows, eventRows, range],
  );
  const weeks = combined.weeks;

  const totals = useMemo(() => {
    const connectionRequestsSent = sum(weeks.map((w) => w.connection_requests_sent));
    const connectionsAccepted = sum(weeks.map((w) => w.connections_accepted));
    const leadsReplied = sum(weeks.map((w) => w.leads_replied));
    const introCallsDone = sum(weeks.map((w) => w.intro_calls_done));
    const podcastsDone = sum(weeks.map((w) => w.podcast_interviews_done));
    const salesCallsDone = sum(weeks.map((w) => w.sales_calls_done));
    const enrollments = sum(weeks.map((w) => w.enrollments));
    const salesAmount = sum(weeks.map((w) => w.sales_amount));

    return {
      connectionRequestsSent,
      connectionsAccepted,
      leadsReplied,
      introCallsDone,
      podcastsDone,
      salesCallsDone,
      enrollments,
      salesAmount,
      acceptanceRate: safeRate(connectionsAccepted, connectionRequestsSent),
      replyRate: safeRate(leadsReplied, connectionsAccepted),
      enrollmentRate: safeRate(enrollments, salesCallsDone),
    };
  }, [weeks]);

  const chartData = useMemo(
    () =>
      weeks.map((w) => ({
        week: formatWeekLabel(w.week_start),
        connection_requests_sent: w.connection_requests_sent,
        connections_accepted: w.connections_accepted,
        leads_replied: w.leads_replied,
        sales_calls_scheduled: w.sales_calls_scheduled,
        sales_calls_done: w.sales_calls_done,
        podcast_calls_scheduled: w.podcast_calls_scheduled,
        podcast_interviews_done: w.podcast_interviews_done,
        enrollments: w.enrollments,
        sales_amount: w.sales_amount,
      })),
    [weeks],
  );

  const bySource = useMemo(() => {
    const zero = () => Object.fromEntries(SOURCES.map((s) => [s.key, 0])) as Record<EventSource, number>;
    const introCallsDone = zero();
    const salesCallsDone = zero();
    const verbalAgreements = zero();
    const paid = zero();

    for (const row of eventRows) {
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
  }, [eventRows]);

  const setterFunnel = useMemo(() => {
    const totals = { dial: 0, dial_answered: 0, appointment_booked: 0, appointment_converted: 0 };
    for (const counts of Object.values(combined.extraSeries)) {
      totals.dial += counts.dial ?? 0;
      totals.dial_answered += counts.dial_answered ?? 0;
      totals.appointment_booked += counts.appointment_booked ?? 0;
      totals.appointment_converted += counts.appointment_converted ?? 0;
    }
    return [
      { stage: "Dial", value: totals.dial },
      { stage: "Answered", value: totals.dial_answered },
      { stage: "Booked", value: totals.appointment_booked },
      { stage: "Converted", value: totals.appointment_converted },
    ];
  }, [combined.extraSeries]);

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

      <div className="flex flex-wrap gap-2">
        {RANGE_OPTIONS.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant={range === option.value ? "default" : "outline"}
            onClick={() => setRange(option.value)}
            disabled={fetching}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {weeks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {fetching ? "Loading stats..." : "No weekly stats in this range."}
        </p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Requests Sent" value={totals.connectionRequestsSent} />
            <StatCard label="Connections Accepted" value={totals.connectionsAccepted} />
            <StatCard label="Leads Replied" value={totals.leadsReplied} />
            <StatCard label="Intro Calls Done" value={totals.introCallsDone} />
            <StatCard label="Podcasts Done" value={totals.podcastsDone} />
            <StatCard label="Sales Calls Done" value={totals.salesCallsDone} />
            <StatCard label="Enrollments" value={totals.enrollments} />
            <StatCard label="Total Sales" value={formatCurrency(totals.salesAmount)} />
          </section>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <RateCard label="Acceptance Rate" rate={totals.acceptanceRate} />
            <RateCard label="Reply Rate" rate={totals.replyRate} />
            <RateCard label="Enrollment Rate" rate={totals.enrollmentRate} />
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title="Outreach Funnel">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_GRID} vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 12, fill: CHART_AXIS }} tickLine={false} axisLine={{ stroke: CHART_GRID }} />
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
                  <XAxis dataKey="week" tick={{ fontSize: 12, fill: CHART_AXIS }} tickLine={false} axisLine={{ stroke: CHART_GRID }} />
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
                  <XAxis dataKey="week" tick={{ fontSize: 12, fill: CHART_AXIS }} tickLine={false} axisLine={{ stroke: CHART_GRID }} />
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
                  <XAxis dataKey="week" tick={{ fontSize: 12, fill: CHART_AXIS }} tickLine={false} axisLine={{ stroke: CHART_GRID }} />
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

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-2xl font-bold tabular-nums">{value}</span>
      </CardContent>
    </Card>
  );
}

function RateCard({ label, rate }: { label: string; rate: number | null }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-lg font-semibold tabular-nums">{formatRate(rate)}</span>
      </CardContent>
    </Card>
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
