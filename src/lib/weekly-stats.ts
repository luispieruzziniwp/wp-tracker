export type RangeOption = "month" | "quarter" | "year" | "all";

export const RANGE_OPTIONS: { value: RangeOption; label: string }[] = [
  { value: "month", label: "This Month" },
  { value: "quarter", label: "This Quarter" },
  { value: "year", label: "This Year" },
  { value: "all", label: "All Time" },
];

// Returns an ISO date (YYYY-MM-DD) lower bound for week_start, or null for "all".
export function rangeStartDate(range: RangeOption): string | null {
  const now = new Date();

  if (range === "month") {
    return toISODate(new Date(now.getFullYear(), now.getMonth(), 1));
  }

  if (range === "quarter") {
    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
    return toISODate(new Date(now.getFullYear(), quarterMonth, 1));
  }

  if (range === "year") {
    return toISODate(new Date(now.getFullYear(), 0, 1));
  }

  return null;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function formatWeekLabel(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

// Guards against divide-by-zero; returns null when the denominator is 0.
export function safeRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

export function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}
