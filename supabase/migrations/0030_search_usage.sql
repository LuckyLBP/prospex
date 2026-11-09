-- Räknare för betalda söktjänster, så att ett tak går att hålla exakt och överleva omstarter. En rad per tjänst och månad (nyckeln är "brave:ÅÅÅÅ-MM"); `used`
-- räknar alla anrop som gjorts (också de som felade, eftersom tjänsten kan räkna dem). Taket ligger i koden/miljön.
create table if not exists public.search_usage (
  provider   text primary key,
  used       int not null default 0 check (used >= 0),
  updated_at timestamptz not null default now()
);
alter table public.search_usage enable row level security;
