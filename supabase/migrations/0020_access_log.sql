-- Vad en användare tagit del av: varje företag vars uppgifter släppts till henne (ett per dygn), samt sökningar och
-- listvisningar för hastighetsgränser. Underlag för dygnsgränsen, adminvyn "Åtkomst" och för att kunna spåra ett läckage.
create table if not exists public.access_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  org_id     uuid references public.organizations(id) on delete set null,
  kind       text not null check (kind in ('view','search','list')),
  company_id uuid references public.companies(id) on delete cascade,
  at         timestamptz not null default now()
);
create index if not exists access_log_user_idx on public.access_log (user_id, kind, at desc);
create index if not exists access_log_at_idx on public.access_log (at);
-- Bara servern (postgres) läser och skriver. Ingen policy = ingen åtkomst via API:t.
alter table public.access_log enable row level security;
