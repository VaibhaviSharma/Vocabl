# Vocabl — MVP Scope Document

## What this is

Vocabl is a vocabulary-building web app for CAT (Common Admission Test) aspirants, spun off from the design patterns and architecture built for WordFit. It reuses WordFit's core mechanics (hangman gameplay, dynamic attempt formula, pastel card-based UI, deadpan/internet-savvy persona) while dropping interest-based personalization in favor of a fully static, exam-focused content model.

## Why CAT, and why this approach

- No app on the App Store is a dedicated, standalone, well-designed CAT-vocab-only product. Existing CAT apps on iOS are full exam-prep suites (quant, DILR, mock tests) with vocabulary buried as one minor feature.
- Standalone CAT vocab apps exist on the Play Store (Android), but execution is weak — user reviews cite incomplete or outright wrong definitions, no homonym handling, and no real game mechanic (just wordlists with flashcards/MCQs bolted on).
- This means the gap isn't "no CAT vocab apps exist" — it's "no *good, habit-forming* CAT vocab app exists," on either platform, and especially on iOS.
- CAT itself does not test vocabulary directly (no synonym/antonym or fill-in-the-blank questions since ~2014). Vocabulary matters indirectly: RC (Reading Comprehension) makes up 65-70% of the VARC section, and not knowing a word in a dense passage slows down reading speed and comprehension, costing time and accuracy on inference questions. Vocabl's honest value prop is "remove word-friction in RC passages," not "ace direct vocab questions."
- GRE was considered but deprioritized for MVP — it's a more crowded space with decent incumbents (Magoosh, Vocabulary Whiz) already covering it well. CAT has real, if poorly-served, demand.
- The architecture keeps exam type as a filter/mode on a shared word-serving system rather than a forked codebase, so GRE (or other exams) can be added later without a rebuild.

## Platform strategy

- Build as a web app (React + Vite) first, deployed to Vercel via GitHub — same playbook as WordFit.
- Defer native app-store presence (iOS/Android) until the web MVP validates engagement.
- A web-first approach also sidesteps testing constraints (no Android device on hand) — Android testing can happen via emulator (Android Studio AVD) or Chrome DevTools device emulation, with cloud device testing (Firebase Test Lab, BrowserStack) as a pre-launch check on real hardware, particularly for performance on lower-end/budget Android devices common among the CAT audience.
- Platform prioritization (iOS vs. Android vs. both) will be decided later based on actual usage data from the web MVP, not guessed upfront.

## MVP scope

**In scope:**
- CAT vocabulary only (no GRE, no exam-selector)
- Web app, no native wrapping yet
- Onboarding: welcome screen → straight into play (no interest picker, no calibration quiz, no exam selector)
- Hangman as the core "first encounter" game mechanic, with dynamic attempt count based on word tier
- Adaptive difficulty via a rolling success-rate window, no upfront calibration quiz
- Every word tracked with a single correct/incorrect status per user, set on first attempt and overwritten by any later attempt (hangman or quiz)
- MCQ-based review/quiz mode, filterable by All or Incorrect-only
- Fully static, pre-generated word content (no live LLM calls during gameplay)

**Explicitly out of scope for v1:**
- Interest-based personalization (dropped — adds complexity without a clear CAT-specific benefit; the differentiation for Vocabl is the mechanic + content quality + habit loop, not personalization)
- Calibration quiz at onboarding (may be added later if data shows a need; tiering + adaptive difficulty should self-correct within the first session or two)
- Full attempt-history tracking (only last-result-wins for now; can be layered on later without breaking the schema)
- GRE support
- Native iOS/Android apps
- CAT-specific content types beyond single/multi-word vocabulary (e.g., one-word substitutions, idioms) — possible v2 addition

## Core gameplay loop

1. **New word encounter (Hangman):** User is served a word based on their current difficulty tier (see Adaptive Difficulty below). They guess letters via a custom on-screen keyboard (not the native device keyboard, for visual consistency and input control). A hint is available on request. Dynamic attempt count scales with word tier — harder words allow more attempts.
2. **Post-round:** Word's definition and example sentence are shown regardless of outcome. Result (correct/incorrect) is logged.
3. **Review (Quiz mode):** User can revisit any previously-played word via a fast multiple-choice quiz (word → 4 definitions, 1 correct), filterable to see All words played or Incorrect-only. This is the "cramming" mode — faster and less time-intensive than hangman, meant for reinforcement rather than first-encounter learning.

