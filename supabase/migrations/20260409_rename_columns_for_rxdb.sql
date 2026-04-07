-- Rename Supabase columns to match RxDB schema property names.
-- The replicateSupabase plugin builds WHERE clauses from the RxDB schema,
-- so column names must match exactly.
-- Also set user_id DEFAULT so the plugin doesn't need to supply it on INSERT.
--
-- NOTE: _deleted and _modified are NOT renamed — the replicateSupabase plugin
-- hardcodes '_deleted' as the deletedField in the parent RxReplicationState
-- constructor and manages these columns internally.

-- ============================================================
-- notes table
-- ============================================================

-- Rename columns to match RxDB NoteDocType schema
alter table public.notes rename column ciphertext to content;
alter table public.notes rename column updated_at to "updatedAt";

-- Add isDeleted column for soft deletes (separate from _deleted which is
-- used by the RxDB replication protocol for hard deletes)
alter table public.notes
  add column if not exists "isDeleted" boolean not null default false;
update public.notes set "isDeleted" = _deleted where "isDeleted" <> _deleted;

-- Add weather column (always NULL in DB; weather data is embedded
-- in the encrypted content payload, but the RxDB schema declares it)
alter table public.notes add column if not exists weather jsonb;

-- Auto-populate user_id from JWT so the replication plugin doesn't
-- need to include it in INSERT payloads
alter table public.notes alter column user_id set default auth.uid();

-- ============================================================
-- note_images table
-- ============================================================

-- Rename columns to match RxDB ImageDocType schema
alter table public.note_images rename column note_date to "noteDate";
alter table public.note_images rename column mime_type to "mimeType";
alter table public.note_images rename column created_at to "createdAt";

-- Add isDeleted column for soft deletes (separate from _deleted)
alter table public.note_images
  add column if not exists "isDeleted" boolean not null default false;
update public.note_images set "isDeleted" = _deleted where "isDeleted" <> _deleted;

-- Auto-populate user_id from JWT
alter table public.note_images alter column user_id set default auth.uid();
