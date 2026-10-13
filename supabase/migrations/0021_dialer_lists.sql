-- Den som ringer har en aktiv lista i "Att ringa": företagen i den ordning de byggdes, och var hen är. Då går det att
-- lämna ringläget och komma tillbaka dit man var, även på en annan enhet. Listan läggs på servern och kontrolleras mot
-- vilka företag som fortfarande får ringas när den läses in, så ett id i en sparad lista ger ingen åtkomst i sig.
create table if not exists public.dialer_lists (
  org_id       uuid not null references public.organizations(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  scope        jsonb not null,
  queue_order  text not null,
  ids          uuid[] not null,
  current_id   uuid,
  built_at     timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz,
  primary key (org_id, user_id)
);
-- Bara servern (postgres) läser och skriver. Ingen policy = ingen åtkomst via API:t.
alter table public.dialer_lists enable row level security;