## Adaptive difficulty

- Each user has a `current_tier` (1-5) per account, starting at tier 1.
- Word serving uses a weighted mix: ~70% current tier, ~20% one tier below (reinforcement), ~10% one tier above (stretch/preview).
- A rolling window of the last ~10 words played tracks success rate. Consistently high success (e.g., 80%+, low attempt usage) bumps `current_tier` up by one. Consistent struggle (e.g., below 40-50% success, frequent max-attempt usage) steps it down.
- This replaces the need for an upfront calibration quiz — the tier data model (per-word difficulty tag) is designed so a real calibration step could be added later without changing the underlying schema.

## Word status tracking

- Each (user, word) pair has a single `status` field: correct or incorrect.
- Set on the first hangman attempt. Overwritten by any subsequent attempt, whether in hangman (replay) or quiz mode.
- No attempt-count or history log in v1 — this is a deliberate simplification. A richer history table can be added later as a superset of this model without breaking existing data.
- This status field powers both the Quiz mode's Incorrect-only filter and (eventually) tier-advancement logic.

## Content model (fully static)

Every word is pre-generated once via an LLM + web search batch pipeline and stored in the database — no live generation during gameplay, for cost control, quality consistency, and latency reasons.

**Per-word schema:**
| Field | Description |
|---|---|
| `word` | The vocabulary word or short phrase |
| `tier` | Difficulty tier, 1 (common) to 5 (obscure) |
| `correct_definition` | Plain, register-neutral definition |
| `distractor_definitions` | 3 plausible-but-wrong definitions, same register as the correct one, avoiding the homonym trap (i.e., not accidentally another valid sense of the same word) |
| `hints` | Array of 3-4 pre-generated hint variants, dry/internet-savvy tone (one cultural reference max per hint, no forced slang). At runtime, the app picks one at random each time the word is served, so a word doesn't feel identical on repeat encounters — bounded variety, not live generation. |
| `example_sentence` | Grounded, RC-passage-register usage example (shown post-round, not personalized) |
| `source_domain` | Subject tag (see Word sourcing below) |

**Generation guardrail:** each generated word's MCQ set gets a self-check pass ("is exactly one of these four options unambiguously correct") before being accepted — this directly targets the wrong-definition/ambiguous-homonym quality problems seen in existing weak competitor apps.

**Why hints are an array, not a live call:** early on we considered generating hints live per-play for more variety, but that reopens the cost/latency/quality risks the static-content approach was designed to avoid (runtime cost scaling with success on a free app, visible wait mid-round, unvetted content shipping straight to users). Pre-generating 3-4 variants per word in the same batch call — then randomly rotating at runtime — gets most of the "doesn't feel identical every time" benefit at effectively zero marginal cost, since it's still just a database read at play time. One-time generation cost for the full ~293-word seed list, including 4 hint variants each, is roughly $3-5 total (Claude API, Sonnet pricing) — a one-time cost, not a recurring per-play cost.

## Voice and tone

Hints and (to a lesser degree) example sentences use the same "deadpan internet-friend" persona established for WordFit, generalized from individual-interest-based to a broadly "extremely online" register.

**Rules:**
- One internet-culture reference per hint, maximum — avoid stacking references, which reads as try-hard
- No forced slang — dry/observational tone ages better than actively "using" slang terms
- Sentences stay grounded and realistic, not jokey — personality lives in the hint, not the sentence, since the sentence also needs to function as a plausible academic/journalistic usage example

**Examples locked in during design:**
- *dogmatic* — hint: "main character energy but for opinions. zero flexibility, all confidence."
- *ephemeral* — hint: "basically an Instagram story. gone before you can screenshot it."
- *obfuscate* — hint: "corporate email speak for 'we're hiding something.'"
- *gregarious* — hint: "the friend who talks to strangers in line and somehow gets their number."

## Word sourcing

CAT has no official vocabulary list (same situation as GRE). Community-converged lists exist via coaching institutes (CATKing and similar) and recurring editorial vocabulary (The Hindu, LiveMint, The Economist). Research shows CAT RC passages draw roughly 65-75% of their difficult vocabulary from a consistent set of subject domains.

