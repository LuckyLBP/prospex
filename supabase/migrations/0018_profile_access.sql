-- Företagsprofil för bolag som en admin öppnat den för (prova själv). Av som standard.
alter table public.organizations add column if not exists profile_access boolean not null default false;

-- Vilka profiler ett bolag ser: de de själva skapat eller uppdaterat. Profilerna är globala, men ett bolag ser inte
-- andra bolags efterforskningar.
create table if not exists public.profile_org_access (
  profile_id uuid not null references public.company_profiles(id) on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, org_id)
);
create index if not exists profile_org_access_org_idx on public.profile_org_access (org_id, created_at desc);
alter table public.profile_org_access enable row level security;
