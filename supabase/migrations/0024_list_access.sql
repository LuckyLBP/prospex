-- Fullständig bläddring i listorna för bolag som en admin öppnat den för. Av som standard: då visas bara de första raderna.
alter table public.organizations add column if not exists list_access boolean not null default false;
