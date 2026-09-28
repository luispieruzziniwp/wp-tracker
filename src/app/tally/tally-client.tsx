"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { EventType, UserRole } from "@/lib/supabase/database.types";
import {
  SETTER_EVENTS,
  TALLY_SECTIONS,
  type EventTone,
  startOfTodayISO,
  startOfWeekISO,
} from "@/lib/tally-events";

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
  neutral:
    "border-border bg-card hover:bg-accent/60 text-foreground",
  positive:
    "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/50",
  negative:
    "border-rose-200 bg-rose-50/80 text-rose-700 hover:bg-rose-100 dark:border-rose-900/70 dark:bg-rose-950/20 dark:text-rose-300 dark:hover:bg-rose-950/40",
};

export default function TallyClient() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [weekCounts, setWeekCounts] = useState<Counts>(EMPTY_COUNTS);
  const [pendingType, setPendingType] = useState<EventType | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [lastEventId, setLastEventId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
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
      .select("display_name, role")
      .eq("id", user.id)
      .maybeSingle();

    setRole(profile?.role ?? null);
    setDisplayName(profile?.display_name ?? null);

    if (profile?.role === "owner" || profile?.role === "ops" || profile?.role === "setter") {
      const { data: events } = await supabase
        .from("events")
        .select("id, type, occurred_at")
        .eq("user_id", user.id)
        .gte("occurred_at", startOfWeekISO())
        .order("occurred_at", { ascending: false });

      const todayStart = startOfTodayISO();
      const nextToday = { ...EMPTY_COUNTS };
      const nextWeek = { ...EMPTY_COUNTS };
      for (const row of events ?? []) {
        if (row.type in nextWeek) {
          nextWeek[row.type as EventType] += 1;
          if (row.occurred_at >= todayStart) {
            nextToday[row.type as EventType] += 1;
          }
        }
      }
      setCounts(nextToday);
      setWeekCounts(nextWeek);
      setLastEventId(events && events.length > 0 ? events[0].id : null);
    }

    setLoading(false);
  }, [router, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleTap(type: EventType, toastText: string) {
    setPendingType(type);

    // Optimistic update — reflect the tap instantly, roll back on failure.
    setCounts((c) => ({ ...c, [type]: c[type] + 1 }));
    setWeekCounts((c) => ({ ...c, [type]: c[type] + 1 }));

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const { data, error } = await supabase
      .from("events")
      .insert({ user_id: user.id, type })
      .select("id")
      .single();

    setPendingType(null);

    if (error) {
      setCounts((c) => ({ ...c, [type]: Math.max(0, c[type] - 1) }));
      setWeekCounts((c) => ({ ...c, [type]: Math.max(0, c[type] - 1) }));
      toast.error(error.message);
      return;
    }

    setLastEventId(data?.id ?? null);
    toast.success(toastText);
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

    const { data: last, error: fetchError } = await supabase
      .from("events")
      .select("id, type, occurred_at")
      .eq("user_id", user.id)
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
      setWeekCounts((c) => ({ ...c, [type]: Math.max(0, c[type] - 1) }));
      if (last.occurred_at >= startOfTodayISO()) {
        setCounts((c) => ({ ...c, [type]: Math.max(0, c[type] - 1) }));
      }
    }
    setLastEventId(null);

    toast.success("Undid last entry");
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

  const isSetter = role === "setter";

  return (
    <AppShell role={role} onSignOut={handleSignOut}>
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Tally</h1>
          {displayName && (
            <p className="text-sm text-muted-foreground">Hey, {displayName}</p>
          )}
        </div>

        <WeekSummary role={role} weekCounts={weekCounts} />

        {isSetter ? (
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
        ) : (
          <div className="flex flex-col gap-4">
            {TALLY_SECTIONS.map(({ section, events }) => (
              <Card key={section}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{section}</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2.5 pt-0">
                  {events.map((event) => (
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
            ))}
          </div>
        )}

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
