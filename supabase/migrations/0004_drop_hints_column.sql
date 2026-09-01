-- The hint mechanism changed: instead of a "Show hint" button revealing one
-- of several pre-generated deadpan hints, the hangman round now
-- automatically shows example_sentence with the target word blanked out as
-- passive in-round context. The hints array is no longer read by the app.

alter table words drop column hints;
