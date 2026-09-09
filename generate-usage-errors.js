#!/usr/bin/env node
// Vocabl Word Usage Errors generation script.
//
// For each eligible word (tier 2-4 — very easy or very obscure words don't
// reliably produce good "spot the error" material) that doesn't already
// have usage_sentences rows, generates 5 sentences using the word: 4
// correct, 1 subtly wrong. Self-checked (exactly one clearly-wrong
// sentence, the other 4 unambiguously correct), retried once on failure,
// logged to needs_review.csv otherwise — same pattern as the rest of the
// content pipeline.
//
// This is a separate, additive batch job, not part of the core per-word
// pipeline in generate-words.js — it only touches words that already
// exist, adding a new content layer for the Word Usage Errors practice
// format.
//
// Setup: same .env as generate-words.js (ANTHROPIC_API_KEY, SUPABASE_URL,
// SUPABASE_SERVICE_KEY).
//
// Run:
//   node generate-usage-errors.js
//
// Re-run later to cover more words: words that already have
// usage_sentences rows are skipped automatically.

import 'dotenv/config'
import { appendFileSync, existsSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const NEEDS_REVIEW_PATH = './needs_review.csv'
const CLAUDE_MODEL = 'claude-sonnet-4-6'
const DELAY_BETWEEN_CALLS_MS = 300
const MIN_TIER = 2
const MAX_TIER = 4

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

// Paginated explicitly: Supabase's default 1000-row cap would otherwise
// silently truncate this once a table passes 1000 rows (bit us once
// already on the word bank — see generate-words.js).
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

async function fetchEligibleWords() {
  const words = await fetchAllRows('words', 'id, word, correct_definition, part_of_speech', (q) =>
    q.gte('tier', MIN_TIER).lte('tier', MAX_TIER)
  )
  const existing = await fetchAllRows('usage_sentences', 'word_id')
  const covered = new Set(existing.map((r) => r.word_id))
  return words.filter((w) => !covered.has(w.id))
}

function buildPrompt(word, retryNote) {
  const { word: term, correct_definition, part_of_speech } = word
  return `You are generating "Word Usage Errors" practice content for Vocabl, a CAT (Indian MBA exam) vocabulary app. The target word is "${term}" (${part_of_speech}), meaning: ${correct_definition}

Generate exactly 5 sentences using "${term}" in its exact, unmodified base form, in a serious editorial/argumentative register (The Economist, The Hindu op-eds, LiveMint, Aeon) — abstract/institutional subject matter, no casual/narrative framing:

- 4 sentences where "${term}" is used CORRECTLY, each ideally illustrating a slightly different valid context (not 4 near-identical sentences repeating the same scenario)
- 1 sentence where "${term}" is used INCORRECTLY — a genuine, identifiable error: the wrong sense of the word, a meaning that doesn't fit the context, or usage as the wrong part of speech. This must be a real, clear-cut mistake a careful reader would catch — not a trick, not ambiguous, not just awkward phrasing. Example of the kind of error to aim for: using "amaze" to mean "gather/accumulate" (that's actually "amass") — a plausible-sounding but definitely wrong substitution.

Then self-check: is exactly one of the 5 sentences unambiguously incorrect, and are the other 4 unambiguously correct? If you're not confident the error is clear-cut and identifiable (not borderline or debatable), set self_check_passed to false rather than forcing a weak example.
${retryNote ? `\n${retryNote}\n` : ''}
Respond only with valid JSON, no other text, no markdown formatting, no preamble, in exactly this shape:
{"sentences": [{"sentence": "...", "is_correct": true}, {"sentence": "...", "is_correct": true}, {"sentence": "...", "is_correct": true}, {"sentence": "...", "is_correct": true}, {"sentence": "...", "is_correct": false}], "self_check_passed": true}`
}

function containsExactWord(sentence, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i').test(sentence)
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

  const structurallyValid =
    Array.isArray(entry.sentences) &&
    entry.sentences.length === 5 &&
    entry.sentences.every((s) => typeof s.sentence === 'string' && typeof s.is_correct === 'boolean') &&
    entry.sentences.filter((s) => s.is_correct === false).length === 1 &&
    entry.sentences.every((s) => containsExactWord(s.sentence, word))

  return { entry, valid: structurallyValid && entry.self_check_passed === true }
}

async function generate(word, retryNote) {
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1536,
    messages: [{ role: 'user', content: buildPrompt(word, retryNote) }],
  })
  const rawText = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
  return parseResult(rawText, word.word)
}

async function generateWithRetry(word) {
  const first = await generate(word)
  if (first.valid) return first.entry

  await sleep(DELAY_BETWEEN_CALLS_MS)

  const retryNote =
    'Your previous attempt failed validation (either not exactly one sentence ' +
    'was marked incorrect, one of the sentences did not contain the exact, ' +
    `unmodified word, or the error wasn't clear-cut enough). Fix the specific issue and try again for "${word.word}".`
  const second = await generate(word, retryNote)
  if (second.valid) return second.entry

  return null
}

function logNeedsReview(word, domain) {
  if (!existsSync(NEEDS_REVIEW_PATH)) {
    writeFileSync(NEEDS_REVIEW_PATH, 'word,domain,rough_tier\n')
  }
  appendFileSync(NEEDS_REVIEW_PATH, `${word},${domain || 'usage_errors'},\n`)
}

async function main() {
  const words = await fetchEligibleWords()
  console.log(`${words.length} tier ${MIN_TIER}-${MAX_TIER} words eligible (no usage_sentences yet).\n`)

  let written = 0
  let flagged = 0
  const failedWords = []

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    const progress = `[${i + 1}/${words.length}]`

    try {
      const entry = await generateWithRetry(word)

      if (!entry) {
        console.log(`${progress} ${word.word} — FAILED self-check twice, flagged for review`)
        logNeedsReview(word.word)
        flagged++
        failedWords.push(word.word)
        await sleep(DELAY_BETWEEN_CALLS_MS)
        continue
      }

      const rows = entry.sentences.map((s) => ({ word_id: word.id, sentence: s.sentence, is_correct: s.is_correct }))
      const { error } = await supabase.from('usage_sentences').insert(rows)
      if (error) throw new Error(`Supabase insert failed: ${error.message}`)

      console.log(`${progress} ${word.word} — generated, self-check passed`)
      written++
    } catch (err) {
      console.log(`${progress} ${word.word} — ERROR: ${err.message}`)
      logNeedsReview(word.word)
      flagged++
      failedWords.push(word.word)
    }

    await sleep(DELAY_BETWEEN_CALLS_MS)
  }

  console.log('\n=== Summary ===')
  console.log(`Total processed: ${words.length}`)
  console.log(`Written: ${written}`)
  console.log(`Flagged for review: ${flagged}`)
  if (failedWords.length > 0) {
    console.log(`Failed words: ${failedWords.join(', ')}`)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
