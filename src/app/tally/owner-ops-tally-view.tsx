"use client";

import { useMemo } from "react";
import Link from "next/link";
import { LayoutDashboard, ListChecks, LogOut, Undo2 } from "lucide-react";
import type { EventType } from "@/lib/supabase/database.types";
import { TALLY_EVENTS, labelForEventType } from "@/lib/tally-events";

type Counts = Record<EventType, number>;
type TodayEvent = { id: string; type: EventType; occurred_at: string };

type ColumnKey = "scheduled" | "done" | "canceled" | "rescheduled";

const COLUMNS: { key: ColumnKey; label: string; color: string }[] = [
  { key: "scheduled", label: "Scheduled", color: "#9CC7D4" },
  { key: "done", label: "Done", color: "#3FB8C9" },
  { key: "canceled", label: "Canceled", color: "#F07A7A" },
  { key: "rescheduled", label: "Rescheduled", color: "#F07A7A" },
];

const MOBILE_COLUMN_LABELS: Record<ColumnKey, string> = {
  scheduled: "Sched.",
  done: "Done",
  canceled: "Cancel",
  rescheduled: "Resched.",
};

const MATRIX_ROWS: { label: string; cells: Partial<Record<ColumnKey, EventType>> }[] = [
  {
    label: "Sales calls",
    cells: {
      scheduled: "sales_call_scheduled",
      done: "sales_call_done",
      canceled: "sales_call_canceled",
    },
  },
  {
    label: "Intro calls",
    cells: {
      scheduled: "intro_call_scheduled",
      done: "intro_call_done",
      canceled: "intro_call_canceled",
    },
  },
  {
    label: "Podcast",
    cells: {
      scheduled: "podcast_scheduled",
      done: "podcast_done",
      canceled: "podcast_canceled",
      rescheduled: "podcast_rescheduled",
    },
  },
];

const COLORS = {
  navActiveBg: "#043F55",
  cellScheduledBg: "#04506B",
  cellScheduledBorder: "#0B5F7D",
  cellDoneBg: "#043F55",
  cellNegBg: "#2E2A38",
  cellNegBorder: "#5C3A45",
  outcomeBg: "#083F3C",
  outcomeBorder: "#2E8C73",
} as const;

const CELL_STYLES: Record<ColumnKey, { bg: string; border: string; text: string }> = {
  scheduled: { bg: COLORS.cellScheduledBg, border: COLORS.cellScheduledBorder, text: "#F2FAFC" },
  done: { bg: COLORS.cellDoneBg, border: "#3FB8C9", text: "#3FB8C9" },
  canceled: { bg: COLORS.cellNegBg, border: COLORS.cellNegBorder, text: "#F07A7A" },
  rescheduled: { bg: COLORS.cellNegBg, border: COLORS.cellNegBorder, text: "#F07A7A" },
};

