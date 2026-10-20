-- Index för de heta frågorna: listornas sortering på namn, "senast sedd" per källa och sopningen av döda profiler.
create index if not exists companies_name_idx on public.companies (name, id);
create index if not exists company_signals_supplier_seen_idx on public.company_signals (supplier_id, last_seen_at);
create index if not exists company_profiles_active_idx on public.company_profiles (coalesce(heartbeat_at, created_at)) where status in ('queued', 'running');
