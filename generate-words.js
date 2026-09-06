#!/usr/bin/env node
// Vocabl word batch generation script.
//
// Reads the seed word list (./data/vocabl_source_wordlist.csv), and for each
// word not already present in the `words` table, calls the Claude API to
// generate a full row (definition, distractors, editorial-register example
// sentence, refined tier), self-checks the MCQ set, and writes the validated
// row to Supabase. The example_sentence doubles as the in-round hangman
// hint (shown with the target word blanked out), so it must contain the
// word in its exact base form — see regenerate-example-sentences.js for the
// separate script that refreshes this field on already-generated words.
//
// This is a reusable, re-runnable pipeline, not a one-off script: it always
// checks Supabase first and skips words that already exist, so expanding
// the seed CSV later and re-running is safe.
//
// Setup:
//   1. cp .env.example .env
//   2. Fill in ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY in .env
//   3. npm install
//
// Run:
//   node generate-words.js
//
// Re-run later to add new words:
//   - Append new rows to data/vocabl_source_wordlist.csv
//   - Run `node generate-words.js` again — existing words are skipped
//     automatically (case-insensitive match against the `words` table)
//   - Check needs_review.csv afterward for any words that failed the
//     self-check twice and need manual attention

import 'dotenv/config'
import { readFileSync, appendFileSync, existsSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import Papa from 'papaparse'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const CSV_PATH = './data/vocabl_source_wordlist.csv'
const NEEDS_REVIEW_PATH = './needs_review.csv'
const CLAUDE_MODEL = 'claude-sonnet-4-6'
const DELAY_BETWEEN_CALLS_MS = 300

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!ANTHROPIC_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    'Missing required env vars. Copy .env.example to .env and fill in ' +
      'ANTHROPIC_API_KEY, SUPABASE_URL, and SUPABASE_SERVICE_KEY.'
  )
  process.exit(1)
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

function readSeedWords() {
  const raw = readFileSync(CSV_PATH, 'utf8')
  const { data, errors } = Papa.parse(raw, { header: true, skipEmptyLines: true })
  if (errors.length > 0) {
    throw new Error(`Failed to parse ${CSV_PATH}: ${errors[0].message}`)
  }
  return data.map((row) => ({
    word: row.word.trim(),
    domain: row.domain.trim(),
    roughTier: parseInt(row.rough_tier, 10),
  }))
}

