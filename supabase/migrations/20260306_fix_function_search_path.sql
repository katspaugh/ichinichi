-- Fix search_path security warning for functions
-- Sets search_path to empty string to prevent search_path injection attacks

-- 1) Fix set_server_updated_at
create or replace function public.set_server_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_updated_at := now();
  return new;
end;
$$;

-- 2) Fix set_user_keyrings_updated_at
create or replace function public.set_user_keyrings_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 3) Fix set_note_images_server_updated_at
create or replace function public.set_note_images_server_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_updated_at := now();
  return new;
end;
$$;
