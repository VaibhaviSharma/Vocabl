-- Lightweight behavior logging, separate from the result-tracking tables
-- (user_word_status, quiz_attempts). For usage-pattern analysis queried
-- directly in Supabase later, not consumed by the app itself.

create table if not exists user_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_events_user_created on user_events(user_id, created_at desc);
create index if not exists idx_user_events_type on user_events(event_type);

alter table user_events enable row level security;

create policy "Users can insert their own events"
  on user_events for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can read their own events"
  on user_events for select
  to authenticated
  using (auth.uid() = user_id);
