#!/usr/bin/env node
// Vocabl example_sentence regeneration script.
//
// Rewrites example_sentence for every existing row in the `words` table to
// match a stricter editorial/argumentative register (see buildPrompt below),
// since this field now doubles as the in-round hangman hint — shown to the
// player with the target word blanked out, automatically, for the whole
// round. The old register (looser, some rows closer to casual/narrative)
// predates that requirement.
//
// This is a maintenance script, not a one-off: it's safe to re-run (it
// always regenerates every row's example_sentence fresh), though there's
// normally no reason to run it more than once after a register change.
//
// Setup: same .env as generate-words.js (ANTHROPIC_API_KEY, SUPABASE_URL,
// SUPABASE_SERVICE_KEY).
//
// Run:
//   node regenerate-example-sentences.js
//
// Rows that fail the self-check twice are left untouched (their existing
// example_sentence is kept) and logged to needs_review.csv for manual
// attention.

import 'dotenv/config'
import { appendFileSync, existsSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

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

async function fetchAllWords() {
  const { data, error } = await supabase
    .from('words')
    .select('id, word, source_domain, correct_definition, distractor_definitions')
    .order('word')
  if (error) throw new Error(`Failed to fetch words: ${error.message}`)
  return data
}

function containsExactWord(sentence, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i').test(sentence)
}

function buildPrompt(row, retryNote) {
  const { word, source_domain: domain, correct_definition, distractor_definitions } = row

  const toneClause =
    domain === 'tone'
      ? `\nThis word describes an author's attitude/stance (a "tone" word). The sentence should model argumentative or evaluative prose — a writer clearly taking a stance or expressing judgment on something — mirroring CAT's "the author's tone can best be described as ___" question format. Example, for "sardonic": "His sardonic remarks about the merger left little doubt that he saw the deal as a symbolic gesture rather than a genuine strategic shift."\n`
      : ''

  return `You are refining content for Vocabl, a CAT (Indian MBA exam) vocabulary app. The word "${word}" already has these fixed MCQ definition options — do not change or reinterpret them, just write a sentence consistent with them:
- Correct: ${correct_definition}
- Distractor 1: ${distractor_definitions[0]}
- Distractor 2: ${distractor_definitions[1]}
- Distractor 3: ${distractor_definitions[2]}

Write ONE new example_sentence using "${word}" that reads like a sentence from a serious editorial, opinion piece, or academic article (The Economist, The Hindu op-eds, LiveMint, Aeon) — NOT a casual or narrative anecdote. Rules:
- Subject should be abstract or institutional: a policy, an argument, a social trend, an economic effect, a philosophical position, a historical development — not a person's day-to-day story.
- One sentence total (a subordinate clause is fine).
- No first-person, no dialogue, no casual framing ("my friend," "the group chat," etc).
- "${word}" must appear in its exact, unmodified/base form (not an inflected variant) — this sentence is shown to the player with the word blanked out as an in-round hint, so the app needs to find the literal word in the text.
- Its meaning should be inferable from the surrounding argument/context.
Example of the target register, for "dogmatic": "Critics argued that the committee's dogmatic insistence on a single policy framework ignored the complexity of the underlying data." Example of what to AVOID (too casual/narrative): "The group chat had one dogmatic member who refused to admit the restaurant pick was wrong."
${toneClause}
Then self-check: does the sentence read naturally, does "${word}" fit unambiguously in the sense given by the correct definition above, and — given this new sentence as context — is exactly one of the 4 definition options above still clearly the correct one (i.e. the sentence doesn't accidentally make a distractor seem equally valid)? Set self_check_passed to true only if all of this holds.
${retryNote ? `\n${retryNote}\n` : ''}
Respond only with valid JSON, no other text, no markdown formatting, no preamble, in exactly this shape:
{"example_sentence": "...", "self_check_passed": true}`
}

function parseResult(rawText, word) {
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1].trim() : rawText.trim()

  let entry
  try {
    entry = JSON.parse(candidate)
  } catch {
    return { entry: null, valid: false }
  }

  const valid =
    typeof entry.example_sentence === 'string' &&
    containsExactWord(entry.example_sentence, word) &&
    entry.self_check_passed === true

  return { entry, valid }
}

async function generateSentence(row, retryNote) {
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 512,
    messages: [{ role: 'user', content: buildPrompt(row, retryNote) }],
  })
  const rawText = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
  return parseResult(rawText, row.word)
}

async function generateWithRetry(row) {
  const first = await generateSentence(row)
  if (first.valid) return first.entry

  await sleep(DELAY_BETWEEN_CALLS_MS)

  const retryNote =
    'Your previous attempt failed validation (either too casual/narrative, ' +
    'missing the exact base form of the word, or it made a distractor seem ' +
    `equally valid). Fix the specific issue and try again for "${row.word}".`
  const second = await generateSentence(row, retryNote)
  if (second.valid) return second.entry

  return null
}

function logNeedsReview(word, domain) {
  if (!existsSync(NEEDS_REVIEW_PATH)) {
    writeFileSync(NEEDS_REVIEW_PATH, 'word,domain,rough_tier\n')
  }
  appendFileSync(NEEDS_REVIEW_PATH, `${word},${domain},\n`)
}

async function main() {
  const words = await fetchAllWords()
  console.log(`Loaded ${words.length} words to regenerate example_sentence for.\n`)

  let updated = 0
  let flagged = 0
  const failedWords = []

  for (let i = 0; i < words.length; i++) {
    const row = words[i]
    const progress = `[${i + 1}/${words.length}]`

    try {
      const result = await generateWithRetry(row)

      if (!result) {
        console.log(`${progress} ${row.word} — FAILED self-check twice, kept old sentence, flagged`)
        logNeedsReview(row.word, row.source_domain)
        flagged++
        failedWords.push(row.word)
        await sleep(DELAY_BETWEEN_CALLS_MS)
        continue
      }

      const { error } = await supabase
        .from('words')
        .update({ example_sentence: result.example_sentence })
        .eq('id', row.id)
      if (error) throw new Error(`Supabase update failed: ${error.message}`)

      console.log(`${progress} ${row.word} — regenerated, self-check passed`)
      updated++
    } catch (err) {
      console.log(`${progress} ${row.word} — ERROR: ${err.message}`)
      logNeedsReview(row.word, row.source_domain)
      flagged++
      failedWords.push(row.word)
    }

    await sleep(DELAY_BETWEEN_CALLS_MS)
  }

  console.log('\n=== Summary ===')
  console.log(`Total processed: ${words.length}`)
  console.log(`Updated: ${updated}`)
  console.log(`Flagged for review (kept old sentence): ${flagged}`)
  if (failedWords.length > 0) {
    console.log(`Failed words: ${failedWords.join(', ')}`)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
