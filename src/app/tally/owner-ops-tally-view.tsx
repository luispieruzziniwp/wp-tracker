"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LogOut, Undo2 } from "lucide-react";
import { NavLinks } from "@/components/nav-links";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { EventBilling, EventSource, EventType, UserRole } from "@/lib/supabase/database.types";
import { TALLY_EVENTS, labelForEventType } from "@/lib/tally-events";
import { SOURCES, SOURCE_COLOR, SOURCE_LABEL } from "@/lib/sources";
import {
  formatDateKeyLong,
  formatPaidAmount,
  localDateKey,
  shiftDateKey,
} from "@/lib/tally-dates";

type Counts = Record<EventType, number>;
type TodayEvent = {
  id: string;
  type: EventType;
  occurred_at: string;
  source: EventSource | null;
  amount: number | null;
  billing: EventBilling | null;
};

// These are the only types that prompt for a lead source before logging.
// Everything else (canceled, rescheduled, podcast_*) keeps logging on a
// single click with source: null.
const SOURCE_PROMPT_TYPES = new Set<EventType>([
  "sales_call_scheduled",
  "sales_call_done",
  "intro_call_scheduled",
  "intro_call_done",
  "verbal_agreement",
]);

function toastWithSource(base: string, source: EventSource): string {
  const withoutCheck = base.replace(/\s*✓\s*$/, "");
  return `${withoutCheck} · ${SOURCE_LABEL[source]} ✓`;
}

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

type OnTap = (
  type: EventType,
  toastText: string,
  source?: EventSource | null,
  paid?: { amount: number; billing: EventBilling } | null,
) => void;

