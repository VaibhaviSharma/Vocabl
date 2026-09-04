-- Confusing Word Pairs practice format: a blanked sentence where the
-- target word and its commonly-confused partner are the only two
-- options — tests whether the user can tell the pair apart in context,
-- not just recognize a definition. Separate from `words` since a pair
-- relationship + single demonstrating sentence is a different shape than
-- the main word bank's schema, and confusable partners aren't always
-- themselves present in `words`.
--
-- Two rows are generated per source pair (one testing `word`, one testing
-- `commonly_confused_with` as the target), so a 24-pair seed list yields
-- 48 practice rows.

create table if not exists confusing_pairs (
  id uuid primary key default gen_random_uuid(),
  word text not null,
  commonly_confused_with text not null,
  word_meaning text not null,
  confused_meaning text not null,
  demonstrating_sentence text not null,
  created_at timestamptz not null default now()
);

alter table confusing_pairs enable row level security;

create policy "Authenticated users can read confusing pairs"
  on confusing_pairs
  for select
  to authenticated
  using (true);

-- No insert/update/delete policies for regular users — rows are managed
-- exclusively via the batch generation script using the service_role key,
-- same as `words`.
