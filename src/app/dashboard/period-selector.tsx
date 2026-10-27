"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { localDateKey, parseDateKey, shiftDateKey } from "@/lib/tally-dates";
import {
  anchorFor,
  canStepForward,
  clampPeriod,
  mondayKey,
  periodContaining,
  periodLabel,
  stepPeriod,
  switchKind,
  type Period,
  type PeriodKind,
} from "@/lib/dashboard-period";

const KIND_OPTIONS: { value: PeriodKind | "all" | "custom"; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
  { value: "all", label: "All Time" },
  { value: "custom", label: "Custom" },
];

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function PeriodSelector({
  period,
  onChange,
  disabled,
}: {
  period: Period;
  onChange: (p: Period) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const today = localDateKey();
  const hasArrows = period.kind !== "all" && period.kind !== "custom";
  const iconBtn = `flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-accent active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 ${FOCUS_RING}`;

  function pick(p: Period) {
    onChange(clampPeriod(p, today));
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Period type" className="flex flex-wrap gap-2">
        {KIND_OPTIONS.map((opt) => {
          const active = period.kind === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={disabled}
              onClick={() => {
                if (!active) onChange(switchKind(period, opt.value, today));
              }}
              className={cn(
                `h-8 rounded-md border px-3 text-sm font-medium transition-colors disabled:opacity-60 ${FOCUS_RING}`,
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-accent",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5">
        {hasArrows && (
          <button
            type="button"
            aria-label={`Previous ${period.kind}`}
            className={iconBtn}
            onClick={() => pick(stepPeriod(period, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        {period.kind === "all" ? (
          <span className="px-1 text-sm font-medium">{periodLabel(period)}</span>
        ) : (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={`h-9 rounded-lg border border-border bg-card px-3 text-sm font-medium transition-colors hover:bg-accent ${FOCUS_RING}`}
              >
                {periodLabel(period)}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto max-w-[calc(100vw-16px)] p-3">
              <PickerBody
                period={period}
                today={today}
                onPick={(p) => {
                  pick(p);
                  if (p.kind !== "custom") setOpen(false);
                }}
                onClose={() => setOpen(false)}
              />
            </PopoverContent>
          </Popover>
        )}

        {hasArrows && (
          <button
            type="button"
            aria-label={`Next ${period.kind}`}
            className={iconBtn}
            disabled={!canStepForward(period, today)}
            onClick={() => pick(stepPeriod(period, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function PickerBody({
  period,
  today,
  onPick,
  onClose,
}: {
  period: Period;
  today: string;
  onPick: (p: Period) => void;
  onClose: () => void;
}) {
  if (period.kind === "week") {
    return (
      <MiniCalendar
        initial={period.anchor}
        today={today}
        isSelected={(k) => mondayKey(k) === period.anchor}
        onPickDay={(k) => onPick({ kind: "week", anchor: mondayKey(k) })}
      />
    );
  }

  if (period.kind === "custom") {
    const inSpan = (k: string) => {
      const m = mondayKey(k);
      return m >= period.start && m <= period.end;
    };
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Start week
            </span>
            <MiniCalendar
              initial={period.start}
              today={today}
              isSelected={inSpan}
              onPickDay={(k) => {
                const start = mondayKey(k);
                onPick({ kind: "custom", start, end: period.end < start ? start : period.end });
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              End week
            </span>
            <MiniCalendar
              initial={period.end}
              today={today}
              isSelected={inSpan}
              onPickDay={(k) => {
                const end = mondayKey(k);
                onPick({ kind: "custom", start: period.start > end ? end : period.start, end });
              }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`h-8 self-end rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 ${FOCUS_RING}`}
        >
          Done
        </button>
      </div>
    );
  }

  if (period.kind === "all") return null;
  return <GridPicker period={period as Extract<Period, { anchor: string }>} today={today} onPick={onPick} />;
}

// Month / Quarter / Year jump grids.
function GridPicker({
  period,
  today,
  onPick,
}: {
  period: Extract<Period, { anchor: string }>;
  today: string;
  onPick: (p: Period) => void;
}) {
  const currentYear = parseDateKey(today).getFullYear();
  const selectedYear = parseDateKey(period.anchor).getFullYear();
  // Months/quarters page by year; the year grid pages by 12 years.
  const [page, setPage] = useState(period.kind === "year" ? Math.floor((selectedYear - 1) / 12) : selectedYear);

  const cellBtn = (selected: boolean) =>
    cn(
      `h-9 rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-35 ${FOCUS_RING}`,
      selected ? "bg-primary text-primary-foreground" : "hover:bg-accent",
    );

  if (period.kind === "year") {
    const first = page * 12 + 1;
    const years = Array.from({ length: 12 }, (_, i) => first + i);
    return (
      <div className="flex w-56 flex-col gap-2">
        <PagerHeader
          label={`${first} – ${first + 11}`}
          onPrev={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
          nextDisabled={first + 11 >= currentYear}
        />
        <div className="grid grid-cols-3 gap-1">
          {years.map((y) => (
            <button
              key={y}
              type="button"
              disabled={y > currentYear}
              className={cellBtn(y === selectedYear)}
              onClick={() => onPick(periodContaining("year", `${y}-01-01`))}
            >
              {y}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const selectedAnchor = period.anchor;
  return (
    <div className="flex w-56 flex-col gap-2">
      <PagerHeader
        label={String(page)}
        onPrev={() => setPage((y) => y - 1)}
        onNext={() => setPage((y) => y + 1)}
        nextDisabled={page >= currentYear}
      />
      {period.kind === "month" ? (
        <div className="grid grid-cols-3 gap-1">
          {MONTH_SHORT.map((name, i) => {
            const anchor = anchorFor("month", `${page}-${String(i + 1).padStart(2, "0")}-01`);
            const future = anchor > today;
            return (
              <button
                key={name}
                type="button"
                disabled={future}
                className={cellBtn(anchor === selectedAnchor)}
                onClick={() => onPick({ kind: "month", anchor })}
              >
                {name}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1">
          {[0, 1, 2, 3].map((q) => {
            const anchor = `${page}-${String(q * 3 + 1).padStart(2, "0")}-01`;
            const future = anchor > today;
            return (
              <button
                key={q}
                type="button"
                disabled={future}
                className={cellBtn(anchor === selectedAnchor)}
                onClick={() => onPick({ kind: "quarter", anchor })}
              >
                Q{q + 1}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PagerHeader({
  label,
  onPrev,
  onNext,
  nextDisabled,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  nextDisabled: boolean;
}) {
  const btn = `flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent disabled:pointer-events-none disabled:opacity-35 ${FOCUS_RING}`;
  return (
    <div className="flex items-center justify-between">
      <button type="button" aria-label="Previous" className={btn} onClick={onPrev}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-sm font-semibold">{label}</span>
      <button type="button" aria-label="Next" className={btn} onClick={onNext} disabled={nextDisabled}>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// Monday-first month grid. Highlights whole weeks via isSelected; days after
// today are disabled.
function MiniCalendar({
  initial,
  today,
  isSelected,
  onPickDay,
}: {
  initial: string;
  today: string;
  isSelected: (key: string) => boolean;
  onPickDay: (key: string) => void;
}) {
  const initialDate = parseDateKey(initial > today ? today : initial);
  const [view, setView] = useState({ y: initialDate.getFullYear(), m: initialDate.getMonth() });

  const first = new Date(view.y, view.m, 1);
  const gridStart = mondayKey(localDateKey(first));
  const days = Array.from({ length: 42 }, (_, i) => shiftDateKey(gridStart, i));
  const todayDate = parseDateKey(today);
  const nextDisabled = view.y === todayDate.getFullYear() && view.m >= todayDate.getMonth();
  const monthLabel = first.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  function shiftMonth(dir: number) {
    const d = new Date(view.y, view.m + dir, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  }

  return (
    <div className="flex w-[17.5rem] flex-col gap-2">
      <PagerHeader
        label={monthLabel}
        onPrev={() => shiftMonth(-1)}
        onNext={() => shiftMonth(1)}
        nextDisabled={nextDisabled}
      />
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((key) => {
          const d = parseDateKey(key);
          const inMonth = d.getMonth() === view.m;
          const future = key > today;
          const selected = isSelected(key);
          return (
            <button
              key={key}
              type="button"
              disabled={future}
              aria-label={key}
              aria-pressed={selected}
              onClick={() => onPickDay(key)}
              className={cn(
                `h-8 text-sm tabular-nums transition-colors disabled:pointer-events-none disabled:opacity-30 ${FOCUS_RING}`,
                selected ? "bg-primary/25 text-foreground" : "hover:bg-accent",
                !inMonth && "text-muted-foreground",
                key === today && "font-bold underline underline-offset-4",
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
