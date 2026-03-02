-- Server-enforced version gating for note sync
-- Atomic check-and-increment replaces client-side conflict resolution

-- push_note: insert (revision=1) or update (revision=expected+1), reject on mismatch
create or replace function public.push_note(
  p_id uuid,
  p_user_id uuid,
  p_date text,
  p_key_id text,
  p_ciphertext text,
  p_nonce text,
  p_revision integer,
  p_updated_at timestamptz,
  p_deleted boolean
)
returns public.notes
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.notes;
begin
  if p_user_id != (select auth.uid()) then
    raise exception 'AUTH_DENIED' using errcode = 'P0001';
  end if;

  if p_id is null then
    -- Insert path: new note, revision starts at 1
    insert into public.notes (user_id, date, key_id, ciphertext, nonce, revision, updated_at, deleted)
    values (p_user_id, p_date, p_key_id, p_ciphertext, p_nonce, 1, p_updated_at, coalesce(p_deleted, false))
    returning * into result;

    return result;
  end if;

  -- Update path: atomically check expected revision and increment
  update public.notes
  set key_id = p_key_id,
      ciphertext = p_ciphertext,
      nonce = p_nonce,
      revision = p_revision + 1,
      updated_at = p_updated_at,
      deleted = coalesce(p_deleted, false)
  where id = p_id
    and user_id = p_user_id
    and revision = p_revision
  returning * into result;

  if not found then
    raise exception 'VERSION_CONFLICT' using errcode = 'P0002';
  end if;

  return result;
end;
$$;

-- delete_note: soft-delete with version check
create or replace function public.delete_note(
  p_id uuid,
  p_user_id uuid,
  p_revision integer
)
returns public.notes
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.notes;
begin
  if p_user_id != (select auth.uid()) then
    raise exception 'AUTH_DENIED' using errcode = 'P0001';
  end if;

  update public.notes
  set deleted = true,
      revision = p_revision + 1
  where id = p_id
    and user_id = p_user_id
    and revision = p_revision
  returning * into result;

  if not found then
    raise exception 'VERSION_CONFLICT' using errcode = 'P0002';
  end if;

  return result;
end;
$$;
