-- Vocabl's static, pre-generated word bank. No interest tagging (unlike
-- WordFit's `words` table) — every word carries a `source_domain` subject
-- tag instead, and is served via tier-based adaptive difficulty rather than
-- per-user interest matching.
--
-- Readable by all authenticated users, writable only via the batch
-- generation script using the service_role key.

create table if not exists words (
  id uuid primary key default gen_random_uuid(),
  word text not null,
  tier smallint not null check (tier between 1 and 5),
  correct_definition text not null,
  distractor_definitions jsonb not null,
  hint text not null,
  example_sentence text not null,
  source_domain text not null,
  created_at timestamptz not null default now(),
  constraint distractor_definitions_shape check (jsonb_typeof(distractor_definitions) = 'array')
);

-- Case-insensitive uniqueness so the batch script's "already exists" check
-- (and any future re-run) can't create near-duplicate entries that only
-- differ in casing.
create unique index if not exists idx_words_word_lower on words (lower(word));

alter table words enable row level security;

create policy "Authenticated users can read words"
  on words
  for select
  to authenticated
  using (true);

-- No insert/update/delete policies for regular users. Rows are managed
-- exclusively via the batch generation script using the service_role key.
