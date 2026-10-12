-- Företagsprofiler: en rad per profilerat företag, med profilen, beläggen den bygger på och vad bygget kostade.
-- Bara servern läser och skriver (ingen policy), som audit_log.
create table public.company_profiles (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid unique references public.companies(id) on delete set null,  -- tomt tills jobbet hittat företaget
  input         text not null,                                                   -- det som skrevs in (maskat för en enskild firma)
  input_kind    text not null check (input_kind in ('url','orgnr')),
  orgnr         text,                                                            -- XXXXXX-XXXX, eller ÅÅMMDD-**** för en enskild firma
  sole_trader   boolean not null default false,
  domain        text,
  name          text,
  status        text not null default 'queued' check (status in ('queued','running','done','error')),
  stage         text,                                                            -- resolve | registry | website | ai | save
  profile       jsonb,                                                           -- CompanyProfile v1
  facts         jsonb,                                                           -- beläggen F1..Fn
  pages         jsonb,                                                           -- [{url, status, bytes, via}], ingen HTML
  model         text,
  input_tokens  int,
  output_tokens int,
  steps         int,
  duration_ms   int,
  warnings      text[] not null default '{}',
  error         text,
  requested_by  uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  heartbeat_at  timestamptz,
  finished_at   timestamptz
);
create index company_profiles_recent_idx on public.company_profiles (coalesce(finished_at, created_at) desc);
create index company_profiles_domain_idx on public.company_profiles (domain) where domain is not null;
create index company_profiles_orgnr_idx on public.company_profiles (orgnr) where orgnr is not null and not sole_trader;
create index company_profiles_by_idx on public.company_profiles (requested_by, created_at desc);
alter table public.company_profiles enable row level security;
