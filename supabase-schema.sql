create table if not exists public.participants (
  id            bigint generated always as identity primary key,
  full_name     text not null,
  email         text not null unique,
  contact       text not null,
  age           smallint not null check (age between 5 and 100),
  gender        text not null check (gender in ('Male', 'Female', 'Other')),
  category      text not null check (category in ('3K', '5K', '10K')),
  shirt_size    text not null check (shirt_size in ('XS', 'S', 'M', 'L', 'XL', '2XL')),
  status        text not null default 'Pending' check (status in ('Pending', 'Confirmed', 'Cancelled')),
  registered_at timestamptz not null default now()
);

alter table public.participants enable row level security;

create table if not exists public.event_settings (
  id         smallint primary key default 1 check (id = 1),
  event_date date,
  updated_at timestamptz not null default now()
);

alter table public.event_settings enable row level security;

insert into public.event_settings (id) values (1) on conflict do nothing;
