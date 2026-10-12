-- Listor och kategorier. En lista är en källa av sorten 'list': företag som hör ihop genom en bransch eller
-- en plattform, inte genom en leverantör. Båda sorterna delar tabellen suppliers och company_signals, så
-- ringläget, kön, arkivet och exporten fungerar likadant för dem.

create table public.list_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  name        text not null check (char_length(name) between 2 and 80),
  description text,
  icon        text,                               -- namn på en lucide-ikon, visas när en lista saknar logotyp
  names_brand boolean not null default false,     -- listorna är uppkallade efter ett varumärke: visa "Vi har ingen koppling till X"
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.list_categories enable row level security;

alter table public.suppliers
  add column kind        text not null default 'supplier' check (kind in ('supplier','list')),
  add column category_id uuid references public.list_categories(id) on delete set null,
  add column sort        int not null default 0,
  add constraint suppliers_category_only_for_lists check (kind = 'list' or category_id is null);
create index suppliers_kind_idx on public.suppliers (kind, published);

insert into public.list_categories (slug, name, description, icon, names_brand, sort) values
  ('bransch',   'Bransch',   'Företag i en bransch, samlade per ort.', 'Briefcase', false, 10),
  ('plattform', 'Plattform', 'Företag som byggt sin webbplats själva i ett verktyg, utan byrå.', 'Layers', true, 20);

update public.suppliers set kind = 'list', category_id = (select id from public.list_categories where slug = 'bransch')
 where slug = 'redovisningsbyraer';
update public.suppliers set kind = 'list', category_id = (select id from public.list_categories where slug = 'plattform')
 where slug in ('wix', 'godaddy', 'wordpress-divi');

-- Publiceringsflaggan importerades aldrig. Exempel är testdata och No Sleep var inte publicerad i den gamla portalen.
update public.suppliers set published = false where slug in ('exempel', 'no-sleep');
