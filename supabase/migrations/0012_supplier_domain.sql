-- Domän på en källa, så att en plattform eller byrå som en webbplats länkar till går att koppla till vår katalog.
alter table public.suppliers add column if not exists domain text;
create index if not exists suppliers_domain_idx on public.suppliers (domain) where domain is not null;

update public.suppliers set domain = v.domain
from (values ('brabyggare','brabyggare.se'), ('servicefinder','servicefinder.se'), ('dorunner','dorunner.se'), ('boka-se','boka.se'), ('bokadirekt','bokadirekt.se'), ('eniro','eniro.se')) as v(slug, domain)
where suppliers.slug = v.slug and suppliers.domain is null;

-- Logotyper som hämtats från webbplatser (en byrås eller ett företags egen logotyp), så att samma domän inte hämtas två gånger.
create table if not exists public.web_logos (
  domain      text primary key,
  path        text,                                  -- fil i bucketen supplier-logos, tomt när ingen logotyp hittades
  source      text,                                  -- adressen logotypen hämtades från
  fetched_at  timestamptz not null default now()
);
alter table public.web_logos enable row level security;
