-- Source tables read by the bokadirekt-table-sync and eniro-table-sync scripts.
-- They hold the output of an older one-off scrape that lives in the old
-- portal's database (random-db, tables bokadirekt_companies and eniro_companies)
-- and are filled by copying from there.
create table if not exists src_bokadirekt_companies (
  id bigint primary key,
  name text,
  rating numeric,
  review_count integer,
  street text,
  postal_code text,
  city text,
  phone text,
  email text,
  website text,
  bokadirekt_url text
);

create table if not exists src_eniro_companies (
  id bigint primary key,
  eniro_id text,
  name text,
  phone text,
  website text,
  eniro_url text,
  street text,
  postal_code text,
  city text,
  category text,
  rating_value numeric,
  rating_count integer
);

alter table src_bokadirekt_companies enable row level security;
alter table src_eniro_companies enable row level security;
