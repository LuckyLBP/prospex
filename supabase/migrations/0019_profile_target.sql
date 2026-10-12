-- En skanning från Ringläge pekar ut vilket katalogföretag den gäller. Då hamnar resultatet på just den raden,
-- även när den saknar webbadress och org.nr (till exempel en rad från Eniro med bara namn och telefon).
alter table public.company_profiles
  add column if not exists target_company_id uuid references public.companies(id) on delete set null;
