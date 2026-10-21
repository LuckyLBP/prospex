-- Vilken version av reglerna som gav ett utslag. När reglerna blir bättre (VERIFY_RULES i lib/agencies/verify.ts höjs)
-- kontrolleras domäner som bedömts "utan kredit" eller "annan byrå" med äldre regler om i nästa körning, i stället för
-- först efter 30 dagar. Befintliga rader räknas som version 1.
alter table public.supplier_checked add column if not exists rules smallint not null default 1;
