-- Kontaktpersoner ur företagens egna webbplatser: namn, titel, direkt mejl och telefon, en förminskad bild och sidan
-- där personen står. Bara det företaget själv publicerar. En admin kan ta bort en person, och då läggs den inte tillbaka.

create table if not exists public.company_people (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  name_key    text not null,
  role        text,
  email       text,
  phone       text,
  photo_path  text,
  photo_src   text,
  source_url  text not null,
  confidence  text not null check (confidence in ('hög','medel','låg')),
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (company_id, name_key)
);
create index if not exists company_people_company_idx on public.company_people (company_id);
alter table public.company_people enable row level security;

-- Personer som en admin tagit bort. Samma namn läggs inte tillbaka vid nästa bygge.
create table if not exists public.people_suppressed (
  company_id uuid not null references public.companies(id) on delete cascade,
  name_key   text not null,
  removed_at timestamptz not null default now(),
  primary key (company_id, name_key)
);
alter table public.people_suppressed enable row level security;
