-- Bolag som bett om kundlistan för en domän de spanat på (en plattform eller byrå). Källan (suppliers) är global och
-- delas: ett bolag som ber om en domän som redan söks kopplas bara till samma källa, och en ny körning startas inte.
create table if not exists public.list_requests (
  id           uuid primary key default gen_random_uuid(),
  domain       text not null,
  supplier_id  uuid not null references public.suppliers(id) on delete cascade,
  org_id       uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  profile_id   uuid references public.company_profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (domain, org_id)
);
create index if not exists list_requests_supplier_idx on public.list_requests (supplier_id);
create index if not exists list_requests_user_idx on public.list_requests (requested_by, created_at desc);
alter table public.list_requests enable row level security;
