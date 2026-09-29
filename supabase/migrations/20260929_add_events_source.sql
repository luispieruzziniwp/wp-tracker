-- Adds lead-source tracking to events. Run this in the Supabase SQL editor
-- (or via `supabase db push`) against the project referenced by
-- NEXT_PUBLIC_SUPABASE_URL.

alter table public.events
  add column if not exists source text;

alter table public.events
  drop constraint if exists events_source_check;

alter table public.events
  add constraint events_source_check check (
    source is null or source in (
      'podcast',
      'networking',
      'referral',
      'inbound',
      'outbound'
    )
  );