// Open state plus 1-5 source shortcuts for a source-picker popover. Outside
// click, Escape, and collision-aware positioning come from the Radix Popover.
// The caller keeps onPickRef.current pointed at its latest handler each render.
function useSourcePopover() {
  const [open, setOpen] = useState(false);
  const onPickRef = useRef<((source: EventSource) => void) | null>(null);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      const num = Number(e.key);
      if (Number.isInteger(num) && num >= 1 && num <= SOURCES.length) {
        onPickRef.current?.(SOURCES[num - 1].key);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return { open, setOpen, onPickRef };
}

function SourceMenu({ onPick }: { onPick: (source: EventSource) => void }) {
  return (
    <PopoverContent role="menu" aria-label="Choose lead source" className="flex w-auto gap-1">
      {SOURCES.map((s) => (
        <button
          key={s.key}
          type="button"
          role="menuitem"
          onClick={() => onPick(s.key)}
          className={`flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent active:scale-[0.97] ${FOCUS_RING}`}
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
          {s.label}
        </button>
      ))}
    </PopoverContent>
  );
}

export function OwnerOpsTallyView({
  role,
  displayName,
  selectedDate,
  onSelectDate,
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
  role: UserRole;
  displayName: string | null;
  selectedDate: string;
  onSelectDate: (key: string) => void;
  counts: Counts;
  weekCounts: Counts;
  todayEvents: TodayEvent[];
  pendingType: EventType | null;
  undoing: boolean;
  lastEventId: string | null;
  pillMessage: string | null;
  onTap: OnTap;
  onUndo: () => void;
  onSignOut: () => void;
}) {
  const todayLabel = useMemo(
    () => new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
    [],
  );
  const visibleLog = todayEvents.slice(0, 6);
  const todayKey = localDateKey();
  const isPast = selectedDate !== todayKey;
  const dateLabel = formatDateKeyLong(selectedDate);
  const banner = isPast ? (
    <PastDateBanner label={dateLabel} onBack={() => onSelectDate(todayKey)} />
  ) : null;

  return (
    <>
      {/* Desktop (>=1024px) */}
      <div className="hidden min-h-dvh flex-col bg-background lg:flex">
        <DesktopTopBar todayLabel={todayLabel} role={role} />
        <main className="flex flex-1 flex-col px-10 py-7">
          <div className="mb-5 flex h-10 shrink-0 items-center gap-4">
            <h1 className="font-serif text-[34px] leading-none">Tally</h1>
            <DateControl selectedDate={selectedDate} todayKey={todayKey} onChange={onSelectDate} />
            {banner}
          </div>
          <div className="grid min-h-0 flex-1 gap-5" style={{ gridTemplateColumns: "2fr 1fr" }}>
            <div className="flex min-h-0 flex-col gap-5">
              <MatrixCard counts={counts} pendingType={pendingType} onTap={onTap} size="desktop" />
              <OutcomesCard counts={counts} pendingType={pendingType} onTap={onTap} />
            </div>
            <div className="flex min-h-0 flex-col gap-5">
              <WeekCard weekCounts={weekCounts} />
              <TodayLogCard
                events={visibleLog}
                isPast={isPast}
                dateLabel={dateLabel}
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
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-serif text-2xl tracking-tight">Tally</h1>
            <DateControl selectedDate={selectedDate} todayKey={todayKey} onChange={onSelectDate} />
          </div>
          {displayName && <p className="text-sm text-muted-foreground">Hey, {displayName}</p>}
        </div>
        <div className="flex flex-col gap-4 px-4 py-5">
          <div className="h-[60px]">{banner}</div>
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
        <MobileTabBar onSignOut={onSignOut} role={role} />
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

function DesktopTopBar({ todayLabel, role }: { todayLabel: string; role: UserRole }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-card px-10">
      <div className="flex items-baseline gap-2">
        <span className="font-serif text-[22px] leading-none">Wisdom</span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Partners
        </span>
      </div>
      <NavLinks role={role} variant="top" />
      <div className="text-sm text-muted-foreground">{todayLabel}</div>
    </header>
  );
}

function MobileTabBar({ onSignOut, role }: { onSignOut: () => void; role: UserRole }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-md items-stretch">
        <NavLinks role={role} variant="bottom" />
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
  onTap: OnTap;
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
  onTap: OnTap;
}) {
  const style = CELL_STYLES[column];
  const fullLabel = labelForEventType(eventType).toLowerCase();
  const baseToast = TOAST_BY_TYPE[eventType] ?? `${labelForEventType(eventType)} ✓`;
  const needsSource = SOURCE_PROMPT_TYPES.has(eventType);

  const { open, setOpen, onPickRef } = useSourcePopover();

  const handlePick = useCallback(
    (source: EventSource) => {
      onTap(eventType, toastWithSource(baseToast, source), source);
      setOpen(false);
    },
    [eventType, baseToast, onTap, setOpen],
  );
  onPickRef.current = handlePick;

  const button = (
    <button
      type="button"
      onClick={needsSource ? undefined : () => onTap(eventType, baseToast, null)}
      disabled={pending}
      aria-label={`Log ${fullLabel}, ${count} today`}
      className={`flex w-full items-center justify-center rounded-xl border font-bold tabular-nums transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.97] disabled:opacity-60 ${FOCUS_RING}`}
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

  if (!needsSource) return button;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{button}</PopoverTrigger>
      <SourceMenu onPick={handlePick} />
    </Popover>
  );
}

function OutcomesCard({
  counts,
  pendingType,
  onTap,
}: {
  counts: Counts;
  pendingType: EventType | null;
  onTap: OnTap;
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
        <PaidButton count={counts.paid} pending={pendingType === "paid"} onTap={onTap} />
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
  onTap: OnTap;
}) {
  const baseToast = TOAST_BY_TYPE[type] ?? `${label} ✓`;

  const { open, setOpen, onPickRef } = useSourcePopover();

  const handlePick = useCallback(
    (source: EventSource) => {
      onTap(type, toastWithSource(baseToast, source), source);
      setOpen(false);
    },
    [type, baseToast, onTap, setOpen],
  );
  onPickRef.current = handlePick;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={pending}
          aria-label={`Log ${label.toLowerCase()}, ${count} today`}
          className={`flex w-full items-center justify-between rounded-xl border px-4 transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.97] disabled:opacity-60 ${FOCUS_RING}`}
          style={{ height: 64, backgroundColor: COLORS.outcomeBg, borderColor: COLORS.outcomeBorder }}
        >
          <span className="text-sm font-medium text-foreground">{label}</span>
          <span className="text-[26px] font-bold tabular-nums" style={{ color: "#4FD1A5" }}>
            {pending ? "…" : count}
          </span>
        </button>
      </PopoverTrigger>
      <SourceMenu onPick={handlePick} />
    </Popover>
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
  isPast,
  dateLabel,
  undoing,
  lastEventId,
  onUndo,
  className = "",
}: {
  events: TodayEvent[];
  isPast: boolean;
  dateLabel: string;
  undoing: boolean;
  lastEventId: string | null;
  onUndo: () => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-col rounded-2xl border border-border bg-card p-5 ${className}`}>
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <h2 className="font-serif text-lg leading-none">
          {isPast ? `Log for ${dateLabel}` : "Today\u2019s log"}
        </h2>
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
            {isPast ? "Nothing logged on this date." : "Nothing logged yet today."}
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
                <span className="flex-1 truncate">
                  {labelForEventType(evt.type)}
                  {evt.type === "paid" && evt.amount != null && evt.billing && (
                    <span className="ml-1.5 font-semibold" style={{ color: "#4FD1A5" }}>
                      {formatPaidAmount(evt.amount, evt.billing)}
                    </span>
                  )}
                </span>
                {evt.source && (
                  <span
                    className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                    style={{
                      backgroundColor: `${SOURCE_COLOR[evt.source]}26`,
                      color: SOURCE_COLOR[evt.source],
                    }}
                  >
                    {SOURCE_LABEL[evt.source]}
                  </span>
                )}
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

function PastDateBanner({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div
      role="status"
      className="flex h-[60px] shrink-0 items-center justify-between gap-3 rounded-xl border px-3 lg:h-10 lg:whitespace-nowrap"
      style={{ backgroundColor: "#3A2A0B", borderColor: "#F2C46D", color: "#F2C46D" }}
    >
      <span className="text-xs font-semibold leading-tight lg:text-sm">Logging for {label} — not today</span>
      <button
        type="button"
        onClick={onBack}
        className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-white/10 active:scale-[0.97] ${FOCUS_RING}`}
        style={{ borderColor: "#F2C46D" }}
      >
        Back to today
      </button>
    </div>
  );
}

