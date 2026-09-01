-- Quiz history, separate from user_word_status (which only tracks the
-- latest correct/incorrect result per word). Each completed quiz writes one
-- quiz_attempts row plus one quiz_attempt_results row per word answered —
-- purely additive, never overwritten.

create table if not exists quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('all', 'wrong_only')),
  taken_at timestamptz not null default now()
);

create index if not exists idx_quiz_attempts_user_taken on quiz_attempts(user_id, taken_at desc);

alter table quiz_attempts enable row level security;

create policy "Users can read their own quiz attempts"
  on quiz_attempts for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own quiz attempts"
  on quiz_attempts for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Word text is stored directly (not a word_id FK) so this stays a true
-- snapshot of what happened in that session, unaffected by later changes
-- to the word bank.
create table if not exists quiz_attempt_results (
  id uuid primary key default gen_random_uuid(),
  quiz_attempt_id uuid not null references quiz_attempts(id) on delete cascade,
  word text not null,
  result text not null check (result in ('correct', 'incorrect'))
);

create index if not exists idx_quiz_attempt_results_attempt on quiz_attempt_results(quiz_attempt_id);

alter table quiz_attempt_results enable row level security;

-- No direct user_id column here — ownership is checked via the parent
-- quiz_attempts row.
create policy "Users can read their own quiz attempt results"
  on quiz_attempt_results for select
  to authenticated
  using (
    exists (
      select 1 from quiz_attempts qa
      where qa.id = quiz_attempt_id and qa.user_id = auth.uid()
    )
  );

create policy "Users can insert their own quiz attempt results"
  on quiz_attempt_results for insert
  to authenticated
  with check (
    exists (
      select 1 from quiz_attempts qa
      where qa.id = quiz_attempt_id and qa.user_id = auth.uid()
    )
  );
