-- The Dripify page upserts weekly_stats rows (insert + update), so owner/ops
-- profiles need write access in addition to the existing select policy.
-- Run this in the Supabase SQL editor (or via `supabase db push`) against
-- the project referenced by NEXT_PUBLIC_SUPABASE_URL.

drop policy if exists "weekly_stats_insert_owner_ops" on public.weekly_stats;
create policy "weekly_stats_insert_owner_ops"
  on public.weekly_stats
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('owner', 'ops')
    )
  );

drop policy if exists "weekly_stats_update_owner_ops" on public.weekly_stats;
create policy "weekly_stats_update_owner_ops"
  on public.weekly_stats
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('owner', 'ops')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('owner', 'ops')
    )
  );
