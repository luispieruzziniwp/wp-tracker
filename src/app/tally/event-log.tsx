"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, Undo2 } from "lucide-react";
import type { EventBilling, EventSource, EventType } from "@/lib/supabase/database.types";
import { labelForEventType } from "@/lib/tally-events";
import { formatPaidAmount } from "@/lib/tally-dates";
import { SOURCE_COLOR, SOURCE_LABEL } from "@/lib/sources";

export type LogEvent = {
  id: string;
  user_id: string;
  type: EventType;
  occurred_at: string;
  source: EventSource | null;
  amount: number | null;
  billing: EventBilling | null;
  // First name of whoever logged it (null if their profile isn't readable).
  logged_by: string | null;
};

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function dotColor(type: EventType): string {
  if (type.endsWith("canceled") || type.endsWith("rescheduled")) return "#F07A7A";
  if (type === "verbal_agreement" || type === "paid" || type === "appointment_converted") return "#4FD1A5";
  if (type.endsWith("done") || type === "dial_answered" || type === "appointment_booked") return "#3FB8C9";
  return "#9CC7D4";
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function firstName(displayName: string | null | undefined): string | null {
  const first = displayName?.trim().split(/\s+/)[0];
  return first || null;
}

// The selected day's log: every visible event, newest first, scrolling inside
// the card. Each row can be deleted via an inline Yes / Cancel confirm.
export function EventLogCard({
  events,
  isPast,
  dateLabel,
  onDelete,
  undo,
  className = "",
}: {
  events: LogEvent[];
  isPast: boolean;
  dateLabel: string;
  // Resolves true only once the event has actually been deleted.
  onDelete: (id: string) => Promise<boolean>;
  undo?: { undoing: boolean; disabled: boolean; onUndo: () => void };
  className?: string;
}) {
  return (
    <div className={`flex min-h-[14rem] flex-col rounded-2xl border border-border bg-card p-5 ${className}`}>
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <h2 className="font-serif text-lg leading-none">
          {isPast ? `Log for ${dateLabel}` : "Today’s log"}
        </h2>
        {undo && (
          <button
            type="button"
            onClick={undo.onUndo}
            disabled={undo.undoing || undo.disabled}
            className={`flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent active:scale-[0.97] disabled:opacity-50 ${FOCUS_RING}`}
          >
            <Undo2 className="h-3.5 w-3.5" />
            {undo.undoing ? "Undoing…" : "Undo last"}
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 basis-0 overflow-y-auto">
        {events.length === 0 ? (
          <p className="text-sm" style={{ color: "#9CC7D4" }}>
            {isPast ? "Nothing logged on this date." : "Nothing logged yet today."}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {events.map((evt) => (
              <LogRow key={evt.id} evt={evt} onDelete={onDelete} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function LogRow({
  evt,
  onDelete,
}: {
  evt: LogEvent;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const label = labelForEventType(evt.type);
  const time = formatTime(evt.occurred_at);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  async function confirmDelete() {
    setBusy(true);
    const ok = await onDelete(evt.id);
    // On success the row unmounts; on failure it stays so it can be retried.
    if (!ok) {
      setBusy(false);
      setConfirming(false);
    }
  }

  function cancel() {
    setConfirming(false);
    // Return focus to the trash button once it is back.
    setTimeout(() => triggerRef.current?.focus(), 0);
  }

  if (confirming) {
    return (
      <li
        className="flex min-h-9 items-center gap-2.5 rounded-lg bg-accent/60 px-2 text-sm"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) cancel();
        }}
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor(evt.type) }}
          aria-hidden
        />
        <span className="flex-1 truncate font-medium" role="alert">
          Delete?
        </span>
        <button
          type="button"
          onClick={confirmDelete}
          disabled={busy}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-60 ${FOCUS_RING}`}
          style={{ backgroundColor: "#F07A7A", color: "#2B0B0B" }}
        >
          {busy ? "Deleting…" : "Yes"}
        </button>
        <button
          ref={cancelRef}
          type="button"
          onClick={cancel}
          disabled={busy}
          className={`rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-60 ${FOCUS_RING}`}
        >
          Cancel
        </button>
      </li>
    );
  }

  return (
    <li className="group flex min-h-9 items-center gap-2.5 rounded-lg px-2 text-sm">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: dotColor(evt.type) }}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate">
        {label}
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
      {evt.logged_by && (
        <span className="max-w-[5rem] shrink-0 truncate text-xs text-muted-foreground">
          {evt.logged_by}
        </span>
      )}
      <span className="shrink-0 text-xs tabular-nums" style={{ color: "#9CC7D4" }}>
        {time}
      </span>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Delete ${label.toLowerCase()} at ${time}`}
        onClick={() => setConfirming(true)}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[opacity,colors] hover:bg-accent hover:text-foreground focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100 ${FOCUS_RING}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
