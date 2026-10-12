-- Vad en domän i en sidfotskredit är: en byrå, en plattform som sajten körs på, ett webbhotell eller ett verktyg.
-- Minnet gör att varje domän bedöms en gång, och att en admin kan rätta en bedömning för gott.
create table if not exists public.credit_kinds (
  domain     text primary key,
  name       text,
  kind       text not null check (kind in ('agency','platform','hosting','tool','not-agency')),
  source     text not null check (source in ('ai','admin')),
  reason     text,
  decided_at timestamptz not null default now()
);
alter table public.credit_kinds enable row level security;

-- En körning kan lyckas och ändå ha hoppat över en källa (till exempel PublicWWW när kvoten är slut). Anteckningen visas i körpanelen.
alter table public.scrape_runs add column if not exists note text;
