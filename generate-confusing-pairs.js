#!/usr/bin/env node
// Vocabl Confusing Word Pairs generation script.
//
// Reads the seed pair list (./data/confusing_pairs_source.csv) and for
// each pair not already present in the `confusing_pairs` table, calls the
// Claude API once to generate both directions' content (meaning + a
// demonstrating sentence for each word), self-checks that swapping the
// other word into either sentence would be a clear error, and writes two
// rows (one per direction) to Supabase. Same self-check/retry-once/
// needs_review.csv pattern as generate-words.js.
//
// Setup: same .env as generate-words.js (ANTHROPIC_API_KEY, SUPABASE_URL,
// SUPABASE_SERVICE_KEY).
//
// Run:
//   node generate-confusing-pairs.js
//
// Re-run later to add more pairs:
//   - Append new rows to data/confusing_pairs_source.csv
//   - Run again — pairs already in the table (case-insensitive match on
//     word+commonly_confused_with) are skipped automatically

import 'dotenv/config'
import { readFileSync, appendFileSync, existsSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import Papa from 'papaparse'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const CSV_PATH = './data/confusing_pairs_source.csv'
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

function readSeedPairs() {
  const raw = readFileSync(CSV_PATH, 'utf8')
  const { data, errors } = Papa.parse(raw, { header: true, skipEmptyLines: true })
  if (errors.length > 0) {
    throw new Error(`Failed to parse ${CSV_PATH}: ${errors[0].message}`)
  }
  return data.map((row) => ({
    word1: row.word.trim(),
    word2: row.commonly_confused_with.trim(),
  }))
}

async function fetchExistingPairSet() {
  const { data, error } = await supabase.from('confusing_pairs').select('word, commonly_confused_with')
  if (error) throw new Error(`Failed to fetch existing pairs: ${error.message}`)
  return new Set(data.map((row) => `${row.word.toLowerCase()}|${row.commonly_confused_with.toLowerCase()}`))
}

function containsExactWord(sentence, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i').test(sentence)
}

function buildPrompt(word1, word2, retryNote) {
  return `You are generating content for Vocabl, a CAT (Indian MBA exam) vocabulary app's "Confusing Word Pairs" practice format. The pair is "${word1}" and "${word2}" — words that are commonly confused with each other (similar spelling/sound, easily mixed up) but have distinct meanings.

Generate:
- word1_meaning: a brief meaning of "${word1}", a few words
- word2_meaning: a brief meaning of "${word2}", a few words
- word1_sentence: one sentence, in a serious editorial/argumentative register (The Economist, The Hindu op-eds — abstract/institutional subject, no casual/narrative framing), that correctly uses "${word1}" in a context that specifically depends on its distinct meaning. If "${word2}" were substituted for "${word1}" in this exact sentence, it must produce a clear, unambiguous error — not just an awkward phrasing. "${word1}" must appear in its exact, unmodified base form (this sentence is shown with the word blanked out).
- word2_sentence: the same, but for "${word2}" — a sentence where "${word2}" is correct and substituting "${word1}" would be a clear error. "${word2}" must appear in its exact, unmodified base form.

Then self-check: for word1_sentence, would swapping in "${word2}" produce a clear, identifiable error? For word2_sentence, would swapping in "${word1}" produce a clear, identifiable error? Set self_check_passed to true only if both hold.
${retryNote ? `\n${retryNote}\n` : ''}
Respond only with valid JSON, no other text, no markdown formatting, no preamble, in exactly this shape:
{"word1_meaning": "...", "word2_meaning": "...", "word1_sentence": "...", "word2_sentence": "...", "self_check_passed": true}`
}

function parseGeneratedEntry(rawText, word1, word2) {
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1].trim() : rawText.trim()

  let entry
  try {
    entry = JSON.parse(candidate)
  } catch {
    return { entry: null, valid: false }
  }

  const structurallyValid =
    typeof entry.word1_meaning === 'string' &&
    typeof entry.word2_meaning === 'string' &&
    typeof entry.word1_sentence === 'string' &&
    typeof entry.word2_sentence === 'string' &&
    containsExactWord(entry.word1_sentence, word1) &&
    containsExactWord(entry.word2_sentence, word2)

  return { entry, valid: structurallyValid && entry.self_check_passed === true }
}

async function generateEntry(word1, word2, retryNote) {
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: buildPrompt(word1, word2, retryNote) }],
  })
  const rawText = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
  return parseGeneratedEntry(rawText, word1, word2)
}

async function generateWithRetry(word1, word2) {
  const first = await generateEntry(word1, word2)
  if (first.valid) return first.entry

  await sleep(DELAY_BETWEEN_CALLS_MS)

  const retryNote =
    'Your previous attempt failed validation (either sentence did not contain the ' +
    'exact base form of its target word, or swapping the other word in would not ' +
    `produce a clear error). Fix the specific issue and try again for "${word1}"/"${word2}".`
  const second = await generateEntry(word1, word2, retryNote)
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
  const seedPairs = readSeedPairs()
  const existingPairs = await fetchExistingPairSet()

  console.log(`Loaded ${seedPairs.length} seed pairs. ${existingPairs.size} rows already in the database.\n`)

  let written = 0
  let skipped = 0
  let flagged = 0
  const failedPairs = []

  for (let i = 0; i < seedPairs.length; i++) {
    const { word1, word2 } = seedPairs[i]
    const progress = `[${i + 1}/${seedPairs.length}]`
    const key = `${word1.toLowerCase()}|${word2.toLowerCase()}`

    if (existingPairs.has(key)) {
      console.log(`${progress} ${word1}/${word2} — already exists, skipped`)
      skipped++
      continue
    }

    try {
      const entry = await generateWithRetry(word1, word2)

      if (!entry) {
        console.log(`${progress} ${word1}/${word2} — FAILED self-check twice, flagged for review`)
        logNeedsReview(`${word1}/${word2}`, 'confusing_pairs')
        flagged++
        failedPairs.push(`${word1}/${word2}`)
        await sleep(DELAY_BETWEEN_CALLS_MS)
        continue
      }

      const { error } = await supabase.from('confusing_pairs').insert([
        {
          word: word1,
          commonly_confused_with: word2,
          word_meaning: entry.word1_meaning,
          confused_meaning: entry.word2_meaning,
          demonstrating_sentence: entry.word1_sentence,
        },
        {
          word: word2,
          commonly_confused_with: word1,
          word_meaning: entry.word2_meaning,
          confused_meaning: entry.word1_meaning,
          demonstrating_sentence: entry.word2_sentence,
        },
      ])
      if (error) throw new Error(`Supabase insert failed: ${error.message}`)

      console.log(`${progress} ${word1}/${word2} — generated both directions, self-check passed`)
      written += 2
    } catch (err) {
      console.log(`${progress} ${word1}/${word2} — ERROR: ${err.message}`)
      logNeedsReview(`${word1}/${word2}`, 'confusing_pairs')
      flagged++
      failedPairs.push(`${word1}/${word2}`)
    }

    await sleep(DELAY_BETWEEN_CALLS_MS)
  }

  console.log('\n=== Summary ===')
  console.log(`Total pairs processed: ${seedPairs.length}`)
  console.log(`Rows written: ${written}`)
  console.log(`Skipped (already existed): ${skipped}`)
  console.log(`Flagged for review: ${flagged}`)
  if (failedPairs.length > 0) {
    console.log(`Failed pairs: ${failedPairs.join(', ')}`)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
