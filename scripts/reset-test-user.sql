-- Reset cloud data for the e2e test user.
-- Replace the user_id if needed.
begin;

delete from public.note_images
where user_id = 'f451799b-399f-49d4-b271-adfb327f5826';

delete from public.notes
where user_id = 'f451799b-399f-49d4-b271-adfb327f5826';

delete from public.user_keyrings
where user_id = 'f451799b-399f-49d4-b271-adfb327f5826';

commit;
