-- Insamling: körningar per källa, och spår av vilken körning som sist såg ett företag.
create table public.scrape_runs (
  id              uuid primary key default gen_random_uuid(),
  supplier_id     uuid not null references public.suppliers(id) on delete cascade,
  status          text not null default 'queued' check (status in ('queued','running','success','error')),
  stage           text not null default 'collect' check (stage in ('collect','enrich','done')),
  triggered_by    uuid references auth.users(id) on delete set null,  -- null när schemat startade den
  lease_token     uuid,
  chain_count     int not null default 0,
  cursor          jsonb,
  records_found   int not null default 0,
  records_new     int not null default 0,
  enrich_total    int not null default 0,
  enriched_count  int not null default 0,
  enrich_failed   int not null default 0,
  truncated       boolean not null default false,
  error           text,
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  heartbeat_at    timestamptz,
  finished_at     timestamptz
);
create index scrape_runs_supplier_idx on public.scrape_runs (supplier_id, created_at desc);
create index scrape_runs_active_idx on public.scrape_runs (supplier_id) where status in ('queued','running');
alter table public.scrape_runs enable row level security;

alter table public.company_signals
  add column raw jsonb,
  add column source_run_id uuid references public.scrape_runs(id) on delete set null;

-- Köer för berikningen, en gång per företag.
create index companies_enrich_queue_idx on public.companies (first_seen_at) where enriched_at is null and domain is not null;
create index companies_registry_queue_idx on public.companies (registry_checked_at nulls first) where orgnr is not null;
create index companies_audit_queue_idx on public.companies (first_seen_at) where site_audited_at is null and enriched_at is not null and domain is not null;

-- Extra mejladresser och telefonnummer som hittades på webbplatsen.
alter table public.companies add column if not exists enrichment jsonb;
