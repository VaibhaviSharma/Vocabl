# Vocabl — Scope Document (Updated)

## What this is

Vocabl is a vocabulary-building web app for CAT (Common Admission Test) 
aspirants, spun off from the design patterns and architecture built for 
WordFit. It reuses WordFit's core mechanics (game-based active recall, 
pastel card-based UI, Supabase/React/Vite/Claude API/Vercel stack) while 
building CAT-specific content, difficulty adaptation, and question 
formats from scratch.

## Why CAT, and why this approach

- No app on the App Store is a dedicated, standalone, well-designed 
  CAT-vocab-only product. Existing iOS CAT apps are full exam-prep 
  suites (quant, DILR, mock tests) with vocabulary as one minor buried 
  feature.
- Standalone CAT vocab apps exist on the Play Store, but execution is 
  weak — incomplete or wrong definitions, no homonym handling.
- CAT has no standalone or direct vocabulary section. Vocabulary is 
  tested indirectly and contextually within VARC, heavily influencing 
  the ability to decode dense academic reading passages, identify the 
  author's tone, and solve paragraph summaries. Direct vocabulary 
  formats (synonyms, antonyms, analogies) are reserved for OMETs 
  (Other Management Entrance Tests — XAT, SNAP, NMAT, CMAT), not CAT. 
  This distinction matters directly for Vocabl's scope: since Vocabl is 
  CAT-only, only formats relevant to CAT's actual contextual-inference 
  style belong in the Practice menu (see Additional CAT-relevant 
  question formats section).
- **Positioning pivot (supersedes an earlier direction):** Vocabl was 
  originally built around Hangman as its core mechanic — a game-based 
  active-recall loop intended as a genuine competitive differentiator, 
  since no CAT app has a real game mechanic. This has been deliberately 
  reconsidered. Vocabl's identity is now an **authentic CAT practice 
  app**: question formats drawn directly from real CAT-prep coaching 
  material (context-fit cloze, confusable pairs, odd-one-out, 
  incorrect-usage identification, analogies), not a vocabulary game 
  that happens to be CAT-flavored. Hangman is removed. The 
  differentiation shifts from "the only fun CAT vocab app" to "the only 
  well-executed, genuinely CAT-native practice app" — still a real 
  differentiator given how weak execution is across existing CAT apps 
  (wrong definitions, no homonym handling, no context-based practice), 
  just a different axis than a game mechanic.
- Positioning must stay honest about what CAT actually tests: these 
  formats train the underlying reading/inference skill CAT's current 
  RC/tone/para-completion questions depend on. They should not be 
  marketed as literally replicating a real CAT question type, since 
  the exam itself doesn't ask isolated vocabulary questions anymore — 
  the framing is "practice in the same style CAT coaching material 
  uses to build this skill," which is accurate.
- GRE was considered and deprioritized for MVP in favor of CAT.

## Platform strategy

- Web app (React + Vite), deployed to Vercel via GitHub, same playbook 
  as WordFit.
- PWA support planned (installable, "Add to Home Screen") to reduce 
  daily-open friction without committing to native app-store 
  distribution or review cycles.
- Native app wrapping (Capacitor, for Android/iOS store presence) is 
  explicitly deferred until the web MVP has validated engagement — 
  revisit once there's real usage data on device/browser mix and 
  retention.
- Testing approach: since this is a web app, testing on mobile means 
  opening the live Vercel URL on real phones (own device + at least one 
  Android tester), not emulators or app-store tooling.

## Navigation structure

Home has two primary entry points, kept deliberately small so it 
doesn't grow cluttered as more question formats are added:

- **Learn** — passive flashcard exposure mode
- **Practice** — opens a secondary menu listing individual CAT-native 
  question formats (all four now live: Quiz/context-fit cloze, 
  Confusing Word Pairs, Word Usage Errors, Odd Word Out)

New question-type formats get added inside the Practice menu over 
time, not as new buttons directly on Home.

Per the clickable prototype (`vocabl_prototype_placeholder.html`), the 
Practice menu shows all four target formats — "Contextual closest 
meaning" (→ `/quiz`), "Confusing word pairs" (→ `/pairs`), "Word usage 
errors" (→ `/usage-errors`), "Odd word out" (→ `/odd-word-out`) — and 
all four are now built and live.

