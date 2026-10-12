-- Flerbolag: plattformsadmin / bolag (organizations) / medlem (memberships).
-- Katalogen (companies, suppliers, company_signals) är global. Allt arbetsflöde
-- (contacts, call_logs, claims) tillhör ett bolag och delas inom det.
-- contacts/call_logs var tomma när den här kördes, så de skapas om.

create extension if not exists citext with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Personer, bolag och medlemskap
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  email             extensions.citext not null,
  full_name         text,
  is_platform_admin boolean not null default false,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 2 and 120),
  slug       text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.memberships (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id),
  unique (user_id)          -- ett bolag per användare i v1
);

create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  email       extensions.citext not null,
  role        text not null check (role in ('owner','member')),
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  unique (org_id, email)
);
create index on public.invitations (email) where accepted_at is null;

-- ---------------------------------------------------------------------------
-- Katalogen får arbetsflödes- och berikningsfält
-- ---------------------------------------------------------------------------
alter table public.suppliers
  add column published       boolean not null default true,
  add column logo_path       text,
  add column method          text check (method in ('publicwww','viewdns','script','domainlist','googleplaces')),
  add column config          jsonb not null default '{}'::jsonb,
  add column enrich_sites    boolean not null default false,
  add column daily_run_limit int not null default 1,
  add column updated_at      timestamptz not null default now();

alter table public.companies
  add column site_audit         jsonb,
  add column site_audited_at    timestamptz,
  add column site_outdated      boolean,
  add column enriched_at        timestamptz,
  add column enrich_error       text,
  add column registry_checked_at timestamptz,
  add column search_text text generated always as (
    lower(coalesce(name,'') || ' ' || coalesce(domain,'') || ' ' || coalesce(email,'') || ' ' ||
          coalesce(phone,'') || ' ' || coalesce(orgnr,''))
  ) stored;
create index companies_search_trgm on public.companies using gin (search_text extensions.gin_trgm_ops);
create index companies_phone_idx on public.companies (phone) where phone is not null;

-- ---------------------------------------------------------------------------
-- Arbetsflödet, per bolag
-- ---------------------------------------------------------------------------
drop table public.call_logs;
drop table public.contacts;
drop type public.contact_status;

create table public.contacts (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  company_id           uuid not null references public.companies(id) on delete cascade,
  outcome              text check (outcome in ('no_answer','busy','wrong_number','callback','meeting_booked','customer',
                                               'not_interested','existing_customer','not_relevant','skip_number',
                                               'not_customer','no_website')),
  note                 text,
  last_called_at       timestamptz,
  last_called_by       uuid references auth.users(id) on delete set null,
  last_called_by_email text,
  call_count           int not null default 0,
  next_callback_at     timestamptz,
  callback_has_time    boolean not null default false,
  meeting_at           timestamptz,
  archived_at          timestamptz,
  archived_by          uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (org_id, company_id)
);
create index on public.contacts (org_id, last_called_by);
create index on public.contacts (org_id, next_callback_at) where next_callback_at is not null;
create index on public.contacts (org_id) where archived_at is not null;

-- Append-only: ingen update, ingen delete.
create table public.call_logs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  user_email  text not null,
  outcome     text not null check (outcome in ('no_answer','busy','wrong_number','callback','meeting_booked','customer',
                                               'not_interested','existing_customer','not_relevant','skip_number',
                                               'not_customer','no_website')),
  note        text check (char_length(note) <= 2000),
  callback_at timestamptz,
  meeting_at  timestamptz,
  called_at   timestamptz not null default now()
);
create index on public.call_logs (org_id, called_at desc);
create index on public.call_logs (company_id);
create index on public.call_logs (user_id, called_at desc);

alter table public.calendar_events add column org_id uuid not null references public.organizations(id) on delete cascade;
create index on public.calendar_events (org_id);

-- En reservation (lease, 5 min) per bolag och företag, så två säljare inte ringer samma.
create table public.claims (
  org_id         uuid not null references public.organizations(id) on delete cascade,
  company_id     uuid not null references public.companies(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  claimed_until  timestamptz not null,
  primary key (org_id, company_id)
);
create index on public.claims (user_id);

create table public.member_prefs (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  queue_order text not null default 'slump' check (queue_order in ('slump','namn','ort','nyast'))
);

-- ---------------------------------------------------------------------------
-- RLS. Servern går via pg-poolen (postgres) och filtrerar själv på org_id;
-- policies är skyddsnät om något någon gång läser direkt med användarens token.
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_platform_admin and p.active from public.profiles p where p.user_id = (select auth.uid())), false)
$$;

create or replace function public.is_member(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m join public.organizations o on o.id = m.org_id
     where m.org_id = org and m.user_id = (select auth.uid()) and o.active
  )
$$;
revoke execute on function public.is_platform_admin(), public.is_member(uuid) from public, anon;
grant execute on function public.is_platform_admin(), public.is_member(uuid) to authenticated;

alter table public.profiles       enable row level security;
alter table public.organizations  enable row level security;
alter table public.memberships    enable row level security;
alter table public.invitations    enable row level security;
alter table public.contacts       enable row level security;
alter table public.call_logs      enable row level security;
alter table public.claims         enable row level security;
alter table public.member_prefs   enable row level security;

create policy read_self_or_admin on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_platform_admin()));
create policy admin_all on public.profiles for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));

create policy read_member on public.organizations for select to authenticated
  using ((select public.is_member(id)) or (select public.is_platform_admin()));
create policy admin_all on public.organizations for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));

create policy read_own_org on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_member(org_id)) or (select public.is_platform_admin()));
create policy admin_all on public.memberships for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));

create policy admin_all on public.invitations for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));

create policy org_rows on public.contacts for all to authenticated
  using ((select public.is_member(org_id))) with check ((select public.is_member(org_id)));
create policy org_read on public.call_logs for select to authenticated using ((select public.is_member(org_id)));
create policy org_insert on public.call_logs for insert to authenticated
  with check ((select public.is_member(org_id)) and user_id = (select auth.uid()));
create policy org_rows on public.claims for all to authenticated
  using ((select public.is_member(org_id))) with check ((select public.is_member(org_id)));
create policy own_rows on public.member_prefs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
