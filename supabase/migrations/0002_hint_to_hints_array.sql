-- Scope updated: hints are now pre-generated in bounded variety (3-4 tone-
-- matched variants per word) instead of a single fixed string, so the app
-- can randomly rotate between them at runtime without feeling identical on
-- repeat encounters. Still fully static (a DB read, not a live LLM call).

alter table words drop column hint;

alter table words add column hints jsonb not null default '[]'::jsonb;
alter table words alter column hints drop default;

alter table words add constraint hints_shape
  check (jsonb_typeof(hints) = 'array');
