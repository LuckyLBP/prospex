-- Aktivitetslogg för plattformsadmin: vem gjorde vad, när. Bara servern skriver och läser (ingen policy).
create table public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid references auth.users(id) on delete set null,
  actor_email text not null,
  action      text not null,           -- t.ex. 'org.create', 'member.role', 'source.publish'
  entity      text not null,           -- 'org' | 'user' | 'source' | 'category' | 'invite'
  entity_id   text,
  entity_name text,
  details     jsonb
);
create index audit_log_at_idx on public.audit_log (at desc, id desc);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);
create index audit_log_actor_idx on public.audit_log (actor_email, at desc);
alter table public.audit_log enable row level security;