// Paginated explicitly: Supabase's default 1000-row cap would otherwise
// silently truncate this once the word bank passes 1000 rows, making
// already-existing words look "new" and get regenerated/reflagged.
// `buildQuery` receives the base `supabase.from(table).select(columns)`
// query so callers can chain additional filters (e.g. `.not(...)`) before
// pagination is applied.
async function fetchAllRows(table, columns, buildQuery = (q) => q) {
  let all = []
  let from = 0
  while (true) {
    const { data, error } = await buildQuery(supabase.from(table).select(columns)).range(from, from + 999)
    if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`)
    all = all.concat(data)
    if (data.length < 1000) break
    from += 1000
  }
  return all
}

async function fetchExistingWordSet() {
  const data = await fetchAllRows('words', 'word')
  return new Set(data.map((row) => row.word.toLowerCase()))
}

// Fetched once at startup, not refreshed mid-run — keeps prompt size (and
// cost) bounded across a large batch. Any root duplication introduced
// between two NEW words in the same run (rather than against this
// pre-existing list) is instead caught by the root-consolidation pass in
// generate-etymology.js, run after this script finishes.
async function fetchExistingRoots() {
  const data = await fetchAllRows('words', 'root, root_language', (q) => q.not('root', 'is', null))
  const seen = new Map()
  for (const row of data) {
    if (!seen.has(row.root)) seen.set(row.root, row.root_language)
  }
  return seen
}

function formatRootReference(rootsMap) {
  return [...rootsMap.entries()].map(([root, lang]) => `root_string="${root}" (${lang})`).join('\n')
}

function exampleSentenceRules(word, domain) {
  const toneClause =
    domain === 'tone'
      ? `\nThis word describes an author's attitude/stance (a "tone" word). The sentence should model argumentative or evaluative prose — a writer clearly taking a stance or expressing judgment on something — mirroring CAT's "the author's tone can best be described as ___" question format. Example, for "sardonic": "His sardonic remarks about the merger left little doubt that he saw the deal as a symbolic gesture rather than a genuine strategic shift."\n`
      : ''

  return `- example_sentence: one sentence using "${word}" that reads like a sentence from a serious editorial, opinion piece, or academic article (The Economist, The Hindu op-eds, LiveMint, Aeon) — NOT a casual or narrative anecdote. Rules:
  - Subject should be abstract or institutional: a policy, an argument, a social trend, an economic effect, a philosophical position, a historical development — not a person's day-to-day story.
  - One sentence total (a subordinate clause is fine).
  - No first-person, no dialogue, no casual framing ("my friend," "the group chat," etc).
  - "${word}" must appear in its exact, unmodified/base form (not an inflected variant like a different tense or plural) — this sentence is shown to the player with the word blanked out as an in-round hint, so the app needs to find the literal word in the text.
  - Its meaning should be inferable from the surrounding argument/context.
  Example of the target register, for "dogmatic": "Critics argued that the committee's dogmatic insistence on a single policy framework ignored the complexity of the underlying data." Example of what to AVOID (too casual/narrative): "The group chat had one dogmatic member who refused to admit the restaurant pick was wrong."${toneClause}`
}

function etymologyRules(word, existingRootsText) {
  return `- root: the core root morpheme "${word}" derives from. CRITICAL for grouping: use the standard, canonical citation form as it would appear in a scholarly etymology dictionary (e.g. a Greek root cited in its lemma form like "dogma" or "phemi"; a Latin root cited by its recognizable stem like "scrib/script" from "scribere"). This exact spelling must be reusable — if you were asked to generate this same root for a different word that shares it, you must produce the identical string, not a variant spelling or an ad hoc form with inconsistent hyphenation.

Before picking a spelling, check this list of roots already used elsewhere in the database (the language in parentheses is just a label for you to read, not part of the string):
${existingRootsText}

If "${word}" shares a root with any entry above, your root value must be copied EXACTLY from that entry's root_string="..." value — the bare text between the quotes only. Never include the words "root_string", an equals sign, quote characters, or the parenthesized language in the root field itself — those are formatting in this list, not part of the root spelling.

If you are not fully confident the root is historically accurate — including if you find yourself hedging between two possible derivations, or unsure whether it's the direct root vs. a loosely related word — set root (and root_meaning, root_language, etymology) to null rather than guessing. A null root is a valid, confident, PASSING answer, never a failure; it only means this word won't appear in a "same root" group, which is fine. Do not let an uncertain root be the reason the whole entry fails self-check — if the correct_definition/distractor_definitions/part_of_speech are solid, prefer null root over failing.
- root_meaning: the root's core meaning, a few words (e.g. "opinion, belief"). Null if root is null.
- root_language: the root's origin language (Greek, Latin, Old English, French, etc). Null if root is null.
- etymology: a 1-2 sentence memory-bridge narrative connecting the root to "${word}"'s current meaning. Null if root is null. Example, for "dogmatic": "From the Greek dogma, meaning 'opinion' or 'belief.' Someone dogmatic clings rigidly to their opinions as if they were settled fact."`
}

function buildPrompt(word, domain, roughTier, existingRootsText, retryNote) {
  return `You are generating one entry for Vocabl, a CAT (Indian MBA exam) vocabulary app. The target word is "${word}", from the "${domain}" domain, with a rough difficulty anchor of tier ${roughTier} (1 = very common, 5 = genuinely obscure).

Generate the following fields:

- correct_definition: a plain, register-neutral definition — think "clear dictionary definition," one sentence. Not encyclopedic, not overly academic.
- distractor_definitions: an array of exactly 3 plausible-but-wrong definitions. Each must be the real definition of a *different* real word in a similar register/domain to "${word}" (not a random unrelated concept), so they're genuinely tempting wrong answers. If "${word}" is a homonym with multiple senses, use its primary/most common sense as the correct definition, and do NOT let any distractor accidentally also be a valid definition of "${word}" itself.
${exampleSentenceRules(word, domain)}
- tier: a refined difficulty rating from 1 to 5, using ${roughTier} as a starting anchor but adjusting if it seems off.
- part_of_speech: exactly one of noun, verb, adjective, adverb — whichever matches how "${word}" is functioning in the example_sentence you write above.
${etymologyRules(word, existingRootsText)}

Then self-check your own output: verify that exactly one of the 4 definition options (correct_definition + the 3 distractor_definitions) is unambiguously the correct definition of "${word}", that none of the 3 distractors could also reasonably be considered a correct definition of "${word}", that part_of_speech genuinely matches the example_sentence's usage, and that the root/etymology (if not null) is historically accurate. Set self_check_passed to true only if all of this holds.
${retryNote ? `\n${retryNote}\n` : ''}
Respond only with valid JSON, no other text, no markdown formatting, no preamble, in exactly this shape:
{"correct_definition": "...", "distractor_definitions": ["...", "...", "..."], "example_sentence": "...", "tier": 3, "part_of_speech": "noun", "root": "...", "root_meaning": "...", "root_language": "...", "etymology": "...", "self_check_passed": true}`
}

const VALID_POS = ['noun', 'verb', 'adjective', 'adverb']

function containsExactWord(sentence, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i').test(sentence)
}

// root is nullable (a word can genuinely have no traceable root), but when
// it's present, its three dependent fields must all be non-null strings —
// and when it's null, they must all be null too, so the shape never drifts
// into a half-populated etymology.
function isValidEtymologyShape(entry) {
  if (entry.root === null) {
    return entry.root_meaning === null && entry.root_language === null && entry.etymology === null
  }
  return (
    typeof entry.root === 'string' &&
    // Guards against the model copying a whole `root_string="x" (Lang)`
    // reference-list entry instead of just the bare root text.
    !entry.root.includes('root_string') &&
    !entry.root.includes('"') &&
    !entry.root.includes('=') &&
    typeof entry.root_meaning === 'string' &&
    typeof entry.root_language === 'string' &&
    typeof entry.etymology === 'string'
  )
}

function parseGeneratedEntry(rawText, word) {
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1].trim() : rawText.trim()

  let entry
  try {
    entry = JSON.parse(candidate)
  } catch {
    return { entry: null, valid: false }
  }

  const structurallyValid =
    typeof entry.correct_definition === 'string' &&
    Array.isArray(entry.distractor_definitions) &&
    entry.distractor_definitions.length === 3 &&
    entry.distractor_definitions.every((d) => typeof d === 'string') &&
    typeof entry.example_sentence === 'string' &&
    containsExactWord(entry.example_sentence, word) &&
    Number.isInteger(entry.tier) &&
    entry.tier >= 1 &&
    entry.tier <= 5 &&
    VALID_POS.includes(entry.part_of_speech) &&
    isValidEtymologyShape(entry)

  return { entry, valid: structurallyValid && entry.self_check_passed === true }
}

