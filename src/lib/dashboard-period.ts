import { localDateKey, parseDateKey, shiftDateKey } from "@/lib/tally-dates";

// Dashboard period selection. All dates are "YYYY-MM-DD" keys in the viewer's
// local timezone. Weeks run Monday to Sunday.

export type PeriodKind = "week" | "month" | "quarter" | "year";

export type Period =
  | { kind: PeriodKind; anchor: string } // anchor = first day of the period
  | { kind: "all" }
  | { kind: "custom"; start: string; end: string }; // both are week Mondays

export type DateRange = { start: string | null; end: string }; // end inclusive

export type Granularity = "day" | "week" | "month";

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function keyOf(y: number, m: number, d: number): string {
  return localDateKey(new Date(y, m, d));
}

export function mondayKey(key: string): string {
  const d = parseDateKey(key);
  const diff = (d.getDay() === 0 ? -6 : 1) - d.getDay();
  return keyOf(d.getFullYear(), d.getMonth(), d.getDate() + diff);
}

export function anchorFor(kind: PeriodKind, key: string): string {
  const d = parseDateKey(key);
  if (kind === "week") return mondayKey(key);
  if (kind === "month") return keyOf(d.getFullYear(), d.getMonth(), 1);
  if (kind === "quarter") return keyOf(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
  return keyOf(d.getFullYear(), 0, 1);
}

export function periodContaining(kind: PeriodKind, key: string): Period {
  return { kind, anchor: anchorFor(kind, key) };
}

export function resolvePeriod(p: Period, today: string = localDateKey()): DateRange {
  if (p.kind === "all") return { start: null, end: today };
  if (p.kind === "custom") return { start: p.start, end: shiftDateKey(p.end, 6) };
  const d = parseDateKey(p.anchor);
  const y = d.getFullYear();
  const m = d.getMonth();
  if (p.kind === "week") return { start: p.anchor, end: shiftDateKey(p.anchor, 6) };
  if (p.kind === "month") return { start: p.anchor, end: keyOf(y, m + 1, 0) };
  if (p.kind === "quarter") return { start: p.anchor, end: keyOf(y, m + 3, 0) };
  return { start: p.anchor, end: keyOf(y, 11, 31) };
}

// The preceding period of the same length, or null for All Time.
export function previousRange(p: Period): DateRange | null {
  if (p.kind === "all") return null;
  if (p.kind === "custom") {
    const range = resolvePeriod(p);
    const days = daysBetween(range.start as string, range.end) + 1;
    return { start: shiftDateKey(p.start, -days), end: shiftDateKey(p.start, -1) };
  }
  return resolvePeriod(stepPeriod(p, -1));
}

export function daysBetween(a: string, b: string): number {
  const ms = parseDateKey(b).getTime() - parseDateKey(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function stepPeriod(p: Period, dir: 1 | -1): Period {
  if (p.kind === "all" || p.kind === "custom") return p;
  const d = parseDateKey(p.anchor);
  const y = d.getFullYear();
  const m = d.getMonth();
  if (p.kind === "week") return { kind: "week", anchor: shiftDateKey(p.anchor, 7 * dir) };
  if (p.kind === "month") return { kind: "month", anchor: keyOf(y, m + dir, 1) };
  if (p.kind === "quarter") return { kind: "quarter", anchor: keyOf(y, m + 3 * dir, 1) };
  return { kind: "year", anchor: keyOf(y + dir, 0, 1) };
}

export function canStepForward(p: Period, today: string = localDateKey()): boolean {
  if (p.kind === "all" || p.kind === "custom") return false;
  return (resolvePeriod(stepPeriod(p, 1)).start as string) <= today;
}

export function granularityFor(p: Period): Granularity {
  if (p.kind === "week") return "day";
  if (p.kind === "month" || p.kind === "quarter") return "week";
  if (p.kind === "custom") {
    const weeks = (daysBetween(p.start, p.end) / 7) + 1;
    if (weeks <= 1) return "day";
    return weeks <= 26 ? "week" : "month";
  }
  return "month";
}

function fmtShort(key: string, withYear = false): string {
  return parseDateKey(key).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

function fmtRange(start: string, end: string): string {
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return sameYear
    ? `${fmtShort(start)} – ${fmtShort(end)}, ${end.slice(0, 4)}`
    : `${fmtShort(start, true)} – ${fmtShort(end, true)}`;
}

export function periodLabel(p: Period): string {
  if (p.kind === "all") return "All time";
  const range = resolvePeriod(p);
  const start = range.start as string;
  if (p.kind === "week") return `Week of ${fmtRange(start, range.end)}`;
  if (p.kind === "custom") return fmtRange(start, range.end);
  const d = parseDateKey(p.anchor);
  if (p.kind === "month") return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
  if (p.kind === "quarter") return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
  return String(d.getFullYear());
}

export function rangeLabel(r: DateRange): string {
  return r.start ? fmtRange(r.start, r.end) : "";
}

// ---- URL hash: #week-2026-09-22, #month-2026-09, #quarter-2026-q3,
// #year-2026, #all, #custom-2026-09-01_2026-09-28 -------------------------

export function periodToHash(p: Period): string {
  if (p.kind === "all") return "#all";
  if (p.kind === "custom") return `#custom-${p.start}_${p.end}`;
  if (p.kind === "week") return `#week-${p.anchor}`;
  if (p.kind === "month") return `#month-${p.anchor.slice(0, 7)}`;
  if (p.kind === "year") return `#year-${p.anchor.slice(0, 4)}`;
  const q = Math.floor(parseDateKey(p.anchor).getMonth() / 3) + 1;
  return `#quarter-${p.anchor.slice(0, 4)}-q${q}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(key: string): boolean {
  return DATE_RE.test(key) && localDateKey(parseDateKey(key)) === key;
}

// Parses a location hash; returns null if it isn't a recognised period.
// Anything after today is clamped back to the current period.
export function periodFromHash(hash: string, today: string = localDateKey()): Period | null {
  const h = hash.replace(/^#/, "").toLowerCase();
  if (h === "all") return { kind: "all" };

  let m = /^week-(\d{4}-\d{2}-\d{2})$/.exec(h);
  if (m && validDate(m[1])) return clampPeriod(periodContaining("week", m[1]), today);

  m = /^month-(\d{4})-(\d{2})$/.exec(h);
  if (m && +m[2] >= 1 && +m[2] <= 12) {
    return clampPeriod(periodContaining("month", `${m[1]}-${m[2]}-01`), today);
  }

  m = /^quarter-(\d{4})-q([1-4])$/.exec(h);
  if (m) {
    const month = String((+m[2] - 1) * 3 + 1).padStart(2, "0");
    return clampPeriod(periodContaining("quarter", `${m[1]}-${month}-01`), today);
  }

  m = /^year-(\d{4})$/.exec(h);
  if (m) return clampPeriod(periodContaining("year", `${m[1]}-01-01`), today);

  m = /^custom-(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(h);
  if (m && validDate(m[1]) && validDate(m[2])) {
    return clampPeriod({ kind: "custom", start: mondayKey(m[1]), end: mondayKey(m[2]) }, today);
  }
  return null;
}

export function clampPeriod(p: Period, today: string = localDateKey()): Period {
  if (p.kind === "all") return p;
  if (p.kind === "custom") {
    const thisMonday = mondayKey(today);
    let start = p.start > thisMonday ? thisMonday : p.start;
    let end = p.end > thisMonday ? thisMonday : p.end;
    if (start > end) [start, end] = [end, start];
    return { kind: "custom", start, end };
  }
  return (resolvePeriod(p).start as string) > today ? periodContaining(p.kind, today) : p;
}

export function defaultPeriod(today: string = localDateKey()): Period {
  return periodContaining("month", today);
}

// Switching period type keeps you near where you were: the new period contains
// the end of the current one (capped at today).
export function switchKind(
  current: Period,
  next: PeriodKind | "all" | "custom",
  today: string = localDateKey(),
): Period {
  if (next === "all") return { kind: "all" };
  const range = resolvePeriod(current, today);
  const ref = range.end > today ? today : range.end;
  if (next === "custom") {
    if (current.kind === "custom") return current;
    const end = mondayKey(ref);
    const start = current.kind === "all" ? shiftDateKey(end, -21) : mondayKey(range.start as string);
    return clampPeriod({ kind: "custom", start, end }, today);
  }
  return periodContaining(next, ref);
}

// ---- Bucketing ------------------------------------------------------------

export function bucketKeyOf(dateKey: string, g: Granularity): string {
  if (g === "day") return dateKey;
  if (g === "week") return mondayKey(dateKey);
  return dateKey.slice(0, 7);
}

export function listBuckets(start: string, end: string, g: Granularity): string[] {
  const out: string[] = [];
  if (g === "day") {
    for (let k = start; k <= end; k = shiftDateKey(k, 1)) out.push(k);
  } else if (g === "week") {
    for (let k = mondayKey(start); k <= end; k = shiftDateKey(k, 7)) out.push(k);
  } else {
    const s = parseDateKey(start);
    const e = parseDateKey(end);
    for (let y = s.getFullYear(), m = s.getMonth(); y < e.getFullYear() || (y === e.getFullYear() && m <= e.getMonth()); ) {
      out.push(`${y}-${String(m + 1).padStart(2, "0")}`);
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
  }
  return out;
}

export function bucketLabel(key: string, g: Granularity): string {
  if (g === "day") {
    return parseDateKey(key).toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
  }
  if (g === "week") return fmtShort(key);
  const [y, mo] = key.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}