Difficulty tier is an invisible, adaptive layer running underneath 
whichever format the user is in — it is never a user-facing selector. 
Users choose *what skill/format* to practice; the app quietly manages 
*how hard* within that.

## Core gameplay modes (current)

### 1. Learn — two modes
Learn opens to a mode picker, not straight into flashcards:

**Flashcards** (the original mode)
- Passive, self-paced, no scoring, no pressure
- Word shown, tap/reveal to see back: `correct_definition`, then 
  `etymology` (labeled distinctly, e.g., "Origin"), a tappable 
  root/family chip, then `example_sentence`
- Filterable by tier and/or domain before starting a session
- Session pattern: up to 10 words, progress indicator, back/exit 
  control available at any point
- Does NOT write to `user_word_status` — viewing is exposure, not an 
  attempt. Logged instead to a separate `word_views` table 
  (`user_id`, `word_id`, `viewed_at`)

**Root Words** (done) — a root-first way into the same Word Family 
data the flashcard's root chip already opens (additional entry point, 
not a replacement)
- Browse list of every root with 3+ words sharing it (122 currently), 
  each row showing the root, its meaning, its language, and the word 
  count, sorted largest-family-first
- Tapping a root opens the existing Word Family view (root + meaning + 
  language at top, every word sharing it listed below with its 
  `correct_definition`) — literally the same page/route the flashcard 
  chip uses, just reached root-first instead of word-first
- Passive/reference, same as flashcards — no scoring, no attempts 
  logged, just a `screen_viewed` event

### 2. Hangman — REMOVED (done)

Hangman (letter-guessing with dynamic attempts, continuous 10-word 
sessions) was the original core mechanic and genuine game-based 
differentiator, but has been removed as part of the pivot to an 
authentic CAT-practice identity (see positioning note above). The 
screens, routes (`/play`), and session logic (`HangmanRoundPage.jsx`, 
`HangmanRound.jsx`, `Keyboard.jsx`) are deleted from the codebase, not 
just deprioritized. `maskWord.js` (sentence-blanking) and 
`adaptiveTier.js` (`applyRoundResult`/tier progression) survive — both 
are now used by Quiz instead, which took over Hangman's former role of 
driving `current_tier`, `streak_count`, and `words_played` on every 
answer, since nothing else populated those fields once Hangman was 
gone. If Hangman is reintroduced later, it would likely return as an 
optional/secondary "warm-up" mode rather than the primary mechanic — 
not currently planned.

