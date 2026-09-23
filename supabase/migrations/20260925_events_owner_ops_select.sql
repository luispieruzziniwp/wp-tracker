-- The Dashboard merges weekly_stats with live taps from ALL reps, so
-- owner/ops profiles need to read every row in events, not just their own.
-- Run this in the Supabase SQL editor (or via `supabase db push`) against
-- the project referenced by NEXT_PUBLIC_SUPABASE_URL.
--
-- This is additive: it does not touch whatever self-select policy already
-- lets a rep read their own events for the Tally page.

drop policy if exists "events_select_owner_ops" on public.events;
create policy "events_select_owner_ops"
  on public.events
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
