-- Per-user progress state for Vocabl. Users are anonymous Supabase Auth
-- identities (no email/password) — auth.uid() is still the scoping key,
-- just backed by an anonymous session instead of a real account.

-- One row per user: current adaptive difficulty tier, a rolling window of
-- the last 10 round outcomes (used to re-evaluate current_tier after each
-- round), lifetime words-played count, and day-streak tracking.
create table if not exists user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_tier smallint not null default 1 check (current_tier between 1 and 5),
  recent_results jsonb not null default '[]'::jsonb,
  words_played int not null default 0,
  streak_count int not null default 0,
  last_played_date date,
  created_at timestamptz not null default now(),
  constraint recent_results_shape check (jsonb_typeof(recent_results) = 'array')
);

alter table user_profiles enable row level security;

create policy "Users can read their own profile"
  on user_profiles for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own profile"
  on user_profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own profile"
  on user_profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Single correct/incorrect status per (user, word), last-result-wins.
-- Written by both hangman rounds and quiz-mode answers.
create table if not exists user_word_status (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  word_id uuid not null references words(id) on delete cascade,
  status text not null check (status in ('correct', 'incorrect')),
  last_attempted_at timestamptz not null default now(),
  unique (user_id, word_id)
);

create index if not exists idx_user_word_status_user on user_word_status(user_id);

alter table user_word_status enable row level security;

create policy "Users can read their own word status"
  on user_word_status for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own word status"
  on user_word_status for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own word status"
  on user_word_status for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
