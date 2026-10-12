-- Byråer som källa: en byrå är en leverantör (kind = 'supplier') vars kunder är de företag vars sidfot visar den.
-- Metoden 'agency' samlar in kunderna och kontrollerar varje kandidat mot kundens egen webbplats innan den läggs in.
alter table public.suppliers drop constraint if exists suppliers_method_check;
alter table public.suppliers
  add constraint suppliers_method_check check (method in ('publicwww','viewdns','script','domainlist','googleplaces','agency'));

-- Kunder som någon tagit bort från en byrå. De läggs aldrig tillbaka av en senare körning.
create table if not exists public.supplier_rejections (
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  domain      text not null,
  created_at  timestamptz not null default now(),
  primary key (supplier_id, domain)
);

-- Som övriga tabeller: bara servern når den (direkt mot databasen), aldrig klienter med anon- eller användarnycklar.
alter table public.supplier_rejections enable row level security;
