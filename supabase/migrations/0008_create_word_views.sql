-- Passive exposure logging for Learn (flashcard) mode. Deliberately separate
-- from user_word_status: viewing a card is exposure, not an attempt, so it
-- must never write a correct/incorrect status there. One row per card shown
-- in a Learn session.

create table if not exists word_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  word_id uuid not null references words(id) on delete cascade,
  viewed_at timestamptz not null default now()
);

create index if not exists idx_word_views_user_viewed on word_views(user_id, viewed_at desc);

alter table word_views enable row level security;

create policy "Users can insert their own word views"
  on word_views for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can read their own word views"
  on word_views for select
  to authenticated
  using (auth.uid() = user_id);