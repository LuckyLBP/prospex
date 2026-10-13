-- Profil och inställningar för den som är inloggad: profilbild, förvald mall för nya listor i ringläget, och mejlpåminnelse
-- om dagens återringningar. Namnet (profiles.full_name) fanns redan men kunde inte ändras.
alter table public.profiles add column if not exists avatar_path text;

alter table public.member_prefs
  add column if not exists default_template text check (default_template in ('fresh','noanswer')),
  add column if not exists callback_email boolean not null default false,
  add column if not exists last_reminder_on date;
