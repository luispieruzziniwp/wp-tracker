-- Lets owner/ops delete any rep's event from Today's log, and read the
-- display_name of the rep who logged it. Run this in the Supabase SQL editor
-- (or via `supabase db push`) against the project referenced by
-- NEXT_PUBLIC_SUPABASE_URL.
--
-- Additive: existing self-delete / self-select policies are untouched.
--
-- is_owner_or_ops() is security definer so the profiles policy below can
-- check the caller's role without recursing into profiles' own RLS.

create or replace function public.is_owner_or_ops()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('owner', 'ops')
  );
$$;

grant execute on function public.is_owner_or_ops() to authenticated;

drop policy if exists "events_delete_owner_ops" on public.events;
create policy "events_delete_owner_ops"
  on public.events
  for delete
  to authenticated
  using (public.is_owner_or_ops());

drop policy if exists "profiles_select_owner_ops" on public.profiles;
create policy "profiles_select_owner_ops"
  on public.profiles
  for select
  to authenticated
  using (public.is_owner_or_ops());
