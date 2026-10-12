-- Byråer i stor skala: vad en körning kostade och hann med, vilka domäner som redan kontrollerats (så att en stor byrå
-- fylls på över flera körningar i stället för att kontrollera samma första kandidater om och om igen), och vilka
-- kunder som slutat visa byrån.

alter table public.scrape_runs add column if not exists credits_used int;
alter table public.scrape_runs add column if not exists cost_sek numeric(8,2);
alter table public.scrape_runs add column if not exists checked int;
alter table public.scrape_runs add column if not exists accepted int;
alter table public.scrape_runs add column if not exists rejected jsonb;

-- Senaste utfallet av kontrollen av en domän för en byrå. `misses` räknar följande körningar utan belägg.
create table if not exists public.supplier_checked (
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  domain      text not null,
  verdict     text not null,
  misses      int  not null default 0,
  checked_at  timestamptz not null default now(),
  primary key (supplier_id, domain)
);
alter table public.supplier_checked enable row level security;

-- Kunder som slutat visa byrån: tappade, eller bytt till en annan byrå. Ger en säljsignal och en historik.
create table if not exists public.supplier_customer_events (
  id          uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  company_id  uuid references public.companies(id) on delete set null,
  domain      text not null,
  kind        text not null check (kind in ('lost','switched')),
  to_name     text,
  at          timestamptz not null default now()
);
create index if not exists supplier_customer_events_supplier_idx on public.supplier_customer_events (supplier_id, at desc);
alter table public.supplier_customer_events enable row level security;
