-- Tracks correct/incorrect per practice format, not one shared status per
-- word. A user consistently nailing a word in Quiz but struggling with it
-- in a different format is real signal worth keeping separate, not
-- collapsing into a single last-result-wins value.
--
-- The old `unique (user_id, word_id)` constraint is dropped (found
-- dynamically below, regardless of its actual name) and replaced with
-- `unique (user_id, word_id, practice_type)`. Existing rows all came from
-- the Contextual Closest Meaning quiz, so they're backfilled with that
-- value via the column default, which is then dropped so future inserts
-- must specify practice_type explicitly.
do $$
declare
  rec record;
begin
  for rec in
    select con.conname, con.conrelid, con.conkey
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'user_word_status' and con.contype = 'u'
  loop
    if array_length(rec.conkey, 1) = 2 and (
      select array_agg(pa.attname)
      from pg_attribute pa
      where pa.attrelid = rec.conrelid and pa.attnum = any(rec.conkey)
    ) @> array['user_id', 'word_id']::name[]
    then
      execute format('alter table user_word_status drop constraint %I', rec.conname);
    end if;
  end loop;
end $$;

alter table user_word_status
  add column if not exists practice_type text not null default 'contextual_closest_meaning';

alter table user_word_status
  add constraint user_word_status_user_word_type_key unique (user_id, word_id, practice_type);

alter table user_word_status alter column practice_type drop default;

alter table user_word_status
  add constraint user_word_status_practice_type_check
  check (practice_type in ('contextual_closest_meaning', 'confusing_word_pairs', 'word_usage_errors', 'odd_word_out'));

-- Confusing Word Pairs cannot use user_word_status: only 2 of its 48
-- entries have a matching row in `words` (most confusable partners, e.g.
-- "disburse"/"disperse", were never added to the main word bank), so a
-- word_id foreign key would silently fail to track almost everything.
-- Gets its own status table instead, same last-result-wins shape, keyed
-- on confusing_pairs.id rather than words.id.
create table if not exists confusing_pair_status (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  confusing_pair_id uuid not null references confusing_pairs(id) on delete cascade,
  status text not null check (status in ('correct', 'incorrect')),
  last_attempted_at timestamptz not null default now(),
  unique (user_id, confusing_pair_id)
);

create index if not exists idx_confusing_pair_status_user on confusing_pair_status(user_id);

alter table confusing_pair_status enable row level security;

create policy "Users can read their own confusing pair status"
  on confusing_pair_status for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own confusing pair status"
  on confusing_pair_status for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own confusing pair status"
  on confusing_pair_status for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
