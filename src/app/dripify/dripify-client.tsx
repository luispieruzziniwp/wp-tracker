"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { isMonday, lastWeekMonday, weekEndFor } from "@/lib/weekly-stats";

type DripifyRow = {
  week_start: string;
  connection_requests_sent: number;
  connections_accepted: number;
  leads_replied: number;
};

const FIELDS: {
  key: "connection_requests_sent" | "connections_accepted" | "leads_replied";
  label: string;
}[] = [
  { key: "connection_requests_sent", label: "Connection requests sent" },
  { key: "connections_accepted", label: "Connections accepted" },
  { key: "leads_replied", label: "Leads replied" },
];

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function DripifyClient() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [weekStart, setWeekStart] = useState(lastWeekMonday);
  const [values, setValues] = useState({
    connection_requests_sent: "",
    connections_accepted: "",
    leads_replied: "",
  });
  const [rows, setRows] = useState<DripifyRow[]>([]);
  const [saving, setSaving] = useState(false);

  const loadRole = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    setRole(profile?.role ?? null);
    setLoading(false);
  }, [router, supabase]);

  const loadRows = useCallback(async () => {
    const { data, error } = await supabase
      .from("weekly_stats")
      .select("week_start, connection_requests_sent, connections_accepted, leads_replied")
      .order("week_start", { ascending: false })
      .limit(12);

    if (error) {
      toast.error(error.message);
      return;
    }
    setRows(data ?? []);
  }, [supabase]);

  useEffect(() => {
    loadRole();
  }, [loadRole]);

  useEffect(() => {
    if (role === "owner" || role === "ops") loadRows();
  }, [role, loadRows]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  function loadRow(row: DripifyRow) {
    setWeekStart(row.week_start);
    setValues({
      connection_requests_sent: String(row.connection_requests_sent),
      connections_accepted: String(row.connections_accepted),
      leads_replied: String(row.leads_replied),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    if (!weekStart || !isMonday(weekStart)) {
      toast.error("Week starting must be a Monday.");
      return;
    }

    const parsed = {
      connection_requests_sent: Number(values.connection_requests_sent),
      connections_accepted: Number(values.connections_accepted),
      leads_replied: Number(values.leads_replied),
    };
    for (const n of Object.values(parsed)) {
      if (!Number.isInteger(n) || n < 0) {
        toast.error("Enter whole numbers of 0 or more in every field.");
        return;
      }
    }

    setSaving(true);
    // Payload carries only week keys + the three Dripify columns, so on
    // conflict Postgres updates just those; other columns keep their values
    // (and default to 0 when the row is new).
    const { error } = await supabase.from("weekly_stats").upsert(
      {
        week_start: weekStart,
        week_end: weekEndFor(weekStart),
        ...parsed,
      },
      { onConflict: "week_start" },
    );
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Saved week of ${formatDate(weekStart)}`);
    loadRows();
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
      <AppShell role={role} onSignOut={handleSignOut}>
        <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
          <p className="text-sm text-muted-foreground">
            This page isn&apos;t available for your role.
          </p>
        </div>
      </AppShell>
    );
  }

  const weekInvalid = weekStart !== "" && !isMonday(weekStart);

  return (
    <AppShell role={role} onSignOut={handleSignOut}>
      <div className="flex flex-col gap-6">
        <h1 className="font-serif text-2xl tracking-tight">Dripify</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Weekly entry</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="week_start">Week starting (Monday)</Label>
                <Input
                  id="week_start"
                  type="date"
                  value={weekStart}
                  onChange={(e) => setWeekStart(e.target.value)}
                  required
                  className="[color-scheme:dark] md:max-w-xs"
                />
                {weekInvalid ? (
                  <p className="text-xs text-destructive">Pick a Monday.</p>
                ) : weekStart ? (
                  <p className="text-xs text-muted-foreground">
                    {formatDate(weekStart)} – {formatDate(weekEndFor(weekStart))}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {FIELDS.map((f) => (
                  <div key={f.key} className="flex flex-col gap-1.5">
                    <Label htmlFor={f.key}>{f.label}</Label>
                    <Input
                      id={f.key}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      required
                      value={values[f.key]}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>

              <div>
                <Button type="submit" disabled={saving || weekInvalid}>
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Last 12 weeks</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No weeks recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Week of</th>
                      <th className="px-3 py-2 text-right font-medium">Requests</th>
                      <th className="px-3 py-2 text-right font-medium">Accepted</th>
                      <th className="py-2 pl-3 text-right font-medium">Replied</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.week_start}
                        onClick={() => loadRow(row)}
                        className={cn(
                          "cursor-pointer border-b transition-colors last:border-0 hover:bg-accent",
                          row.week_start === weekStart && "bg-accent",
                        )}
                      >
                        <td className="py-2 pr-3">{formatDate(row.week_start)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.connection_requests_sent}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.connections_accepted}
                        </td>
                        <td className="py-2 pl-3 text-right tabular-nums">{row.leads_replied}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
