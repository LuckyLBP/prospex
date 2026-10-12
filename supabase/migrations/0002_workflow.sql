-- Arbetsflöde: kontakter, samtalslogg, kalender. Allt är per användare.

create type public.contact_status as enum
  ('ej_svar','ring_tillbaka','mote_bokat','ej_intresserad','fel_nummer','kund');

create table public.contacts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  company_id     uuid not null references public.companies(id) on delete cascade,
  status         public.contact_status not null,
  note           text,
  last_called_at timestamptz,
  call_count     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, company_id)
);

create table public.call_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  outcome    public.contact_status not null,
  note       text,
  created_at timestamptz not null default now()
);

create table public.calendar_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  kind       text not null check (kind in ('aterringning','mote','ovrigt')),
  title      text not null,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.calendar_feeds (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  token      text not null unique,
  created_at timestamptz not null default now()
);

create index on public.contacts (user_id, status);
create index on public.call_logs (user_id, created_at desc);
create index on public.call_logs (company_id);
create index on public.calendar_events (user_id, starts_at);

alter table public.contacts        enable row level security;
alter table public.call_logs       enable row level security;
alter table public.calendar_events enable row level security;
alter table public.calendar_feeds  enable row level security;

create policy own_rows on public.contacts        for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on public.call_logs       for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on public.calendar_events for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on public.calendar_feeds  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
