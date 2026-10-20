-- Minne för "vem har byggt den här sajten", utifrån servern den ligger på. Varje uppslag sparas (också när svaret är att
-- servern bara är en webbhotell eller oklar), så att nästa profil på samma server inte kostar något.
create table if not exists public.server_hosts (
  ip                 text primary key,
  site_count         int not null default 0,
  verdict            text not null check (verdict in ('agency', 'host', 'unclear')),
  agency_name        text,
  agency_domain      text,
  agency_supplier_id uuid references public.suppliers(id) on delete set null,
  -- Provet: hur många sajter som lästes, hur många som hade samma kredit, och några exempel att öppna själv.
  evidence           jsonb,
  looked_up_at       timestamptz not null default now(),
  -- Satt när en admin publicerat byrån (bekräftat) eller avvisat den (verdict blir 'host').
  confirmed_at       timestamptz
);
create index if not exists server_hosts_looked_up_idx on public.server_hosts (looked_up_at desc);
create index if not exists server_hosts_agency_domain_idx on public.server_hosts (agency_domain);
create index if not exists server_hosts_supplier_idx on public.server_hosts (agency_supplier_id);
alter table public.server_hosts enable row level security;

-- Vilka adresser en domän pekat på när vi senast tittade. Med tiden räcker den här tabellen för att svara på "vilka
-- sajter ligger på samma server" utan ett betalt uppslag.
create table if not exists public.site_ips (
  domain  text not null,
  ip      text not null,
  seen_at timestamptz not null default now(),
  primary key (domain, ip)
);
create index if not exists site_ips_ip_idx on public.site_ips (ip);
alter table public.site_ips enable row level security;
