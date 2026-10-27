"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Calendar,
  CalendarCheck,
  DollarSign,
  Handshake,
  Mic,
  Phone,
  PhoneCall,
  RefreshCw,
  Undo2,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShell } from "@/components/app-shell";
import { homeForRole } from "@/components/nav-links";
import { OwnerOpsTallyView } from "./owner-ops-tally-view";
import { EventLogCard, firstName, type LogEvent } from "./event-log";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { EventBilling, EventSource, EventType, UserRole } from "@/lib/supabase/database.types";
import {
  SETTER_EVENTS,
  type EventTone,
  labelForEventType,
  startOfWeekISO,
} from "@/lib/tally-events";
import { dayBoundsISO, localDateKey, noonISO } from "@/lib/tally-dates";

export type PaidExtra = { amount: number; billing: EventBilling };

type Counts = Record<EventType, number>;

const EMPTY_COUNTS: Counts = {
  sales_call_scheduled: 0,
  sales_call_done: 0,
  sales_call_canceled: 0,
  intro_call_scheduled: 0,
  intro_call_done: 0,
  intro_call_canceled: 0,
  podcast_scheduled: 0,
  podcast_done: 0,
  podcast_canceled: 0,
  podcast_rescheduled: 0,
  verbal_agreement: 0,
  paid: 0,
  dial: 0,
  dial_answered: 0,
  appointment_booked: 0,
  appointment_converted: 0,
};

const TYPE_ICON: Record<EventType, typeof Calendar> = {
  sales_call_scheduled: Calendar,
  sales_call_done: CalendarCheck,
  sales_call_canceled: XCircle,
  intro_call_scheduled: Calendar,
  intro_call_done: CalendarCheck,
  intro_call_canceled: XCircle,
  podcast_scheduled: Mic,
  podcast_done: CalendarCheck,
  podcast_canceled: XCircle,
  podcast_rescheduled: RefreshCw,
  verbal_agreement: Handshake,
  paid: DollarSign,
  dial: Phone,
  dial_answered: PhoneCall,
  appointment_booked: CalendarCheck,
  appointment_converted: Handshake,
};

const TONE_CLASSES: Record<EventTone, string> = {
  neutral: "border-border bg-card hover:bg-accent text-foreground",
  positive: "border-positive/30 bg-positive/10 text-positive hover:bg-positive/15",
  negative: "border-negative/30 bg-negative/10 text-negative hover:bg-negative/15",
};