const TOAST_BY_TYPE: Partial<Record<EventType, string>> = Object.fromEntries(
  TALLY_EVENTS.map((e) => [e.type, e.toast]),
);

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function dotColor(type: EventType): string {
  if (type.endsWith("canceled") || type.endsWith("rescheduled")) return "#F07A7A";
  if (type === "verbal_agreement" || type === "paid" || type === "appointment_converted") return "#4FD1A5";
  if (type.endsWith("done") || type === "dial_answered" || type === "appointment_booked") return "#3FB8C9";
  return "#9CC7D4";
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function OwnerOpsTallyView({
  displayName,
  counts,
  weekCounts,
  todayEvents,
  pendingType,
  undoing,
  lastEventId,
  pillMessage,
  onTap,
  onUndo,
  onSignOut,
}: {
  displayName: string | null;
  counts: Counts;
  weekCounts: Counts;
  todayEvents: TodayEvent[];
  pendingType: EventType | null;
  undoing: boolean;
  lastEventId: string | null;
  pillMessage: string | null;
  onTap: (type: EventType, toastText: string) => void;
  onUndo: () => void;
  onSignOut: () => void;
}) {
  const todayLabel = useMemo(
    () => new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
    [],
  );
  const visibleLog = todayEvents.slice(0, 6);

  return (
    <>
      {/* Desktop (>=1024px) */}
      <div className="hidden h-dvh flex-col overflow-hidden bg-background lg:flex">
        <DesktopTopBar todayLabel={todayLabel} />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-10 py-7">
          <h1 className="mb-5 shrink-0 font-serif text-[34px] leading-none">Tally</h1>
          <div className="grid min-h-0 flex-1 gap-5" style={{ gridTemplateColumns: "2fr 1fr" }}>
            <div className="flex min-h-0 flex-col gap-5">
              <MatrixCard counts={counts} pendingType={pendingType} onTap={onTap} size="desktop" />
              <OutcomesCard counts={counts} pendingType={pendingType} onTap={onTap} />
            </div>
            <div className="flex min-h-0 flex-col gap-5">
              <WeekCard weekCounts={weekCounts} />
              <TodayLogCard
                events={visibleLog}
                undoing={undoing}
                lastEventId={lastEventId}
                onUndo={onUndo}
                className="min-h-0 flex-1"
              />
            </div>
          </div>
        </main>
      </div>

      {/* Mobile (<1024px) */}
      <div className="flex min-h-dvh flex-col bg-background pb-24 lg:hidden">
        <div className="px-4 pb-1 pt-6">
          <h1 className="font-serif text-2xl tracking-tight">Tally</h1>
          {displayName && <p className="text-sm text-muted-foreground">Hey, {displayName}</p>}
        </div>
        <div className="flex flex-col gap-4 px-4 py-5">
          <WeekCard weekCounts={weekCounts} compact />
          <MatrixCard counts={counts} pendingType={pendingType} onTap={onTap} size="mobile" />
          <OutcomesCard counts={counts} pendingType={pendingType} onTap={onTap} />
          <button
            type="button"
            onClick={onUndo}
            disabled={undoing || !lastEventId}
            className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card text-sm font-medium text-muted-foreground transition-colors hover:bg-accent active:scale-[0.97] disabled:opacity-50 ${FOCUS_RING}`}
          >
            <Undo2 className="h-4 w-4" />
            {undoing ? "Undoing…" : "Undo last"}
          </button>
        </div>
        <MobileTabBar onSignOut={onSignOut} />
      </div>

      {pillMessage && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div
            className="rounded-full px-4 py-2 text-sm font-medium shadow-lg"
            style={{ backgroundColor: "#F2FAFC", color: "#011F2B" }}
          >
            {pillMessage}
          </div>
        </div>
      )}
    </>
  );
}

function DesktopTopBar({ todayLabel }: { todayLabel: string }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-card px-10">
      <div className="flex items-baseline gap-2">
        <span className="font-serif text-[22px] leading-none">Wisdom</span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Partners
        </span>
      </div>
      <nav className="flex items-center gap-1">
        <span
          className="rounded-lg px-4 py-2 text-sm font-medium"
          style={{ backgroundColor: COLORS.navActiveBg, color: "#3FB8C9" }}
        >
          Tally
        </span>
        <span aria-disabled="true" tabIndex={-1} className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground">
          Setter
        </span>
        <Link
          href="/dashboard"
          className={`rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground ${FOCUS_RING}`}
        >
          Dashboard
        </Link>
      </nav>
      <div className="text-sm text-muted-foreground">{todayLabel}</div>
    </header>
  );
}

function MobileTabBar({ onSignOut }: { onSignOut: () => void }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-md items-stretch">
        <Link
          href="/tally"
          className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium text-primary active:scale-95"
        >
          <ListChecks className="h-5 w-5" strokeWidth={2.5} />
          Tally
        </Link>
        <Link
          href="/dashboard"
          className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium text-muted-foreground transition-colors active:scale-95"
        >
          <LayoutDashboard className="h-5 w-5" />
          Dashboard
        </Link>
        <button
          type="button"
          onClick={onSignOut}
          className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium text-muted-foreground transition-colors active:scale-95"
        >
          <LogOut className="h-5 w-5" />
          Sign out
        </button>
      </div>
    </nav>
  );
}

function MatrixCard({
  counts,
  pendingType,
  onTap,
  size,
}: {
  counts: Counts;
  pendingType: EventType | null;
  onTap: (type: EventType, toastText: string) => void;
  size: "desktop" | "mobile";
}) {
  const cellHeight = size === "desktop" ? 76 : 64;
  const labelWidth = size === "desktop" ? 120 : 68;
  const gap = size === "desktop" ? 10 : 8;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div
        className="grid items-center"
        style={{ gridTemplateColumns: `${labelWidth}px repeat(4, 1fr)`, gap }}
      >
        <div aria-hidden />
        {COLUMNS.map((col) => (
          <div
            key={col.key}
            className="text-center text-[12px] font-semibold uppercase tracking-wide"
            style={{ color: col.color }}
          >
            {size === "desktop" ? col.label : MOBILE_COLUMN_LABELS[col.key]}
          </div>
        ))}
        {MATRIX_ROWS.flatMap((row) => [
          <div
            key={`${row.label}-label`}
            className={size === "desktop" ? "text-sm font-medium" : "text-xs font-medium"}
          >
            {row.label}
          </div>,
          ...COLUMNS.map((col) => {
            const type = row.cells[col.key];
            if (!type) {
              return (
                <div
                  key={`${row.label}-${col.key}`}
                  aria-hidden
                  className="rounded-xl border border-dashed border-border"
                  style={{ height: cellHeight }}
                />
              );
            }
            return (
              <MatrixCell
                key={`${row.label}-${col.key}`}
                column={col.key}
                eventType={type}
                count={counts[type]}
                pending={pendingType === type}
                height={cellHeight}
                onTap={onTap}
              />
            );
          }),
        ])}
      </div>
    </div>
  );
}

function MatrixCell({
  column,
  eventType,
  count,
  pending,
  height,
  onTap,
}: {
  column: ColumnKey;
  eventType: EventType;
  count: number;
  pending: boolean;
  height: number;
  onTap: (type: EventType, toastText: string) => void;
}) {
  const style = CELL_STYLES[column];
  const fullLabel = labelForEventType(eventType).toLowerCase();
  const toastText = TOAST_BY_TYPE[eventType] ?? `${labelForEventType(eventType)} ✓`;

  return (
    <button
      type="button"
      onClick={() => onTap(eventType, toastText)}
      disabled={pending}
      aria-label={`Log ${fullLabel}, ${count} today`}
      className={`flex items-center justify-center rounded-xl border font-bold tabular-nums transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.97] disabled:opacity-60 ${FOCUS_RING}`}
      style={{
        height,
        backgroundColor: style.bg,
        borderColor: style.border,
        color: style.text,
        fontSize: 28,
      }}
    >
      {pending ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        count
      )}
    </button>
  );
}

function OutcomesCard({
  counts,
  pendingType,
  onTap,
}: {
  counts: Counts;
  pendingType: EventType | null;
  onTap: (type: EventType, toastText: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="grid items-center gap-2.5 sm:grid-cols-[120px_repeat(4,1fr)]" style={{ gap: 10 }}>
        <div className="text-sm font-medium">Outcomes</div>
        <OutcomeButton
          type="verbal_agreement"
          label="Verbal agreement"
          count={counts.verbal_agreement}
          pending={pendingType === "verbal_agreement"}
          onTap={onTap}
        />
        <OutcomeButton
          type="paid"
          label="Paid"
          count={counts.paid}
          pending={pendingType === "paid"}
          onTap={onTap}
        />
      </div>
    </div>
  );
}

function OutcomeButton({
  type,
  label,
  count,
  pending,
  onTap,
}: {
  type: EventType;
  label: string;
  count: number;
  pending: boolean;
  onTap: (type: EventType, toastText: string) => void;
}) {
  const toastText = TOAST_BY_TYPE[type] ?? `${label} ✓`;
  return (
    <button
      type="button"
      onClick={() => onTap(type, toastText)}
      disabled={pending}
      aria-label={`Log ${label.toLowerCase()}, ${count} today`}
      className={`flex items-center justify-between rounded-xl border px-4 transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.97] disabled:opacity-60 ${FOCUS_RING}`}
      style={{ height: 64, backgroundColor: COLORS.outcomeBg, borderColor: COLORS.outcomeBorder }}
    >
      <span className="text-sm font-medium text-foreground">{label}</span>
      <span className="text-[26px] font-bold tabular-nums" style={{ color: "#4FD1A5" }}>
        {pending ? "…" : count}
      </span>
    </button>
  );
}

function WeekCard({ weekCounts, compact }: { weekCounts: Counts; compact?: boolean }) {
  const stats = [
    { label: "Sales calls done", value: weekCounts.sales_call_done },
    { label: "Intro calls done", value: weekCounts.intro_call_done },
    { label: "Podcasts recorded", value: weekCounts.podcast_done },
    { label: "Paid", value: weekCounts.paid },
  ];

  return (
    <div className={`rounded-2xl border border-border bg-card ${compact ? "p-4" : "p-5"}`}>
      <h2 className="mb-4 font-serif text-lg leading-none">This week</h2>
      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-1">
            <span className="text-[26px] font-bold leading-none tabular-nums">{stat.value}</span>
            <span className="text-[13px]" style={{ color: "#9CC7D4" }}>
              {stat.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TodayLogCard({
  events,
  undoing,
  lastEventId,
  onUndo,
  className = "",
}: {
  events: TodayEvent[];
  undoing: boolean;
  lastEventId: string | null;
  onUndo: () => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-col rounded-2xl border border-border bg-card p-5 ${className}`}>
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <h2 className="font-serif text-lg leading-none">Today&apos;s log</h2>
        <button
          type="button"
          onClick={onUndo}
          disabled={undoing || !lastEventId}
          className={`flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent active:scale-[0.97] disabled:opacity-50 ${FOCUS_RING}`}
        >
          <Undo2 className="h-3.5 w-3.5" />
          {undoing ? "Undoing…" : "Undo last"}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <p className="text-sm" style={{ color: "#9CC7D4" }}>
            Nothing logged yet today.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {events.map((evt) => (
              <li key={evt.id} className="flex items-center gap-2.5 text-sm">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: dotColor(evt.type) }}
                  aria-hidden
                />
                <span className="flex-1 truncate">{labelForEventType(evt.type)}</span>
                <span className="shrink-0 text-xs tabular-nums" style={{ color: "#9CC7D4" }}>
                  {formatTime(evt.occurred_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
