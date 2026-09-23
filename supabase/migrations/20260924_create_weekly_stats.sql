-- Creates weekly_stats for the Dashboard page. Run this in the Supabase SQL
-- editor (or via `supabase db push`) against the project referenced by
-- NEXT_PUBLIC_SUPABASE_URL.

create table if not exists public.weekly_stats (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  week_end date not null,
  connection_requests_sent integer not null default 0,
  connections_accepted integer not null default 0,
  leads_replied integer not null default 0,
  intro_calls_scheduled integer not null default 0,
  intro_calls_done integer not null default 0,
  podcast_calls_scheduled integer not null default 0,
  podcast_interviews_done integer not null default 0,
  sales_calls_scheduled integer not null default 0,
  sales_calls_done integer not null default 0,
  enrollments integer not null default 0,
  sales_amount numeric(12, 2) not null default 0,
  closed_through_podcast integer not null default 0,
  used_pc_pitch_to_close integer not null default 0,
  unique (week_start)
);

create index if not exists weekly_stats_week_start_idx
  on public.weekly_stats (week_start);

alter table public.weekly_stats enable row level security;

-- Only owner/ops profiles can read weekly stats (matches the Dashboard's
-- role gate in the app). Adjust to your existing RLS conventions if your
-- profiles/events policies use a different pattern.
drop policy if exists "weekly_stats_select_owner_ops" on public.weekly_stats;
create policy "weekly_stats_select_owner_ops"
  on public.weekly_stats
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('owner', 'ops')
    )
  );
