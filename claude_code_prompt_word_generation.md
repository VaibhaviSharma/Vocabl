# Prompt for Claude Code: Vocabl Word Batch Generation Script

## Context
I'm building Vocabl, a CAT (Indian MBA exam) vocabulary web app. I need a reusable Node.js script that takes a seed word list and generates full database rows for each word using the Claude API, then writes them into Supabase. This should be a script I can re-run over time to expand the word bank, not a one-off throwaway.

## Input
A CSV file at `./data/vocabl_source_wordlist.csv` with columns: `word`, `domain`, `rough_tier`. Example rows:
```
word,domain,rough_tier
dogmatic,philosophy,3
inflation,economics,1
sardonic,tone,4
```

## What the script should do

1. Read the CSV and loop through each word.
2. For each word, check Supabase first to see if a row already exists for that word (by exact word match) — skip it if so, so the script is safe to re-run without duplicating or overwriting existing entries.
3. For each new word, make one call to the Claude API to generate:
   - `correct_definition` — a plain, register-neutral definition (not encyclopedic, not overly academic — think "clear dictionary definition," one sentence)
   - `distractor_definitions` — an array of exactly 3 plausible-but-wrong definitions. These should be definitions of *other* real words in a similar register/domain to the target word (not random unrelated concepts), so they're genuinely tempting wrong answers, not obviously fake. Explicitly avoid using another valid sense of the *same* word as a distractor if the word is a homonym — pick the primary/most common sense as correct and don't let a distractor accidentally also be correct.
   - `hint` — a single-sentence, dry/deadpan, "extremely online" clue. Rules: at most one internet-culture/meme reference, no forced slang, should feel like a knowing friend's aside rather than a textbook clue. Do not just restate the definition in casual words — it should require the reader to connect the reference back to the meaning themselves.
   - `example_sentence` — one sentence using the word correctly, in a register consistent with serious editorial/academic writing (this is meant to resemble how the word would actually appear in a CAT RC passage) — NOT jokey, NOT casual, even though the hint is casual.
   - `tier` — a refined difficulty rating from 1 (very common, most readers know it) to 5 (genuinely obscure), using `rough_tier` from the CSV as a starting anchor but adjusting if it seems off.
   - `source_domain` — carry through the `domain` value from the CSV unchanged.
4. Run a self-check as part of the same generation step: ask the model to verify that exactly one of the 4 definition options (correct + 3 distractors) is unambiguously correct for the target word, and that none of the distractors could also reasonably be considered correct. If this check fails, retry generation for that word once with adjusted distractors. If it fails a second time, skip the word and log it to a `needs_review.csv` file instead of writing it to the database.
5. Write each validated row to a Supabase table called `words` with columns: `word`, `tier`, `correct_definition`, `distractor_definitions` (jsonb array), `hint`, `example_sentence`, `source_domain`, `created_at`.
6. Log progress to the console as it runs (e.g., "[12/293] dogmatic — generated, self-check passed").
7. At the end, print a summary: total processed, total written, total skipped (already existed), total flagged for review, and the list of any words that failed twice.

## Technical requirements
- Node.js script, runnable via `node generate-words.js`
- Use `@anthropic-ai/sdk` for the Claude API calls (model: claude-sonnet-4-6)
- Use `@supabase/supabase-js` for the database writes, reading the Supabase URL and service key from environment variables (`.env` file, not hardcoded)
- Use a CSV parsing library (e.g., `papaparse` or `csv-parse`) to read the input file
- Add a small delay between API calls (e.g., 200-500ms) to avoid rate limits
- Wrap each word's generation + write in a try/catch so one failure doesn't crash the whole batch — log the error and continue to the next word
- Structure the Claude API prompt to request a single JSON object as output (no markdown formatting, no preamble) so the response can be parsed directly — include an explicit instruction like "respond only with valid JSON, no other text"

## Example of the JSON shape you should prompt Claude to return per word
```json
{
  "correct_definition": "...",
  "distractor_definitions": ["...", "...", "..."],
  "hint": "...",
  "example_sentence": "...",
  "tier": 3,
  "self_check_passed": true
}
```

## Deliverables
- `generate-words.js` — the main script
- `.env.example` — showing the required environment variables (ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY)
- `needs_review.csv` — created/appended to at runtime for words that failed the self-check twice
- A brief README section (or comment block at the top of the script) explaining how to run it and re-run it safely to add new words later

## Voice reference (for your own calibration, not to include verbatim in the prompt you write)
Hint examples already locked in for the app's tone:
- dogmatic → "main character energy but for opinions. zero flexibility, all confidence."
- ephemeral → "basically an Instagram story. gone before you can screenshot it."
- obfuscate → "corporate email speak for 'we're hiding something.'"
- gregarious → "the friend who talks to strangers in line and somehow gets their number."

Use these as few-shot examples inside the actual Claude API prompt the script sends, so generated hints match this register consistently.