### 3. Quiz (context-fit cloze)
- Format: a sentence (the word's `example_sentence`, blanked) is shown, 
  with the target word as one of 5 multiple-choice word options — the 
  user selects which word correctly completes the sentence
- This replaced an earlier design where the quiz showed a bare word and 
  4 definition options. The cloze format was adopted because it tests 
  context-inference (the actual skill CAT's current RC/tone/para-
  completion questions depend on) rather than isolated definition 
  recognition, which Learn mode already covers
- Distractor options are other real words from the word bank, filtered 
  to match the target word's part of speech (see schema note below) so 
  wrong answers can't be eliminated by grammar alone
- Entry point: primarily Home → Practice → "Contextual closest 
  meaning" (matching the target nav structure); also still reachable 
  from My Words via its existing "Generate Quiz" button. Either way, 
  lands on the same category picker: "All words" or "Only wrong" 
  (words currently flagged incorrect in `user_word_status`)
- "All words" draws a fresh, tier-adaptive 10-word session directly 
  from the `words` table (the same weighted-tier selection Hangman 
  used to drive) rather than only words already in 
  `user_word_status` — otherwise a brand-new user with no attempt 
  history would have nothing to quiz on. "Only wrong" is unchanged: 
  it reads the user's full current incorrect set, no session cap
- Word order and answer-option order are both randomized every time
- On selecting an answer, `user_word_status` updates accordingly (same 
  upsert logic used elsewhere), and — regardless of category — 
  `current_tier`/`streak_count`/`words_played` update the same way 
  Hangman rounds used to (via the same `applyRoundResult` function), 
  since Quiz is now the only mode that drives adaptive difficulty
- Early exit is supported: if the user leaves before finishing, the 
  attempt still counts. `total_words_shown` reflects how many words the 
  user actually reached, not the original category size, and only 
  answered words get logged results
- Every quiz attempt (finished or exited early) is logged to 
  `quiz_attempts` (`id`, `user_id`, `taken_at`, `category`, 
  `total_words_shown`) with per-word results in `quiz_attempt_results` 
  (or a jsonb column — implementation's call)
- Displayed as "X / Y correct" in quiz history, where Y = 
  `total_words_shown`

### 4. Confusing Word Pairs (done)
- Format: a sentence with the target word blanked, and exactly 2 
  options — the word and its commonly-confused partner (e.g., 
  "The court will ______ the funds. (disburse / disperse)"). Tests 
  whether the user can tell the pair apart in context, not just 
  recognize a definition
- Content lives in its own `confusing_pairs` table (`id`, `word`, 
  `commonly_confused_with`, `word_meaning`, `confused_meaning`, 
  `demonstrating_sentence`), separate from `words` — a pair 
  relationship + one demonstrating sentence is a different shape than 
  the main word bank, and confusable partners aren't always themselves 
  present in `words`. Seeded via `generate-confusing-pairs.js` from 
  `data/confusing_pairs_source.csv`, generating both directions per 
  source pair (24 seed pairs → 48 rows) in one self-checked API call, 
  same guardrail pattern as the rest of the content pipeline
- Entry point: Home → Practice → "Confusing word pairs"
- No category picker (no tier/wrong-only concept applies here) — a 
  single "Start" button draws a random 10-pair session from the full 
  pool
- Deliberately NOT tied into `user_word_status`, `current_tier`, or 
  `streak_count` — adaptive difficulty is scoped to Quiz only (see 
  above). This is a lightweight, self-contained loop: pick the word 
  that fits, see both meanings, move on. Session start/complete/exit 
  logged to `user_events` (`confusing_pairs_started`/`completed`/
  `exited`) for visibility, same as other modes
- After answering, both words' meanings are shown (not just the 
  correct one) — the point is learning to distinguish the pair, not 
  just getting the current question right

### 5. Word Usage Errors (done)
- Format: 5 sentences using the same target word — 4 correct usages, 1 
  subtly wrong. User picks the sentence where the word is used 
  incorrectly
- Content lives in `usage_sentences` (`word_id`, `sentence`, 
  `is_correct`), 5 rows per word. Generated via `generate-usage-errors.js`, 
  one API call per word, self-checked (exactly one sentence unambiguously 
  wrong, the other four unambiguously right, a real identifiable error — 
  wrong sense/part-of-speech, not a trick), retry-once, `needs_review.csv` 
  on persistent failure
- Scoped to tier 2-4 words only (860 of 1026) — very easy or very obscure 
  words don't reliably produce good "spot the error" material. Ran once: 
  860/860 written, 0 flagged
- Entry point: Home → Practice → "Word usage errors"; category picker 
  (All words / Only wrong), same as Quiz
- Correctness tracked in `user_word_status` keyed on the target word, 
  `practice_type = 'word_usage_errors'` — isolated from every other 
  format via the `(user_id, word_id, practice_type)` key
- After answering, reveals the word's `correct_definition` to clarify 
  its actual meaning

### 6. Odd Word Out (done)
- Format: 4 words, 3 sharing a meaning and 1 that doesn't belong. User 
  picks the odd one out
- Content lives in `meaning_clusters` (`id`, `theme`) and join table 
  `word_cluster_members` (`cluster_id`, `word_id`) — synonym/near-synonym 
  groups of 4-6 words, tier-matched (within 2 tiers of each other) so the 
  odd word isn't guessable purely by difficulty. Built via 
  `generate-meaning-clusters.js`, one batch-analysis call per 
  `source_domain` (not per-word) reading each domain's words + 
  `correct_definition`s and proposing clusters, self-checked for genuine 
  shared meaning and tier fit
- Ran once across all 10 domains: 67 clusters formed, average cluster 
  size 4.0, 268/1026 words placed in a cluster (the rest don't have 
  enough true synonyms in the bank and are simply unused here — expected)
- Question construction happens at runtime, not pre-generated: pick a 
  cluster, take 3 of its members, pick a 4th "odd" word from a different 
  cluster (chosen from a small pool of the closest-tier candidates, not 
  always the single closest, for variety), shuffle display order
- Entry point: Home → Practice → "Odd word out"; single "Start" button 
  (no category picker — a cluster-built question doesn't map cleanly onto 
  a per-word "wrong only" filter, so this follows Confusing Word Pairs' 
  simpler pattern instead of Quiz's)
- Correctness tracked in `user_word_status` keyed on the odd word, 
  `practice_type = 'odd_word_out'`
- After answering, reveals the cluster's shared-meaning theme and the odd 
  word's actual definition

### My Words screen
- Table/list of every word the user has played (from 
  `user_word_status`), each row showing the word and its current 
  correct/incorrect status
- "Generate Quiz" button, entry point into Quiz mode above
- **Status is tracked per practice format, not one shared value per 
  word.** `user_word_status` has a `practice_type` column 
  (`contextual_closest_meaning`, `confusing_word_pairs`, 
  `word_usage_errors`, `odd_word_out`), unique on `(user_id, word_id, 
  practice_type)` — a user consistently nailing a word in Quiz but 
  struggling with it in a different format keeps both signals instead 
  of one overwriting the other. My Words has a practice-type chip 
  selector (all four shown, for the same forward-compatible reason the 
  Practice menu shows all four formats before they're all built); "All 
  / Incorrect only" filters within whichever type is selected
- Confusing Word Pairs can't share this table: only 2 of its 48 rows 
  have a matching entry in `words` (most confusable partners, e.g. 
  "disburse"/"disperse", were never added to the main bank), so a 
  `word_id` foreign key would silently fail to track almost 
  everything. It gets its own `confusing_pair_status` table instead — 
  same last-result-wins shape, keyed on `confusing_pairs.id`. My Words' 
  selector shows an honest "tracked separately" message for that tab 
  rather than pretending it's queryable the same way; no dedicated 
  review screen for it yet

### My Quiz Score tab
- Tabular history of past quiz attempts: date/time, category (All / 
  Wrong only), score ("X / Y correct"), expandable to full word-by-
  word breakdown
- Sorted most recent first
- Purely additive/historical — never overwritten, distinct from 
  `user_word_status` which only reflects the latest state per word

## Adaptive difficulty (driven by Quiz only, invisible to the user)

- Each user has a `current_tier` (1-5), starting at tier 1
- Word serving uses a weighted mix: ~70% current tier, ~20% one tier 
  below, ~10% one tier above — this weighting picks Quiz's "All words" 
  session, not Learn (Learn is filtered by the user's own tier/domain 
  choice, not tier-weighted)
- A rolling window of the last ~10 words *answered in Quiz* tracks 
  success rate; high success bumps `current_tier` up, low success 
  steps it down. Learn never touches this — viewing a flashcard is 
  exposure, not a graded attempt
- No calibration quiz — this self-corrects within the first Quiz 
  session or two of use

## Word content schema (current)

| Field | Description |
|---|---|
| `word` | The vocabulary word (single-word only, v1) |
| `tier` | Difficulty, 1 (common) to 5 (obscure) |
| `correct_definition` | Plain, register-neutral definition |
| `distractor_definitions` | 3 plausible-but-wrong definitions (used historically for the original quiz format; may still be used elsewhere, e.g., odd-one-out or future formats — no longer the primary quiz mechanism) |
| `example_sentence` | Editorial/RC-register usage sentence — abstract/institutional subject matter, one sentence, no casual/narrative framing. Used blanked-out as the Quiz cloze sentence. For `tone`-domain words specifically, this should model argumentative/evaluative prose (a writer taking a stance), matching the real "author's tone" RC question type |
| `root` | Normalized root morpheme (e.g., "dogma"), consistent spelling across every word sharing that root — this is the join key for Word Family browsing |
| `root_meaning` | Short meaning of the root |
| `root_language` | Origin language (Greek, Latin, etc.) |
| `etymology` | 1-2 sentence memory-bridge narrative connecting root to current meaning |
| `source_domain` | Subject tag: Philosophy, Economics, Science, Psychology, Sociology, Politics, Literature, Environment, Tone, General |
| `part_of_speech` | One of noun/verb/adjective/adverb, matching how the word is used in its own `example_sentence`. Backfilled for all existing words (`generate-part-of-speech.js`) and generated for new words in the same call as everything else. Used to filter grammatically-matched distractor words for the Quiz cloze format |

**Generation guardrail:** every word's content generation includes a 
self-check pass (exactly one unambiguous correct answer; no accidental 
homonym conflicts; confident, non-fabricated etymology/root). Failures 
are logged to `needs_review.csv` rather than silently accepted.

## Word Family browsing (new module)

- Given a word, users can see other words in the database sharing the 
  same `root` value
- Entry point: a tappable root/meaning chip on the flashcard back (Learn 
  mode)
- Read-only reference list, no scoring/attempts logged
- Handles the case of a root with no siblings gracefully (message, not 
  an empty broken state)
- Root normalization consistency (same root spelled identically across 
  every word that shares it) is critical for this to work and should be 
  spot-checked after any content generation batch

## Word sourcing and current word count

- No official CAT vocabulary list exists (same situation as GRE). 
  Community-converged lists come from coaching institutes and recurring 
  editorial vocabulary.
- Real sources identified for sourcing/cross-referencing: Cracku's CAT 
  word list (root-word emphasis), the Arun Sharma CAT Prep list on 
  Vocabulary.com (pulled from a widely-used coaching book — high-trust 
  source for word *selection*, though Vocabl generates its own 
  definitions/sentences rather than reusing theirs), Hitbullseye's 
  cross-exam 1000-word list, Toprankers' 2026 context-based vocabulary 
  material. Some available lists (e.g., older "CAT 2010" PDFs) are 
  dated and should be filtered for continued relevance rather than 
  imported wholesale.
- Current word bank: 1026 words (done). Expanded from 298 via web-sourced 
  vocabulary (real CAT-prep lists and editorial-register sources, not 
  model recall alone), deduplicated against the live database at 
  generation time. Domain split: general 216, science 100, economics 
  100, philosophy 107, sociology 94, literature 90, psychology 89, 
  politics 88, tone 75, environment 67. Tier split: 1=141 (14%), 
  2=358 (35%), 3=400 (39%), 4=102 (10%), 5=25 (2%) — a genuine bell 
  curve now (the pre-expansion bank was actually skewed toward tier 2 
  at 62%, not tiers 3-4 as originally assumed here; corrected during 
  the expansion)
- 10 words never cleared self-check after 5 full retry rounds each 
  (with a prompt specifically nudged toward preferring a null root 
  over a shaky guess) and remain in `needs_review.csv` for manual 
  attention: arcane, perfunctory, peripatetic, incorrigible, 
  deconstruction, disjunction, incentive, dysphoria, euphoria, brazen
- Root consolidation validation (a second, separate pass from the 
  original backfill's): the model proposed ~260 merges across two 
  runs (once the word bank passed 1000 rows), of which 17 were 
  verified against actual word/language/meaning data and applied — 
  the rest were false positives at the same rate as before (roots 
  that are merely similar-sounding or share an English gloss across 
  languages, not actually the same historical root). 413 distinct 
  roots, 209 shared by 2+ words, 122 have 3+ words (the cutoff used by 
  the Root Words section below), largest family (`bios`) has 14
- **Found and fixed a real pagination bug** while running this: 
  several Supabase queries across the content-generation scripts *and* 
  the live app (`fetchExistingWordSet`, the root-consolidation queries, 
  Learn's "All tiers/All domains" fetch, Quiz's distractor-fallback 
  fetch) had no explicit pagination, so once the word bank passed 
  Supabase's default 1000-row cap, they silently returned a truncated 
  result — in the generation scripts this caused already-existing 
  words to look "new" and get spuriously reflagged as failures. All 
  now paginate explicitly (`lib/supabaseUtil.js`'s `fetchAllRows` in 
  the app, an equivalent helper in each script)

## Additional CAT-relevant question formats

**Important clarification on scope:** CAT has no standalone or direct 
vocabulary section — vocabulary is tested indirectly and contextually 
within VARC, influencing the ability to decode dense passages, 
identify author's tone, and solve paragraph summaries. Direct 
vocabulary formats (synonyms, antonyms, analogies) belong to OMETs 
(Other Management Entrance Tests — XAT, SNAP, NMAT, CMAT), not CAT 
itself. Since Vocabl is scoped as CAT-only (see MVP scope), **analogy 
pairs are out of scope** — that format is OMET-specific and doesn't 
belong in an authentic CAT-practice app. If Vocabl ever expands beyond 
CAT to cover OMETs, analogies would become relevant then, not before.

When direct vocabulary is tested in CAT practice sets (as a training 
exercise for the underlying skill, not because the real exam asks 
these questions), it follows four primary styles. The current exam 
pattern prioritizes contextual inference over rote memorization, so 
all four formats should lean on deducing meaning from surrounding 
text rather than isolated recall:

1. **Contextual Closest Meaning** (synonym based on a sentence) — 
   **already built**, this is what the Quiz (cloze) format does: a 
   sentence with the word blanked, pick the word that fits the 
   context
2. **Confusing Word Pairs** (homophones/homonyms, e.g., disburse vs. 
   disperse) — **already built** (see Core gameplay modes above): a 
   `confusing_pairs` table (`word`, `commonly_confused_with`, 
   `word_meaning`, `confused_meaning`, `demonstrating_sentence`), 24 
   seed pairs → 48 rows via `generate-confusing-pairs.js`
3. **Word Usage Errors** (identifying incorrect contextual usage) — 
   **already built** (see Core gameplay modes above): 5 sentences per 
   word (tier 2-4 only, 860 words), 4 correct and 1 subtly wrong, 
   identify the wrong one, via `generate-usage-errors.js`
4. **Odd Word Out** (thematic exclusion — which word doesn't share the 
   group's meaning) — **already built** (see Core gameplay modes above): 
   67 meaning clusters (avg size 4.0, 268 words) via 
   `generate-meaning-clusters.js`, questions assembled at runtime

All four formats are now live in Vocabl's Practice menu. Double-blank 
cloze and analogy pairs are explicitly out of scope for a CAT-only app.

## Voice and tone (general app copy)

The "deadpan internet-friend" persona, generalized from WordFit's 
individual-interest-based version to a broadly "extremely online" 
register, is no longer used for in-round hints (superseded by the 
context-blank hint). It remains available for other app copy — streak 
messages, empty states, milestone moments.

**Rules:** one internet-culture reference at a time maximum, no forced 
slang, dry and understated rather than jokey.

**Illustrative examples (originally written as hint content, now 
reference for general voice only):**
- *dogmatic* — "main character energy but for opinions. zero 
  flexibility, all confidence."
- *ephemeral* — "basically an Instagram story. gone before you can 
  screenshot it."

Etymology content specifically should stay genuinely informative rather 
than voiced/jokey — it works as a mnemonic because it's real and clear.

## Authentication and user data

- Login required before play (email + password, via Supabase Auth — no 
  custom credential storage)
- Welcome screen → Sign Up / Log In (single screen, toggle between 
  modes) → Home
- Session persists across visits; basic logout available
- Password reset via Supabase Auth's built-in flow
- **Name field**: collected at signup, shown but optional (not 
  required) — stored as null if skipped, with graceful fallback 
  anywhere a name would be displayed
- **This reintroduces onboarding friction** that the original MVP 
  scope deliberately avoided (originally: welcome → play, zero 
  friction). This was a deliberate tradeoff to enable cross-session/
  cross-device progress persistence and behavior logging — worth 
  watching signup drop-off once real usage data comes in
- All user-data tables use real Supabase Auth `user_id` 
  (`auth.uid()`), not an anonymous/session-based scheme
- Row Level Security (RLS) must be enabled and correctly scoped (per-
  user access only) on every table containing user data before public 
  launch — this is a pre-deployment audit item, not optional

## Feedback and rating

- Accessible any time via a settings/profile menu (not gated behind a 
  specific screen, not forced after a session)
- Form includes: a standalone 1-5 star rating (submittable alone, no 
  other fields required), a category selector (e.g., "Loved 
  something" / "Something's missing" / "Found a bug" / "Other"), and 
  free-text message — all three independently optional, but at least 
  one must be filled before submit is enabled
- Stored in a `feedback` table (`id`, `user_id`, `rating`, `category`, 
  `message`, `created_at`)
- Submission logged as a `feedback_submitted` event

## Behavior logging

A `user_events` table captures usage patterns, separate from the 
result-tracking tables:

Schema: `id`, `user_id`, `event_type`, `event_data` (jsonb), 
`created_at`

Events logged include: `signup`, `login`, `quiz_started`, 
`quiz_completed` (with `exited_early` flag), `learn_session_started`, 
`learn_session_completed`/`exited`, `screen_viewed`, 
`feedback_submitted`. Historical rows also contain hangman-era event 
types (`hangman_round_started`, `hangman_round_completed`, and 
hangman's own `session_started`/`session_completed`/`session_exited`) 
from before Hangman was removed — those types are no longer emitted, 
but old rows are left in place rather than deleted.

This is queried directly in Supabase for analysis (DAU/WAU, drop-off 
points, mode usage) — no admin dashboard built yet.

### DAU / WAU

Computed via `count(distinct user_id)` against `user_events` for a 
given day (DAU) or trailing 7-day window (WAU) — deduplication by user 
is what prevents one highly active user from inflating the count. A 
Supabase view can be created for convenience (e.g., 
`daily_active_users`) rather than re-writing the query each time. 
DAU/WAU ratio is a useful derived stickiness metric given the app's 
core bet is daily-habit formation.

## Tech stack

React (Vite) + Supabase (DB, auth) + Claude API (content generation, 
offline/batch only — never called live from the deployed app) + Vercel 
(deployment via GitHub, auto-deploys on push to main).

Vocabl has its own GitHub repo (`VaibhaviSharma/Vocabl`, public) — it 
was originally committed inside WordFit's `Fivewords` monorepo, then 
split out into its own history and repo since the two apps have 
separate release cadences and don't share deployment.

## Pre-deployment checklist

- No hardcoded secrets anywhere in the codebase; all keys via 
  environment variables, set both locally (`.env`, gitignored) and in 
  Vercel's project settings
- RLS enabled and correctly scoped on all user-data tables; `words` 
  table readable by authenticated users but not writable by them 
  (writes only via the batch-generation script using a service role 
  key)
- Production build (`npm run build`) runs clean with no errors
- Auth email flow (confirmation requirement, password reset) confirmed 
  functional
- Personal end-to-end test completed (signup, multiple full sessions 
  across Learn/Practice/Quiz, feedback submission, logout/login) 
  before any public marketing push
- Real-device mobile test completed (own phone + at least one Android 
  tester), not just emulator/DevTools simulation

## What's reused vs. built new from WordFit

**Reused directly:** pastel card-based visual system, general tech 
stack and deployment flow, general persona/voice approach (for non-
hint copy).

**Reused as a pattern, not literal code:** the concept of adaptive/
intelligent word serving (WordFit's is interest-driven; Vocabl's is 
tier-driven).

**New, no WordFit equivalent:** login/auth, Learn (flashcard) mode, 
Word Family/root browsing, quiz history tracking, feedback/rating 
system, behavior event logging, the context-fit cloze quiz format, 
Confusing Word Pairs, and the static batch-generation content pipeline 
with self-check guardrails.

**Built, then removed:** Hangman (letter-guessing, continuous 10-word 
sessions, custom keyboard, dynamic attempts) — was WordFit's core 
reused mechanic, since deprecated as part of the pivot to an authentic 
CAT-practice identity.

## Marketing / go-to-market (planned, not yet executed)

- Free app, optimized for downloads/activity over monetization
- Primary channels identified: r/CATprep (most active free CAT 
  aspirant community), personal LinkedIn post (doubles as portfolio 
  content), CAT-coaching-adjacent Telegram channels (Rodha, 2IIM, 
  Cracku, VARC1000), and later, direct outreach to coaching institutes 
  for partnership/referral
- Sequencing: private test with a few trusted people first (ideally 
  including at least one Android user) → fix what surfaces → public 
  posts
- Positioning must stay honest about what CAT actually tests (RC/tone/
  para-completion via context, not isolated vocab questions) — avoid 
  marketing copy that implies the app mimics real CAT question formats

## Open decisions

1. Whether to build Word Usage Errors or Odd Word Out next (Word Usage 
   Errors identified as higher priority, since it's closer to CAT's 
   actual RC-inference skill)
2. Whether `tone` domain content gets any distinct visual treatment 
   elsewhere in the app
3. Whether/when to pursue native app wrapping (Capacitor) vs. staying 
   web + PWA long-term — deferred until real usage data exists

## Immediate next steps

1. ~~Complete the word bank expansion to 1000 words~~ (done — 1026 words)
2. ~~Build Word Usage Errors and Odd Word Out as the remaining 
   Practice-menu formats~~ (done — all four formats live)
3. Run the pre-deployment security/readiness audit
4. Personally test the app end-to-end; recruit 2-3 private testers 
   (including Android)
5. Deploy to Vercel
6. Begin private/soft launch via trusted testers before any public 
   community post
