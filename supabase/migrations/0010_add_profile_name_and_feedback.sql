-- Name capture at signup, mirrored (alongside email) onto the existing
-- user_profiles row rather than a separate table, since user_profiles is
-- already the one-row-per-user table linked to auth.uid(). Both are
-- nullable: name is optional at signup, and email is a convenience mirror
-- of auth.users.email so feedback/events can be queried by name/email
-- without joining the auth schema.
alter table user_profiles
  add column if not exists name text,
  add column if not exists email text;

-- Lightweight in-app feedback. Every field but user_id is optional — the
-- app enforces "at least one of rating/category/message" client-side, not
-- here, since any single field alone is still valid, useful data.
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint check (rating between 1 and 5),
  category text check (category in ('loved', 'missing', 'bug', 'other')),
  message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_feedback_user_created on feedback(user_id, created_at desc);

alter table feedback enable row level security;

create policy "Users can insert their own feedback"
  on feedback for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can read their own feedback"
  on feedback for select
  to authenticated
  using (auth.uid() = user_id);