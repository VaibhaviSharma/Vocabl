-- Word Usage Errors: 5 sentences per word (4 correct, 1 subtly wrong).
-- "Exactly one is_correct = false per word" is enforced at generation time
-- (self-check gated), not as a DB constraint — same as how
-- distractor_definitions' "exactly one correct" invariant already works.
create table if not exists usage_sentences (
  id uuid primary key default gen_random_uuid(),
  word_id uuid not null references words(id) on delete cascade,
  sentence text not null,
  is_correct boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_usage_sentences_word on usage_sentences(word_id);

alter table usage_sentences enable row level security;

create policy "Authenticated users can read usage sentences"
  on usage_sentences
  for select
  to authenticated
  using (true);

-- No insert/update/delete policies for regular users — rows are managed
-- exclusively via the batch generation script using the service_role key,
-- same as `words`.

-- Odd Word Out: meaning clusters (synonym/near-synonym groups) formed by
-- batch analysis of correct_definition, not per-word generation. A word
-- can belong to at most one cluster in practice (the generation script
-- doesn't propose overlapping clusters), but the join table doesn't
-- enforce that — it's just not produced.
create table if not exists meaning_clusters (
  id uuid primary key default gen_random_uuid(),
  theme text not null,
  created_at timestamptz not null default now()
);

create table if not exists word_cluster_members (
  cluster_id uuid not null references meaning_clusters(id) on delete cascade,
  word_id uuid not null references words(id) on delete cascade,
  primary key (cluster_id, word_id)
);

create index if not exists idx_word_cluster_members_word on word_cluster_members(word_id);

alter table meaning_clusters enable row level security;
alter table word_cluster_members enable row level security;

create policy "Authenticated users can read meaning clusters"
  on meaning_clusters
  for select
  to authenticated
  using (true);

create policy "Authenticated users can read cluster members"
  on word_cluster_members
  for select
  to authenticated
  using (true);

-- No insert/update/delete policies for regular users on either table —
-- managed exclusively via the batch generation script using the
-- service_role key.