export default function TallyClient({ view }: { view: "tally" | "setter" }) {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [weekCounts, setWeekCounts] = useState<Counts>(EMPTY_COUNTS);
  const [pendingType, setPendingType] = useState<EventType | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [todayEvents, setTodayEvents] = useState<LogEvent[]>([]);
  const [pillMessage, setPillMessage] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => localDateKey());
  const loadSeqRef = useRef(0);
  const pillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pillTimerRef.current) clearTimeout(pillTimerRef.current);
    };
  }, []);

  const loadData = useCallback(async () => {
    const seq = ++loadSeqRef.current;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, role")
      .eq("id", user.id)
      .maybeSingle();

    const nextRole = profile?.role ?? null;
    if (nextRole === "setter" && view !== "setter") {
      router.replace(homeForRole(nextRole));
      return;
    }
    setRole(nextRole);
    setDisplayName(profile?.display_name ?? null);
    setUserId(user.id);

    if (profile?.role === "owner" || profile?.role === "ops" || profile?.role === "setter") {
      const weekStart = startOfWeekISO();
      const { start: dayStart, end: dayEnd } = dayBoundsISO(selectedDate);
      const canSeeAll = nextRole === "owner" || nextRole === "ops";
      let eventsQuery = supabase
        .from("events")
        .select("id, user_id, type, occurred_at, source, amount, billing")
        .gte("occurred_at", dayStart < weekStart ? dayStart : weekStart)
        .order("occurred_at", { ascending: false });
      if (!canSeeAll) eventsQuery = eventsQuery.eq("user_id", user.id);
      const { data: events } = await eventsQuery;

      // Who logged each entry (first name). Own entries use the profile we
      // already have; others come from profiles when readable.
      const nameById = new Map<string, string | null>([[user.id, firstName(profile?.display_name)]]);
      const otherIds = Array.from(
        new Set((events ?? []).map((row) => row.user_id).filter((id) => id !== user.id)),
      );
      if (otherIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", otherIds);
        for (const pr of profiles ?? []) nameById.set(pr.id, firstName(pr.display_name));
      }

      // A newer date selection superseded this load; drop the stale result.
      if (seq !== loadSeqRef.current) return;

      const nextToday = { ...EMPTY_COUNTS };
      const nextWeek = { ...EMPTY_COUNTS };
      const nextTodayEvents: LogEvent[] = [];
      for (const row of events ?? []) {
        if (!(row.type in nextWeek)) continue;
        // Counts (matrix, This week) stay your own taps; the log shows everyone's.
        const own = row.user_id === user.id;
        if (own && row.occurred_at >= weekStart) nextWeek[row.type as EventType] += 1;
        if (row.occurred_at >= dayStart && row.occurred_at < dayEnd) {
          if (own) nextToday[row.type as EventType] += 1;
          nextTodayEvents.push({
            id: row.id,
            user_id: row.user_id,
            type: row.type as EventType,
            occurred_at: row.occurred_at,
            source: row.source,
            amount: row.amount === null ? null : Number(row.amount),
            billing: row.billing,
            logged_by: nameById.get(row.user_id) ?? null,
          });
        }
      }
      setCounts(nextToday);
      setWeekCounts(nextWeek);
      setTodayEvents(nextTodayEvents);
      setLastEventId(nextTodayEvents.find((ev) => ev.user_id === user.id)?.id ?? null);
    }

    setLoading(false);
  }, [router, supabase, view, selectedDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function showToast(message: string) {
    if (view === "setter") {
      toast.success(message);
      return;
    }
    setPillMessage(message);
    if (pillTimerRef.current) clearTimeout(pillTimerRef.current);
    pillTimerRef.current = setTimeout(() => setPillMessage(null), 1400);
  }

  async function handleTap(
    type: EventType,
    toastText: string,
    source: EventSource | null = null,
    paid: PaidExtra | null = null,
  ) {
    setPendingType(type);

    const isToday = selectedDate === localDateKey();
    const occurredAt = isToday ? new Date().toISOString() : noonISO(selectedDate);
    const inWeek = occurredAt >= startOfWeekISO();

    // Optimistic update — reflect the tap instantly, roll back on failure.
    setCounts((c) => ({ ...c, [type]: c[type] + 1 }));
    if (inWeek) setWeekCounts((c) => ({ ...c, [type]: c[type] + 1 }));

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const { data, error } = await supabase
      .from("events")
      .insert({
        user_id: user.id,
        type,
        source,
        occurred_at: occurredAt,
        amount: paid?.amount ?? null,
        billing: paid?.billing ?? null,
      })
      .select("id")
      .single();

    setPendingType(null);

    if (error) {
      setCounts((c) => ({ ...c, [type]: Math.max(0, c[type] - 1) }));
      if (inWeek) setWeekCounts((c) => ({ ...c, [type]: Math.max(0, c[type] - 1) }));
      toast.error(error.message);
      return;
    }

    if (data?.id) {
      setLastEventId(data.id);
      setTodayEvents((list) =>
        [
          {
            id: data.id,
            user_id: user.id,
            type,
            occurred_at: occurredAt,
            source,
            amount: paid?.amount ?? null,
            billing: paid?.billing ?? null,
            logged_by: firstName(displayName),
          },
          ...list,
        ].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)),
      );
    }
    showToast(toastText);
  }

  async function handleUndo() {
    setUndoing(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const { start: dayStart, end: dayEnd } = dayBoundsISO(selectedDate);
    const { data: last, error: fetchError } = await supabase
      .from("events")
      .select("id, type, occurred_at")
      .eq("user_id", user.id)
      .gte("occurred_at", dayStart)
      .lt("occurred_at", dayEnd)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      toast.error(fetchError.message);
      setUndoing(false);
      return;
    }

    if (!last) {
      toast("Nothing to undo");
      setUndoing(false);
      return;
    }

    const { error: deleteError } = await supabase
      .from("events")
      .delete()
      .eq("id", last.id);

    setUndoing(false);

    if (deleteError) {
      toast.error(deleteError.message);
      return;
    }

    if (last.type in EMPTY_COUNTS) {
      const type = last.type as EventType;
      if (last.occurred_at >= startOfWeekISO()) {
        setWeekCounts((c) => ({ ...c, [type]: Math.max(0, c[type] - 1) }));
      }
      setCounts((c) => ({ ...c, [type]: Math.max(0, c[type] - 1) }));
    }
    const remaining = todayEvents.filter((e) => e.id !== last.id);
    setTodayEvents(remaining);
    setLastEventId(remaining.find((ev) => ev.user_id === user.id)?.id ?? null);

    showToast("Undid last entry");
  }

  // Resolves true only after the row is really gone from the database. RLS
  // can turn a delete into a silent no-op, so an empty result counts as failure.
  async function handleDeleteEvent(id: string): Promise<boolean> {
    const target = todayEvents.find((ev) => ev.id === id);
    if (!target) return false;

    const { data, error } = await supabase.from("events").delete().eq("id", id).select("id");

    if (error) {
      toast.error(error.message);
      return false;
    }
    if (!data || data.length === 0) {
      toast.error("Couldn't delete this entry. You may not have permission.");
      return false;
    }

    const own = target.user_id === userId;
    if (own && target.type in EMPTY_COUNTS) {
      const type = target.type;
      setCounts((c) => ({ ...c, [type]: Math.max(0, c[type] - 1) }));
      if (target.occurred_at >= startOfWeekISO()) {
        setWeekCounts((c) => ({ ...c, [type]: Math.max(0, c[type] - 1) }));
      }
    }
    const remaining = todayEvents.filter((ev) => ev.id !== id);
    setTodayEvents(remaining);
    setLastEventId(remaining.find((ev) => ev.user_id === userId)?.id ?? null);

    showToast(`Deleted ${labelForEventType(target.type).toLowerCase()}`);
    return true;
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (role !== "owner" && role !== "ops" && role !== "setter") {
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

  if (view === "setter") {
    return (
      <AppShell role={role} onSignOut={handleSignOut}>
        <div className="flex flex-col gap-5">
          <div>
            <h1 className="font-serif text-2xl tracking-tight">Tally</h1>
            {displayName && (
              <p className="text-sm text-muted-foreground">Hey, {displayName}</p>
            )}
          </div>

          <WeekSummary role={role} weekCounts={weekCounts} />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Setter Activity</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2.5 pt-0">
              {SETTER_EVENTS.map((event) => (
                <EventButton
                  key={event.type}
                  label={event.label}
                  tone={event.tone}
                  count={counts[event.type]}
                  pending={pendingType === event.type}
                  Icon={TYPE_ICON[event.type]}
                  onClick={() => handleTap(event.type, event.toast)}
                />
              ))}
            </CardContent>
          </Card>

          <EventLogCard
            events={todayEvents}
            isPast={false}
            dateLabel=""
            onDelete={handleDeleteEvent}
            className="h-80"
          />

          <div className="sticky bottom-20 z-10 md:bottom-4">
            <button
              type="button"
              onClick={handleUndo}
              disabled={undoing || !lastEventId}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background/95 text-sm font-medium text-muted-foreground shadow-md backdrop-blur transition-colors hover:bg-accent/60 active:scale-[0.98] disabled:opacity-50"
            >
              <Undo2 className="h-4 w-4" />
              {undoing ? "Undoing..." : "Undo last"}
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <OwnerOpsTallyView
      role={role}
      displayName={displayName}
      selectedDate={selectedDate}
      onSelectDate={setSelectedDate}
      counts={counts}
      weekCounts={weekCounts}
      todayEvents={todayEvents}
      onDeleteEvent={handleDeleteEvent}
      pendingType={pendingType}
      undoing={undoing}
      lastEventId={lastEventId}
      pillMessage={pillMessage}
      onTap={handleTap}
      onUndo={handleUndo}
      onSignOut={handleSignOut}
    />
  );
}

function EventButton({
  label,
  tone,
  count,
  pending,
  Icon,
  onClick,
}: {
  label: string;
  tone: EventTone;
  count: number;
  pending: boolean;
  Icon: typeof Calendar;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={cn(
        "relative flex min-h-[5rem] flex-col items-start justify-center gap-1.5 rounded-xl border px-4 py-3 text-left transition-all active:scale-[0.96] disabled:opacity-60",
        TONE_CLASSES[tone],
      )}
    >
      <Icon className="h-5 w-5 opacity-80" />
      <span className="text-sm font-medium leading-tight">{label}</span>
      {count > 0 && (
        <span className="absolute right-2.5 top-2.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-background/80 px-1.5 text-xs font-semibold tabular-nums shadow-sm">
          {count}
        </span>
      )}
      {pending && (
        <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/50">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        </span>
      )}
    </button>
  );
}

function WeekSummary({
  role,
  weekCounts,
}: {
  role: UserRole;
  weekCounts: Counts;
}) {
  const chips = useMemo(() => {
    if (role === "setter") {
      return [
        { label: "Dials", value: weekCounts.dial },
        { label: "Answered", value: weekCounts.dial_answered },
        { label: "Booked", value: weekCounts.appointment_booked },
        { label: "Converted", value: weekCounts.appointment_converted },
      ];
    }
    return [
      { label: "Sales Calls", value: weekCounts.sales_call_done },
      { label: "Intro Calls", value: weekCounts.intro_call_done },
      { label: "Podcasts", value: weekCounts.podcast_done },
      { label: "Outcomes", value: weekCounts.verbal_agreement + weekCounts.paid },
    ];
  }, [role, weekCounts]);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        This week
      </p>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {chips.map((chip) => (
          <div
            key={chip.label}
            className="flex shrink-0 flex-col items-center gap-0.5 rounded-lg border bg-card px-4 py-2 shadow-sm"
          >
            <span className="text-lg font-bold leading-none tabular-nums">
              {chip.value}
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">
              {chip.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
