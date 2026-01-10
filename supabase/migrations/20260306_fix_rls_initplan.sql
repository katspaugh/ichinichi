-- Fix RLS policies to use (select auth.uid()) for better performance
-- This prevents auth.uid() from being re-evaluated for each row

-- 1) Fix notes table policies
drop policy if exists "notes_select_own" on public.notes;
create policy "notes_select_own"
  on public.notes
  for select
  using (user_id = (select auth.uid()));

drop policy if exists "notes_insert_own" on public.notes;
create policy "notes_insert_own"
  on public.notes
  for insert
  with check (user_id = (select auth.uid()));

drop policy if exists "notes_update_own" on public.notes;
create policy "notes_update_own"
  on public.notes
  for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "notes_delete_own" on public.notes;
create policy "notes_delete_own"
  on public.notes
  for delete
  using (user_id = (select auth.uid()));

-- 2) Fix user_keyrings table policies
drop policy if exists "user_keyrings_select_own" on public.user_keyrings;
create policy "user_keyrings_select_own"
  on public.user_keyrings
  for select
  using (user_id = (select auth.uid()));

drop policy if exists "user_keyrings_insert_own" on public.user_keyrings;
create policy "user_keyrings_insert_own"
  on public.user_keyrings
  for insert
  with check (user_id = (select auth.uid()));

drop policy if exists "user_keyrings_update_own" on public.user_keyrings;
create policy "user_keyrings_update_own"
  on public.user_keyrings
  for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 3) Fix note_images table policies
drop policy if exists "Users can view own image metadata" on public.note_images;
create policy "Users can view own image metadata"
  on public.note_images
  for select
  using (user_id = (select auth.uid()));

drop policy if exists "Users can insert own image metadata" on public.note_images;
create policy "Users can insert own image metadata"
  on public.note_images
  for insert
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can update own image metadata" on public.note_images;
create policy "Users can update own image metadata"
  on public.note_images
  for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete own image metadata" on public.note_images;
create policy "Users can delete own image metadata"
  on public.note_images
  for delete
  using (user_id = (select auth.uid()));

-- 4) Fix storage.objects policies (same optimization)
drop policy if exists "Users can view own images" on storage.objects;
create policy "Users can view own images"
  on storage.objects
  for select
  using (
    bucket_id = 'note-images' and
    (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can upload own images" on storage.objects;
create policy "Users can upload own images"
  on storage.objects
  for insert
  with check (
    bucket_id = 'note-images' and
    (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete own images" on storage.objects;
create policy "Users can delete own images"
  on storage.objects
  for delete
  using (
    bucket_id = 'note-images' and
    (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update own images" on storage.objects;
create policy "Users can update own images"
  on storage.objects
  for update
  using (
    bucket_id = 'note-images' and
    (select auth.uid())::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'note-images' and
    (select auth.uid())::text = (storage.foldername(name))[1]
  );