**Domains used for sourcing and tagging (`source_domain`):**
Philosophy, Economics, Science, Psychology, Sociology, Politics, Literature, Environment, Tone (attitude/emotion vocabulary — see below), and General (high-frequency, cross-register words not tied to a specific subject).

**Tone as a distinct domain:** CAT RC frequently tests inference about authorial tone/attitude (e.g., "the author's tone toward X is best described as ___"). This is a functionally distinct vocabulary category from subject-matter words, so it's tracked as its own domain rather than folded into General.

**Seed list status:** a 293-word candidate list has been compiled across all 10 domains (`vocabl_source_wordlist.csv`), with a rough tier estimate per word. This is an input to the batch-generation pipeline, not the final database — actual tier assignment gets refined during generation, and the list can be expanded incrementally post-launch using the same sourcing approach.

**Domain breakdown (final, v1 seed list):** general 74, philosophy 30, economics 27, science 27, psychology 25, literature 25, politics 25, sociology 23, tone 20, environment 17.

**Multi-word entries — resolved:** v1 is single-word only. Hangman's core mechanic (guess letters to reveal one word) doesn't extend cleanly to multi-word phrases, and the affected terms were a small slice of the list (~15 of the original 307). Most were dropped without losing conceptual coverage, since a single-word equivalent already existed elsewhere in the list (e.g., "paradigm shift" → "paradigm," "systemic inequality" → "systemic," "environmental externalities" → "externality"). One genuine gap — "cognitive dissonance" — was replaced with the single word "dissonance" to preserve the concept. Removed entries: opportunity cost, game theory, invisible hand, purchasing power, paradigm shift, cognitive dissonance, normative claims, regulatory oversight, systemic inequality, institutional frameworks, ecological footprint, carbon neutral, fossil fuel, greenhouse effect, environmental externalities.

## Content generation pipeline

1. **Input:** the seed word list (CSV), organized by domain and rough tier.
2. **Batch script:** loops through each word, makes one Claude API call per word to generate the full row (`correct_definition`, `distractor_definitions`, `hint`, `example_sentence`, refined `tier`), including the self-check guardrail.
3. **Output:** writes each validated row directly into the Supabase `words` table.
4. **QA:** words failing the self-check are logged separately for manual review or regeneration; a spot-check sample (~10%) of passing words is manually reviewed before considering the batch launch-ready.
5. **Ongoing:** the same script can be re-run periodically to expand the word bank, since this is a growing content pipeline rather than a one-time fixed batch.

This script should be built as a reusable tool (not a one-off/throwaway), since the word bank is expected to grow over time.

## Tech stack (reused from WordFit)

React (Vite) + Supabase (DB, auth) + Claude API (content generation) + Vercel (deployment via GitHub).

## UI direction

Same pastel, card-based visual system as WordFit, repurposed (not personalized/interest-colored):
- Home screen: daily word card, streak counter, quick stats (words played, words to review)
- Hangman round screen: hint card (one randomly-selected variant from the word's `hints` array shown per encounter), letter-reveal row, custom on-screen keyboard (not native device keyboard — for visual consistency, guessed-letter graying, and input validation), tier/domain tag
- "My Words" / review screen: quiz mode entry point with All / Incorrect-only filter

## What's reused vs. rebuilt from WordFit

**Reused directly:** hangman component and dynamic attempt formula, custom keyboard pattern, card-based layout and pastel visual system, persona/voice generation approach, full tech stack and deployment flow.

**Reused as a pattern, not literal code:** word-serving logic (same category of system — intelligent word selection — but CAT's tier-driven adaptive logic is a different implementation from WordFit's interest-driven selection).

**New, no WordFit equivalent:** MCQ review/quiz mode with All/Incorrect filtering, the static batch-generation content pipeline (WordFit generates content live per-user; Vocabl requires one-time/periodic batch generation instead).

## Open decisions before build

1. Whether `tone` gets a distinct visual/UI treatment or is treated identically to subject domains
2. Final review and expansion of the 293-word seed list once run through the generation pipeline

## Immediate next steps

1. Build the batch-generation script (Claude API call per word → Supabase write, with self-check guardrail)
2. Run the pipeline against the seed list, spot-check output
3. Build core screens: welcome, home, hangman round, review/quiz mode
