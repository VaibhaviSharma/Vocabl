-- Structured etymology fields, generated alongside the existing narrative
-- fields but kept independent of them (correct_definition, distractor
-- definitions, example_sentence are untouched). `root` is the normalized,
-- machine-matchable root morpheme (e.g. "dogma") used to group words into
-- "same root" families for the Word Family browsing view — `etymology` is
-- the free-text memory-bridge sentence. All four are nullable: a word with
-- no clear/traceable root simply has root (and its dependents) left null
-- rather than a fabricated one.

alter table words
  add column if not exists etymology text,
  add column if not exists root text,
  add column if not exists root_meaning text,
  add column if not exists root_language text;

-- Used by the Word Family view to fetch every word sharing a root.
create index if not exists idx_words_root on words (root) where root is not null;