-- Adds sale amount + billing cadence to events (used by "paid" taps). Run this
-- in the Supabase SQL editor (or via `supabase db push`).

alter table public.events
  add column if not exists amount numeric(12, 2);

alter table public.events
  add column if not exists billing text;

alter table public.events
  drop constraint if exists events_amount_check;

alter table public.events
  add constraint events_amount_check check (amount is null or amount > 0);

alter table public.events
  drop constraint if exists events_billing_check;

alter table public.events
  add constraint events_billing_check check (
    billing is null or billing in ('one_time', 'monthly')
  );
