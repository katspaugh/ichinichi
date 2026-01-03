-- Add generated year column and index for efficient year-based lookups

alter table public.notes
  add column if not exists note_year integer
  generated always as ((split_part(date, '-', 3))::int) stored;

create index if not exists notes_user_year_idx
  on public.notes(user_id, note_year);

create index if not exists notes_user_year_deleted_idx
  on public.notes(user_id, note_year, deleted);
