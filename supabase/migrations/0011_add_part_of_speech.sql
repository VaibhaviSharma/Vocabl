-- Needed to pick grammatically-safe distractor words for the Quiz cloze
-- format: a blanked sentence with 5 word options only works as an
-- unambiguous single-answer question if every distractor shares the
-- target word's part of speech (otherwise wrong answers are eliminable by
-- grammar alone, not meaning).
alter table words
  add column if not exists part_of_speech text
    check (part_of_speech in ('noun', 'verb', 'adjective', 'adverb'));
