"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { TallyEventType, UserRole } from "@/lib/supabase/database.types";
import { TALLY_EVENTS, labelForEventType, startOfTodayISO } from "@/lib/tally-events";

type Counts = Record<TallyEventType, number>;

const EMPTY_COUNTS: Counts = {
  sales_call: 0,
  intro_call: 0,
  podcast_scheduled: 0,
  podcast_rescheduled: 0,
  podcast_canceled: 0,
  podcast_recorded: 0,
};

export default function TallyClient() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [pendingType, setPendingType] = useState<TallyEventType | null>(null);
  const [undoing, setUndoing] = useState(false);

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

    if (profile?.role === "owner" || profile?.role === "ops") {
      const { data: events } = await supabase
        .from("events")
        .select("type")
        .eq("user_id", user.id)
        .gte("occurred_at", startOfTodayISO());

      const next = { ...EMPTY_COUNTS };
      for (const row of events ?? []) {
        if (row.type in next) {
          next[row.type as TallyEventType] += 1;
        }
      }
      setCounts(next);
    }

    setLoading(false);
  }, [router, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleTap(type: TallyEventType) {
    setPendingType(type);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const { error } = await supabase.from("events").insert({
      user_id: user.id,
      type,
    });

    setPendingType(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    setCounts((c) => ({ ...c, [type]: c[type] + 1 }));
    toast.success(`Logged: ${labelForEventType(type)}`);
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

    if (last.type in EMPTY_COUNTS && last.occurred_at >= startOfTodayISO()) {
      const type = last.type as TallyEventType;
      setCounts((c) => ({ ...c, [type]: Math.max(0, c[type] - 1) }));
    }

    toast.success(`Undid last: ${labelForEventType(last.type)}`);
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

  if (role !== "owner" && role !== "ops") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-sm text-muted-foreground">
          This page isn&apos;t available for your role.
        </p>
        <Button variant="outline" onClick={handleSignOut}>
          Sign out
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Tally</h1>
          {displayName && (
            <p className="text-sm text-muted-foreground">{displayName}</p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={handleSignOut}>
          Sign out
        </Button>
      </header>

      <div className="grid grid-cols-1 gap-3">
        {TALLY_EVENTS.map(({ type, label }) => (
          <Button
            key={type}
            onClick={() => handleTap(type)}
            disabled={pendingType === type}
            className="flex h-24 flex-col items-center justify-center gap-1 text-base"
          >
            <span>{label}</span>
            <span className="text-2xl font-bold tabular-nums">
              {counts[type]}
            </span>
          </Button>
        ))}
      </div>

      <Button
        variant="outline"
        onClick={handleUndo}
        disabled={undoing}
        className="h-12"
      >
        {undoing ? "Undoing..." : "Undo last"}
      </Button>
    </main>
  );
}
