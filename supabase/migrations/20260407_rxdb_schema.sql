-- Phase 1: Add _modified and _deleted columns for RxDB replication
-- BACKWARDS-COMPATIBLE: keeps old triggers and RPCs alive so old clients still work.
-- Run Phase 2 (20260408_rxdb_cleanup.sql) after all clients are on the new code.

-- Enable moddatetime extension (required for auto-updating _modified on UPDATE)
create extension if not exists moddatetime with schema extensions;

-- ============================================================
-- notes table
-- ============================================================

-- Add _modified column (nullable initially so we can backfill)
alter table public.notes
  add column if not exists _modified timestamptz;

-- Backfill _modified from server_updated_at (fall back to now() if null)
update public.notes
  set _modified = coalesce(server_updated_at, now())
  where _modified is null;

-- Make _modified non-nullable with a default for future inserts
alter table public.notes
  alter column _modified set not null,
  alter column _modified set default now();

-- Add _deleted column, backfill from deleted
alter table public.notes
  add column if not exists _deleted boolean not null default false;

update public.notes
  set _deleted = deleted
  where _deleted <> deleted;

-- Moddatetime trigger: auto-update _modified on UPDATE
-- (runs alongside the existing server_updated_at trigger — both work concurrently)
drop trigger if exists notes_moddatetime on public.notes;
create trigger notes_moddatetime
  before update on public.notes
  for each row
  execute function extensions.moddatetime(_modified);

-- Insert trigger: set _modified to now() on INSERT
create or replace function public.set_notes_modified_on_insert()
returns trigger
language plpgsql
as $$
begin
  new._modified := now();
  return new;
end;
$$;

drop trigger if exists notes_set_modified_on_insert on public.notes;
create trigger notes_set_modified_on_insert
  before insert on public.notes
  for each row
  execute function public.set_notes_modified_on_insert();

-- Index for RxDB cursor queries
create index if not exists notes_user_id_modified_idx
  on public.notes(user_id, _modified);

-- Add to supabase_realtime publication (skip if already a member)
do $$ begin
  alter publication supabase_realtime add table public.notes;
exception when duplicate_object then null;
end $$;

-- ============================================================
-- note_images table
-- ============================================================

-- Add _modified column (nullable initially so we can backfill)
alter table public.note_images
  add column if not exists _modified timestamptz;

-- Backfill _modified from server_updated_at (fall back to created_at or now())
update public.note_images
  set _modified = coalesce(server_updated_at, created_at, now())
  where _modified is null;

-- Make _modified non-nullable with a default for future inserts
alter table public.note_images
  alter column _modified set not null,
  alter column _modified set default now();

-- Add _deleted column, backfill from deleted
alter table public.note_images
  add column if not exists _deleted boolean not null default false;

update public.note_images
  set _deleted = deleted
  where _deleted <> deleted;

-- Moddatetime trigger: auto-update _modified on UPDATE
-- (runs alongside the existing server_updated_at trigger — both work concurrently)
drop trigger if exists note_images_moddatetime on public.note_images;
create trigger note_images_moddatetime
  before update on public.note_images
  for each row
  execute function extensions.moddatetime(_modified);

-- Insert trigger: set _modified to now() on INSERT
create or replace function public.set_note_images_modified_on_insert()
returns trigger
language plpgsql
as $$
begin
  new._modified := now();
  return new;
end;
$$;

drop trigger if exists note_images_set_modified_on_insert on public.note_images;
create trigger note_images_set_modified_on_insert
  before insert on public.note_images
  for each row
  execute function public.set_note_images_modified_on_insert();

-- Index for RxDB cursor queries
create index if not exists note_images_user_id_modified_idx
  on public.note_images(user_id, _modified);

-- Add to supabase_realtime publication (skip if already a member)
do $$ begin
  alter publication supabase_realtime add table public.note_images;
exception when duplicate_object then null;
end $$;
