-- Fria anteckningar på ett företag, delade inom bolaget. Visas tillsammans med samtalsloggen som en tråd i ringläget.
create table public.company_notes (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null,
  user_email text not null,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index on public.company_notes (org_id, company_id, created_at desc);

alter table public.company_notes enable row level security;
create policy org_read on public.company_notes for select to authenticated using ((select public.is_member(org_id)));
create policy org_insert on public.company_notes for insert to authenticated
  with check ((select public.is_member(org_id)) and user_id = (select auth.uid()));