async function generateEntry(word, domain, roughTier, existingRootsText, retryNote) {
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: buildPrompt(word, domain, roughTier, existingRootsText, retryNote) }],
  })
  const rawText = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
  return parseGeneratedEntry(rawText, word)
}

async function generateWithRetry(word, domain, roughTier, existingRootsText) {
  const first = await generateEntry(word, domain, roughTier, existingRootsText)
  if (first.valid) return first.entry

  await sleep(DELAY_BETWEEN_CALLS_MS)

  const retryNote =
    'Your previous attempt failed validation (either a distractor could also ' +
    'be considered correct, the example_sentence did not contain the exact, ' +
    'unmodified word, the root/root_meaning/root_language/etymology fields ' +
    'were inconsistently null vs populated, or the output was malformed). ' +
    `Fix the specific issue and try again for "${word}".`
  const second = await generateEntry(word, domain, roughTier, existingRootsText, retryNote)
  if (second.valid) return second.entry

  return null
}

function logNeedsReview(word, domain, roughTier) {
  if (!existsSync(NEEDS_REVIEW_PATH)) {
    writeFileSync(NEEDS_REVIEW_PATH, 'word,domain,rough_tier\n')
  }
  appendFileSync(NEEDS_REVIEW_PATH, `${word},${domain},${roughTier}\n`)
}

async function main() {
  const seedWords = readSeedWords()
  const existingWords = await fetchExistingWordSet()
  const existingRoots = await fetchExistingRoots()
  const existingRootsText = formatRootReference(existingRoots)

  console.log(
    `Loaded ${seedWords.length} seed words. ${existingWords.size} already in the database. ` +
      `${existingRoots.size} distinct roots already in use.\n`
  )

  let written = 0
  let skipped = 0
  let flagged = 0
  const failedWords = []

  for (let i = 0; i < seedWords.length; i++) {
    const { word, domain, roughTier } = seedWords[i]
    const progress = `[${i + 1}/${seedWords.length}]`

    if (existingWords.has(word.toLowerCase())) {
      console.log(`${progress} ${word} — already exists, skipped`)
      skipped++
      continue
    }

    try {
      const entry = await generateWithRetry(word, domain, roughTier, existingRootsText)

      if (!entry) {
        console.log(`${progress} ${word} — FAILED self-check twice, flagged for review`)
        logNeedsReview(word, domain, roughTier)
        flagged++
        failedWords.push(word)
        await sleep(DELAY_BETWEEN_CALLS_MS)
        continue
      }

      const { error } = await supabase.from('words').insert({
        word,
        tier: entry.tier,
        correct_definition: entry.correct_definition,
        distractor_definitions: entry.distractor_definitions,
        example_sentence: entry.example_sentence,
        source_domain: domain,
        part_of_speech: entry.part_of_speech,
        root: entry.root,
        root_meaning: entry.root_meaning,
        root_language: entry.root_language,
        etymology: entry.etymology,
      })
      if (error) throw new Error(`Supabase insert failed: ${error.message}`)

      console.log(`${progress} ${word} — generated, self-check passed`)
      written++
    } catch (err) {
      console.log(`${progress} ${word} — ERROR: ${err.message}`)
      logNeedsReview(word, domain, roughTier)
      flagged++
      failedWords.push(word)
    }

    await sleep(DELAY_BETWEEN_CALLS_MS)
  }

  console.log('\n=== Summary ===')
  console.log(`Total processed: ${seedWords.length}`)
  console.log(`Written: ${written}`)
  console.log(`Skipped (already existed): ${skipped}`)
  console.log(`Flagged for review: ${flagged}`)
  if (failedWords.length > 0) {
    console.log(`Failed words: ${failedWords.join(', ')}`)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
