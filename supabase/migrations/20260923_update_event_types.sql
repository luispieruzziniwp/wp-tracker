-- Update the events.type check constraint to match the new tally/setter event types.
-- Run this in the Supabase SQL editor (or via `supabase db push`) against the project
-- referenced by NEXT_PUBLIC_SUPABASE_URL.

alter table public.events
  drop constraint if exists events_type_check;

alter table public.events
  add constraint events_type_check check (
    type in (
      -- Sales Calls
      'sales_call_scheduled',
      'sales_call_done',
      'sales_call_canceled',
      -- Intro Calls
      'intro_call_scheduled',
      'intro_call_done',
      'intro_call_canceled',
      -- Podcast
      'podcast_scheduled',
      'podcast_done',
      'podcast_canceled',
      'podcast_rescheduled',
      -- Outcomes
      'verbal_agreement',
      'paid',
      -- Setter
      'dial',
      'dial_answered',
      'appointment_booked',
      'appointment_converted'
    )
  );
