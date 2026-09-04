#!/usr/bin/env node
// Vocabl part_of_speech backfill script.
//
// Adds part_of_speech to every existing row in the `words` table, without
// touching correct_definition, distractor_definitions, or example_sentence.
// This unblocks the Quiz cloze format, which needs to pick distractor
// words that share the target word's part of speech — otherwise wrong
// answers are eliminable by grammar alone, not meaning. Same
// self-check/retry-once/needs_review.csv pattern as generate-etymology.js.
//
// Setup: same .env as generate-words.js (ANTHROPIC_API_KEY, SUPABASE_URL,
// SUPABASE_SERVICE_KEY).
//
// Run:
//   node generate-part-of-speech.js

import 'dotenv/config'
import { appendFileSync, existsSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const NEEDS_REVIEW_PATH = './needs_review.csv'
const CLAUDE_MODEL = 'claude-sonnet-4-6'
const DELAY_BETWEEN_CALLS_MS = 300
const VALID_POS = ['noun', 'verb', 'adjective', 'adverb']

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
    .select('id, word, source_domain, correct_definition, example_sentence')
    .order('word')
  if (error) throw new Error(`Failed to fetch words: ${error.message}`)
  return data
}

function buildPrompt(row, retryNote) {
  const { word, correct_definition, example_sentence } = row
  return `You are classifying the part of speech for "${word}" as used in Vocabl, a CAT vocabulary app. Its definition and example sentence are already fixed — classify the word AS USED in these:

- Definition: ${correct_definition}
- Example sentence: ${example_sentence}

Pick exactly one part_of_speech from: noun, verb, adjective, adverb — whichever matches how "${word}" is actually functioning in the example sentence above (a word that could theoretically be multiple parts of speech in general English should still get exactly one answer here, based on this specific usage).

Then self-check: does your chosen part of speech genuinely match how "${word}" is used in that sentence? Set self_check_passed to true only if so.
${retryNote ? `\n${retryNote}\n` : ''}
Respond only with valid JSON, no other text, no markdown formatting, no preamble, in exactly this shape:
{"part_of_speech": "noun", "self_check_passed": true}`
}

function parseResult(rawText) {
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1].trim() : rawText.trim()

  let entry
  try {
    entry = JSON.parse(candidate)
  } catch {
    return { entry: null, valid: false }
  }

  const valid = VALID_POS.includes(entry.part_of_speech) && entry.self_check_passed === true
  return { entry, valid }
}

async function classify(row, retryNote) {
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 256,
    messages: [{ role: 'user', content: buildPrompt(row, retryNote) }],
  })
  const rawText = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
  return parseResult(rawText)
}

async function classifyWithRetry(row) {
  const first = await classify(row)
  if (first.valid) return first.entry

  await sleep(DELAY_BETWEEN_CALLS_MS)

  const retryNote =
    'Your previous attempt failed validation (part_of_speech was not one of ' +
    'noun/verb/adjective/adverb, or the output was malformed). Fix the ' +
    `specific issue and try again for "${row.word}".`
  const second = await classify(row, retryNote)
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
  console.log(`Loaded ${words.length} words to backfill part_of_speech for.\n`)

  let updated = 0
  let flagged = 0
  const failedWords = []
  const posCounts = {}

  for (let i = 0; i < words.length; i++) {
    const row = words[i]
    const progress = `[${i + 1}/${words.length}]`

    try {
      const result = await classifyWithRetry(row)

      if (!result) {
        console.log(`${progress} ${row.word} — FAILED self-check twice, left null, flagged`)
        logNeedsReview(row.word, row.source_domain)
        flagged++
        failedWords.push(row.word)
        await sleep(DELAY_BETWEEN_CALLS_MS)
        continue
      }

      const { error } = await supabase
        .from('words')
        .update({ part_of_speech: result.part_of_speech })
        .eq('id', row.id)
      if (error) throw new Error(`Supabase update failed: ${error.message}`)

      console.log(`${progress} ${row.word} — ${result.part_of_speech}`)
      posCounts[result.part_of_speech] = (posCounts[result.part_of_speech] || 0) + 1
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
  console.log(`Flagged for review (left null): ${flagged}`)
  console.log('Distribution:', posCounts)
  if (failedWords.length > 0) {
    console.log(`Failed words: ${failedWords.join(', ')}`)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