function DateControl({
  selectedDate,
  todayKey,
  onChange,
}: {
  selectedDate: string;
  todayKey: string;
  onChange: (key: string) => void;
}) {
  const atToday = selectedDate >= todayKey;
  const btn = `flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-accent active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 ${FOCUS_RING}`;

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label="Previous day"
        className={btn}
        onClick={() => onChange(shiftDateKey(selectedDate, -1))}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <input
        type="date"
        aria-label="Choose date"
        value={selectedDate}
        max={todayKey}
        onChange={(e) => {
          const v = e.target.value;
          if (v && v <= todayKey) onChange(v);
        }}
        className={`h-9 rounded-lg border border-border bg-card px-2 text-sm text-foreground [color-scheme:dark] ${FOCUS_RING}`}
      />
      <button
        type="button"
        aria-label="Next day"
        className={btn}
        disabled={atToday}
        onClick={() => onChange(shiftDateKey(selectedDate, 1))}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// Paid asks for an amount (and billing cadence) before logging, so it cannot
// share useSourcePopover — that hook binds the 1-5 keys to source picks,
// which would fire while typing the amount.
function PaidButton({
  count,
  pending,
  onTap,
}: {
  count: number;
  pending: boolean;
  onTap: OnTap;
}) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<EventSource | null>(null);
  const [amountText, setAmountText] = useState("");
  const [billing, setBilling] = useState<EventBilling>("monthly");
  const [error, setError] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const baseToast = TOAST_BY_TYPE.paid ?? "Paid ✓";

  function handleOpenChange(next: boolean) {
    if (next) {
      setSource(null);
      setAmountText("");
      setBilling("monthly");
      setError(null);
    }
    setOpen(next);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(amountText);
    if (!amountText.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError("Enter an amount greater than 0");
      amountRef.current?.focus();
      return;
    }
    if (!source) {
      setError("Choose a source");
      return;
    }
    const rounded = Math.round(amount * 100) / 100;
    const withoutCheck = baseToast.replace(/\s*✓\s*$/, "");
    onTap(
      "paid",
      `${withoutCheck} · ${formatPaidAmount(rounded, billing)} · ${SOURCE_LABEL[source]} ✓`,
      source,
      { amount: rounded, billing },
    );
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={pending}
          aria-label={`Log paid, ${count} today`}
          className={`flex w-full items-center justify-between rounded-xl border px-4 transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.97] disabled:opacity-60 ${FOCUS_RING}`}
          style={{ height: 64, backgroundColor: COLORS.outcomeBg, borderColor: COLORS.outcomeBorder }}
        >
          <span className="text-sm font-medium text-foreground">Paid</span>
          <span className="text-[26px] font-bold tabular-nums" style={{ color: "#4FD1A5" }}>
            {pending ? "…" : count}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label="Log paid"
        className="w-72 max-w-[calc(100vw-16px)] p-3"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          amountRef.current?.focus();
        }}
      >
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Source
            </span>
            <div className="flex flex-wrap gap-1">
              {SOURCES.map((src) => (
                <button
                  key={src.key}
                  type="button"
                  aria-pressed={source === src.key}
                  onClick={() => setSource(src.key)}
                  className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent ${FOCUS_RING}`}
                  style={{ borderColor: source === src.key ? src.color : "transparent" }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: src.color }} aria-hidden />
                  {src.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Amount (USD)
            </span>
            <div className="flex items-center rounded-lg border border-border bg-background px-2">
              <span className="text-sm text-muted-foreground">$</span>
              <input
                ref={amountRef}
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                required
                value={amountText}
                onChange={(e) => {
                  setAmountText(e.target.value);
                  setError(null);
                }}
                className="h-9 w-full bg-transparent px-1.5 text-sm tabular-nums text-foreground outline-none"
                placeholder="1000"
              />
            </div>
          </label>

          <div
            role="radiogroup"
            aria-label="Billing"
            className="grid grid-cols-2 gap-1 rounded-lg border border-border p-1"
          >
            {(
              [
                ["monthly", "Monthly"],
                ["one_time", "One-time"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={billing === value}
                onClick={() => setBilling(value)}
                className={`rounded-md py-1.5 text-xs font-semibold transition-colors ${FOCUS_RING} ${
                  billing === value ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {error && (
            <p role="alert" className="text-xs" style={{ color: "#F07A7A" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            className={`h-9 rounded-lg text-sm font-semibold transition-[filter,transform] hover:brightness-110 active:scale-[0.98] ${FOCUS_RING}`}
            style={{ backgroundColor: "#2E8C73", color: "#F2FAFC" }}
          >
            Log
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
