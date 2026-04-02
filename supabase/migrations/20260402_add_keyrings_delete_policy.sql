-- Add missing DELETE policy for user_keyrings table.
-- Without this, RLS silently blocks all deletes (no error, 0 rows affected).
create policy "user_keyrings_delete_own"
  on public.user_keyrings
  for delete
  using (user_id = (select auth.uid()));
