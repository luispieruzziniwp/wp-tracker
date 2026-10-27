// Local-timezone date helpers for the Tally page's "log for a past date" control.

// "YYYY-MM-DD" in the viewer's local timezone.
export function localDateKey(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function shiftDateKey(key: string, days: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}

// [start, end) of a local calendar day, as ISO strings.
export function dayBoundsISO(key: string): { start: string; end: string } {
  const start = parseDateKey(key);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

// Backfilled taps land at 12:00 local on the chosen day.
export function noonISO(key: string): string {
  const d = parseDateKey(key);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

export function formatDateKeyLong(key: string): string {
  return parseDateKey(key).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatPaidAmount(amount: number, billing: "one_time" | "monthly"): string {
  return `${formatMoney(amount)}${billing === "monthly" ? "/mo" : ""}`;
}
