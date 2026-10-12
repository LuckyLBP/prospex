-- Begränsar inloggningsförsök (kodbegäran och kodkontroll) per adress och IP.
create table public.login_attempts (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('send','verify')),
  email      text not null,
  ip         text not null,
  created_at timestamptz not null default now()
);
create index on public.login_attempts (kind, email, created_at desc);
create index on public.login_attempts (kind, ip, created_at desc);

-- Bara servern (postgres) läser och skriver. Ingen policy = ingen åtkomst via API:t.
alter table public.login_attempts enable row level security;
