-- Quizzes exited early (back button, navigating away) now still save as a
-- completed attempt rather than being discarded. total_words_shown records
-- how many words were actually presented/answered before the quiz ended
-- (naturally or via exit) — the denominator for "X / Y correct" in My Quiz
-- Score, distinct from the original category's full word count.

alter table quiz_attempts add column total_words_shown int;

update quiz_attempts qa
set total_words_shown = (
  select count(*) from quiz_attempt_results qar where qar.quiz_attempt_id = qa.id
)
where total_words_shown is null;

alter table quiz_attempts alter column total_words_shown set not null;
alter table quiz_attempts add constraint total_words_shown_non_negative check (total_words_shown >= 0);
