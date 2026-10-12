-- Företag som lades in av insamlingen och av företagsprofilerna fick tomma datum eftersom kolumnerna saknade standard.
-- Standard från och med nu, och en ifyllnad av de rader som redan saknar dem (från källornas egna signaler).
alter table public.companies alter column first_seen_at set default now();
alter table public.companies alter column last_seen_at set default now();

update public.companies c set
  first_seen_at = coalesce(c.first_seen_at, (select min(s.first_seen_at) from public.company_signals s where s.company_id = c.id), now()),
  last_seen_at  = coalesce(c.last_seen_at,  (select max(s.last_seen_at)  from public.company_signals s where s.company_id = c.id), now())
where c.first_seen_at is null or c.last_seen_at is null;
