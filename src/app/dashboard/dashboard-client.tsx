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
import { NavLinks } from "@/components/nav-links";
import { createClient } from "@/lib/supabase/client";
import type { UserRole, WeeklyStatsRow } from "@/lib/supabase/database.types";
import { CHART_AXIS, CHART_COLORS, CHART_GRID } from "@/lib/chart-colors";
import {
  RANGE_OPTIONS,
  RangeOption,
  formatCurrency,
  formatRate,
  formatWeekLabel,
  rangeStartDate,
  safeRate,
  sum,
} from "@/lib/weekly-stats";

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: `1px solid ${CHART_GRID}`,
  fontSize: 12,
};

export default function DashboardClient() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [range, setRange] = useState<RangeOption>("month");
  const [rows, setRows] = useState<WeeklyStatsRow[]>([]);
  const [fetching, setFetching] = useState(false);

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

    let query = supabase
      .from("weekly_stats")
      .select("*")
      .order("week_start", { ascending: true });

    const start = rangeStartDate(range);
    if (start) {
      query = query.gte("week_start", start);
    }

    const { data, error } = await query;
    setFetching(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setRows(data ?? []);
  }, [range, supabase]);

  useEffect(() => {
    if (role === "owner" || role === "ops") {
      loadStats();
    }
  }, [role, loadStats]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const totals = useMemo(() => {
    const connectionRequestsSent = sum(rows.map((r) => r.connection_requests_sent));
    const connectionsAccepted = sum(rows.map((r) => r.connections_accepted));
    const leadsReplied = sum(rows.map((r) => r.leads_replied));
    const introCallsDone = sum(rows.map((r) => r.intro_calls_done));
    const podcastsDone = sum(rows.map((r) => r.podcast_interviews_done));
    const salesCallsDone = sum(rows.map((r) => r.sales_calls_done));
    const enrollments = sum(rows.map((r) => r.enrollments));
    const salesAmount = sum(rows.map((r) => r.sales_amount));

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
  }, [rows]);

  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        week: formatWeekLabel(r.week_start),
        connection_requests_sent: r.connection_requests_sent,
        connections_accepted: r.connections_accepted,
        leads_replied: r.leads_replied,
        sales_calls_scheduled: r.sales_calls_scheduled,
        sales_calls_done: r.sales_calls_done,
        podcast_calls_scheduled: r.podcast_calls_scheduled,
        podcast_interviews_done: r.podcast_interviews_done,
        enrollments: r.enrollments,
        sales_amount: r.sales_amount,
      })),
    [rows],
  );

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (role !== "owner" && role !== "ops") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-sm text-muted-foreground">
          This page isn&apos;t available for your role.
        </p>
        <Button variant="outline" onClick={handleSignOut}>
          Sign out
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Dashboard</h1>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
        <NavLinks role={role} />
      </header>

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

      {rows.length === 0 ? (
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
                  <Line type="monotone" dataKey="connection_requests_sent" name="Requests Sent" stroke={CHART_COLORS.blue} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="connections_accepted" name="Accepted" stroke={CHART_COLORS.orange} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="leads_replied" name="Replied" stroke={CHART_COLORS.aqua} strokeWidth={2} dot={false} />
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
                  <Bar dataKey="sales_calls_scheduled" name="Scheduled" fill={CHART_COLORS.blue} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="sales_calls_done" name="Done" fill={CHART_COLORS.orange} radius={[4, 4, 0, 0]} />
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
                  <Bar dataKey="podcast_calls_scheduled" name="Scheduled" fill={CHART_COLORS.aqua} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="podcast_interviews_done" name="Done" fill={CHART_COLORS.yellow} radius={[4, 4, 0, 0]} />
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
                    tick={{ fontSize: 12, fill: CHART_COLORS.orange }}
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
                  <Bar yAxisId="left" dataKey="enrollments" name="Enrollments" fill={CHART_COLORS.blue} radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="sales_amount" name="Sales Amount" stroke={CHART_COLORS.orange} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
          </section>
        </>
      )}
    </main>
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
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}
