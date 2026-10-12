-- Googles uppgifter om ett företag (betyg, öppettider, kategori), som en cache så att den delade kvoten räcker.
-- `places` är null när inget hämtats, och {"hit": null} när Google inte hade företaget.
alter table public.companies add column if not exists places jsonb;
alter table public.companies add column if not exists places_fetched_at timestamptz;
