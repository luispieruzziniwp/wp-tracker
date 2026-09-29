import type { EventSource } from "@/lib/supabase/database.types";

// Single source of truth for lead-source labels/colors — used on the Tally
// page (source popover, Today's log tags) and the Dashboard (By Source chart
// and table).
export const SOURCES: { key: EventSource; label: string; color: string }[] = [
  { key: "podcast", label: "Podcast", color: "#3FB8C9" },
  { key: "networking", label: "Networking", color: "#F2C46D" },
  { key: "referral", label: "Referral", color: "#4FD1A5" },
  { key: "inbound", label: "Inbound", color: "#9CC7D4" },
  { key: "outbound", label: "Outbound", color: "#1E8AB5" },
];

export const SOURCE_COLOR: Record<EventSource, string> = Object.fromEntries(
  SOURCES.map((s) => [s.key, s.color]),
) as Record<EventSource, string>;

export const SOURCE_LABEL: Record<EventSource, string> = Object.fromEntries(
  SOURCES.map((s) => [s.key, s.label]),
) as Record<EventSource, string>;
