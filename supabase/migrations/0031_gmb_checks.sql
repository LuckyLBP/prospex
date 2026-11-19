-- Vilka företag som har en Google-profil (Google Business Profile, förr Google My Business). En rad per företag, så att ett
-- företag inte kontrolleras om i onödan och så att listan "Utan Google-profil" kan byggas av det som kontrollerats.
-- state: 'has'    en träff på Google med rätt namn (och ort när den är känd), eller en länk till profilen på företagets sajt
--        'closed' träffen är permanent stängd: företaget är troligen nedlagt, inget lead
--        'none'   ingen träff som liknar företaget och ingen länk, och namnet ser ut som ett riktigt företagsnamn: troligen ingen profil
--        'unsure' inget säkert svar (namnet ser ut som en sidtitel eller träffarna liknar det): hamnar inte i listan
create table if not exists public.gmb_checks (
  company_id  uuid primary key references public.companies(id) on delete cascade,
  state       text not null check (state in ('has', 'closed', 'none', 'unsure')),
  via         text not null,
  place_id    text,
  place_name  text,
  maps_url    text,
  query       text,
  checked_at  timestamptz not null default now()
);
create index if not exists gmb_checks_state_idx on public.gmb_checks (state, checked_at desc);
alter table public.gmb_checks enable row level security;
