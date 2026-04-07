-- Phase 2: Drop legacy triggers and RPCs
-- Run AFTER all clients are on the new RxDB-based code.
-- Phase 1 (20260407_rxdb_schema.sql) must have been applied first.

-- Drop old server_updated_at triggers (replaced by moddatetime on _modified)
drop trigger if exists notes_set_server_updated_at on public.notes;
drop trigger if exists note_images_set_server_updated_at on public.note_images;

-- Drop legacy RPC functions (replication plugin does direct upserts)
drop function if exists public.push_note(jsonb);
drop function if exists public.delete_note(uuid);
