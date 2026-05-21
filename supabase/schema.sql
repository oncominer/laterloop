create extension if not exists pgcrypto;

create table if not exists public.capsules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 32),
  recipient_name text not null check (char_length(recipient_name) between 1 and 48),
  title text not null check (char_length(title) between 1 and 72),
  unlock_at timestamptz not null check (unlock_at > created_at),
  delivery_method text not null check (delivery_method in ('email', 'sms')),
  delivery_target text not null,
  unlock_password_sent_at timestamptz,
  unlock_delivery_error text,
  created_at timestamptz not null default now()
);

alter table public.capsules
  add column if not exists unlock_password_sent_at timestamptz,
  add column if not exists unlock_delivery_error text;

create table if not exists public.capsule_letters (
  capsule_id uuid primary key references public.capsules(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);

create table if not exists public.reserved_pixels (
  id uuid primary key default gen_random_uuid(),
  capsule_id uuid not null references public.capsules(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null,
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  x integer not null,
  y integer not null,
  created_at timestamptz not null default now(),
  unique (x, y)
);

create table if not exists public.unlock_codes (
  id uuid primary key default gen_random_uuid(),
  capsule_id uuid not null references public.capsules(id) on delete cascade,
  password_hash text not null,
  delivery_target text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.capsules enable row level security;
alter table public.capsule_letters enable row level security;
alter table public.reserved_pixels enable row level security;
alter table public.unlock_codes enable row level security;

create policy "Capsule owners can insert"
  on public.capsules for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "Anonymous visitors can insert capsules"
  on public.capsules for insert
  to anon
  with check (owner_id is null);

create policy "Everyone can read capsule metadata"
  on public.capsules for select
  to anon, authenticated
  using (true);

create policy "Capsule owners can insert letters"
  on public.capsule_letters for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "Anonymous visitors can insert letters"
  on public.capsule_letters for insert
  to anon
  with check (owner_id is null);

create policy "Pixel owners can insert"
  on public.reserved_pixels for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "Anonymous visitors can insert pixels"
  on public.reserved_pixels for insert
  to anon
  with check (owner_id is null);

create policy "Everyone can view the pixel wall"
  on public.reserved_pixels for select
  to anon, authenticated
  using (true);

create index if not exists capsules_owner_created_idx on public.capsules (owner_id, created_at desc);
create index if not exists capsules_unlock_idx on public.capsules (unlock_at);
create index if not exists unlock_codes_capsule_idx on public.unlock_codes (capsule_id, expires_at);
