-- Förfrågningar om åtkomst från startsidan. Bara servern (postgres) läser och skriver.
create table if not exists public.access_requests (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  company    text not null,
  message    text,
  ip         text,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
create index if not exists access_requests_created_idx on public.access_requests (created_at desc);
create index if not exists access_requests_open_idx on public.access_requests (created_at desc) where handled_at is null;
alter table public.access_requests enable row level security;

-- Samma begränsning som inloggningen, med en egen sort för förfrågningar.
alter table public.login_attempts drop constraint if exists login_attempts_kind_check;
alter table public.login_attempts add constraint login_attempts_kind_check check (kind in ('send','verify','request'));
