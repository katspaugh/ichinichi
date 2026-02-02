-- Initial database setup for Ichinichi (clean slate)

create extension if not exists "pgcrypto";

-- 1) Notes table - encrypted note content with multi-key support
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  key_id text not null,
  ciphertext text not null,
  nonce text not null,
  revision integer not null default 1,
  updated_at timestamptz not null,
  server_updated_at timestamptz,
  deleted boolean not null default false,

  unique(user_id, date)
);

create index if not exists notes_user_id_idx on public.notes(user_id);
create index if not exists notes_user_date_idx on public.notes(user_id, date);
create index if not exists notes_user_id_deleted_idx on public.notes(user_id, deleted);
create index if not exists notes_user_server_updated_at_idx on public.notes(user_id, server_updated_at);
create index if not exists notes_user_key_id_idx on public.notes(user_id, key_id);

alter table public.notes enable row level security;

create policy "notes_select_own"
  on public.notes
  for select
  using (user_id = auth.uid());

create policy "notes_insert_own"
  on public.notes
  for insert
  with check (user_id = auth.uid());

create policy "notes_update_own"
  on public.notes
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "notes_delete_own"
  on public.notes
  for delete
  using (user_id = auth.uid());

create or replace function public.set_server_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.server_updated_at := now();
  return new;
end;
$$;

drop trigger if exists notes_set_server_updated_at on public.notes;
create trigger notes_set_server_updated_at
before insert or update on public.notes
for each row execute function public.set_server_updated_at();

-- 2) User keyrings table - stores wrapped DEKs (multi-key support)
create table if not exists public.user_keyrings (
  user_id uuid not null references auth.users(id) on delete cascade,
  key_id text not null,
  wrapped_dek text not null,
  dek_iv text not null,
  kdf_salt text not null,
  kdf_iterations integer not null,
  version integer not null default 1,
  is_primary boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (user_id, key_id)
);

alter table public.user_keyrings enable row level security;

create policy "user_keyrings_select_own"
  on public.user_keyrings
  for select
  using (user_id = auth.uid());

create policy "user_keyrings_insert_own"
  on public.user_keyrings
  for insert
  with check (user_id = auth.uid());

create policy "user_keyrings_update_own"
  on public.user_keyrings
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.set_user_keyrings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_keyrings_set_updated_at on public.user_keyrings;
create trigger user_keyrings_set_updated_at
before update on public.user_keyrings
for each row execute function public.set_user_keyrings_updated_at();

create index if not exists user_keyrings_user_primary_idx
on public.user_keyrings(user_id, is_primary);

-- 3) Storage bucket for encrypted images
insert into storage.buckets (id, name, public)
values ('note-images', 'note-images', false)
on conflict (id) do nothing;

drop policy if exists "Users can view own images" on storage.objects;
create policy "Users can view own images"
on storage.objects for select
using (
  bucket_id = 'note-images' and
  auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Users can upload own images" on storage.objects;
create policy "Users can upload own images"
on storage.objects for insert
with check (
  bucket_id = 'note-images' and
  auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Users can delete own images" on storage.objects;
create policy "Users can delete own images"
on storage.objects for delete
using (
  bucket_id = 'note-images' and
  auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Users can update own images" on storage.objects;
create policy "Users can update own images"
on storage.objects for update
using (
  bucket_id = 'note-images' and
  auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'note-images' and
  auth.uid()::text = (storage.foldername(name))[1]
);

-- 4) note_images metadata table
create table if not exists public.note_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note_date text not null,
  type text not null check (type in ('background', 'inline')),
  filename text not null,
  mime_type text not null,
  width integer,
  height integer,
  size integer,
  storage_path text,
  ciphertext_path text,
  thumb_path text,
  sha256 text,
  nonce text,
  thumb_nonce text,
  key_id text,
  server_updated_at timestamptz,
  deleted boolean not null default false,
  created_at timestamptz default now()
);

alter table public.note_images enable row level security;

drop policy if exists "Users can view own image metadata" on public.note_images;
create policy "Users can view own image metadata"
on public.note_images for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own image metadata" on public.note_images;
create policy "Users can insert own image metadata"
on public.note_images for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own image metadata" on public.note_images;
create policy "Users can update own image metadata"
on public.note_images for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own image metadata" on public.note_images;
create policy "Users can delete own image metadata"
on public.note_images for delete
using (auth.uid() = user_id);

create or replace function public.set_note_images_server_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.server_updated_at := now();
  return new;
end;
$$;

drop trigger if exists note_images_set_server_updated_at on public.note_images;
create trigger note_images_set_server_updated_at
before insert or update on public.note_images
for each row execute function public.set_note_images_server_updated_at();

create index if not exists note_images_user_date_idx
on public.note_images(user_id, note_date);

create index if not exists note_images_user_server_updated_at_idx
on public.note_images(user_id, server_updated_at);
