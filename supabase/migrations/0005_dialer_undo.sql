-- Ångra senaste samtalet. call_logs.prev_state håller kontaktens tillstånd och de kalenderhändelser
-- som samtalet ersatte, så att ångra kan återställa exakt. Händelser som samtalet skapade tas bort
-- tillsammans med loggraden (on delete cascade).
alter table public.call_logs add column prev_state jsonb;
alter table public.calendar_events add column call_log_id uuid references public.call_logs(id) on delete cascade;
create index on public.calendar_events (call_log_id) where call_log_id is not null;
