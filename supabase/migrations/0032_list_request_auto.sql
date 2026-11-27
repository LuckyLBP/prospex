-- Kundlistor som söks automatiskt när en spaning visar att företaget självt är en byrå (webb, media, annonser).
-- auto: begäran skapades av spaningen, inte av ett klick. En sådan lista publiceras först vid fler än 20 kunder.
-- notified_at: när den som spanade fick mejlet om att listan är publicerad. Null = inte skickat.
alter table public.list_requests
  add column if not exists auto boolean not null default false,
  add column if not exists notified_at timestamptz;
