-- Prospex: leverantörer, företag och signaler (kopplingen "företaget har X som leverantör").

create table public.suppliers (
  id          uuid primary key,
  slug        text not null unique,
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

create table public.companies (
  id            uuid primary key default gen_random_uuid(),
  dedupe_key    text not null unique,
  name          text,
  orgnr         text,
  phone         text,
  email         text,
  website       text,
  domain        text,
  registry      jsonb,            -- bolagsverksdata: SNI, adress, aktiv
  first_seen_at timestamptz,
  last_seen_at  timestamptz
);

create table public.company_signals (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  supplier_id   uuid not null references public.suppliers(id) on delete cascade,
  source_url    text,             -- sidan som visar signalen
  first_seen_at timestamptz,
  last_seen_at  timestamptz,
  unique (company_id, supplier_id)
);

create index on public.companies (orgnr) where orgnr is not null;
create index on public.company_signals (supplier_id);

-- Ingen publik åtkomst förrän policies finns. Service-rollen går förbi RLS.
alter table public.suppliers       enable row level security;
alter table public.companies       enable row level security;
alter table public.company_signals enable row level security;
