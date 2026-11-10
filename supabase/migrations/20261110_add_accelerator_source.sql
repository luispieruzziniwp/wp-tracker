-- Adds 'accelerator' (Accelerator/Incubator) as a lead source. Run this in the
-- Supabase SQL editor (or via `supabase db push`).

alter table public.events
  drop constraint if exists events_source_check;

alter table public.events
  add constraint events_source_check check (
    source is null or source in (
      'podcast',
      'networking',
      'referral',
      'inbound',
      'outbound',
      'accelerator'
    )
  );
