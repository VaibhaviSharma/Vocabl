#!/usr/bin/env node
// Vocabl etymology backfill script.
//
// Adds root, root_meaning, root_language, and etymology to every existing
// row in the `words` table, without touching correct_definition,
// distractor_definitions, or example_sentence (already good). Same
// self-check/retry-once/needs_review.csv pattern as generate-words.js and
// regenerate-example-sentences.js.
//
// Since each word is generated independently, the model can't guarantee
// byte-identical root spellings across different words that share a root
// purely from per-call instructions alone. To make grouping actually work,
// this script runs a consolidation pass after the main loop: it collects
// every distinct root produced, asks Claude in one call to spot spelling
// variants of the same underlying root, and rewrites them to one canonical
// form. It then prints a family-size report (roots with 1 word vs several)
// so it's obvious which families are actually big enough to be worth
// browsing.
//
// Setup: same .env as generate-words.js (ANTHROPIC_API_KEY, SUPABASE_URL,
// SUPABASE_SERVICE_KEY).
//
// Run:
//   node generate-etymology.js
//
// Rows that fail the self-check twice are left with null etymology fields
// and logged to needs_review.csv for manual attention.

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
  const { data, error } = await supabase.from('words').select('id, word, source_domain').order('word')
  if (error) throw new Error(`Failed to fetch words: ${error.message}`)
  return data
}

function buildPrompt(row, retryNote) {
  const { word } = row

  return `You are adding etymology data for "${word}" to Vocabl, a CAT (Indian MBA exam) vocabulary app. Its definition and example sentence already exist and are fixed — you're only generating these four fields:

- root: the core root morpheme "${word}" derives from. CRITICAL for grouping: use the standard, canonical citation form as it would appear in a scholarly etymology dictionary (e.g. a Greek root cited in its lemma form like "dogma" or "phemi"; a Latin root cited by its recognizable stem like "scrib/script" from "scribere"). This exact spelling must be reusable — if this same root were generated again for a different word that shares it, it must come out as the identical string, not a variant spelling or inconsistent hyphenation. If "${word}" genuinely has no useful/traceable root, set root (and root_meaning, root_language, etymology) to null rather than forcing a weak or fabricated one — this is a valid, confident answer, not a failure.
- root_meaning: the root's core meaning, a few words (e.g. "opinion, belief"). Null if root is null.
- root_language: the root's origin language (Greek, Latin, Old English, French, etc). Null if root is null.
- etymology: a 1-2 sentence memory-bridge narrative connecting the root to "${word}"'s current meaning. Null if root is null. Example, for "dogmatic": "From the Greek dogma, meaning 'opinion' or 'belief.' Someone dogmatic clings rigidly to their opinions as if they were settled fact."

Then self-check: are you confident the root and etymology are historically accurate (or confident that no clear/traceable root exists, in which case root/root_meaning/root_language/etymology should all be null)? Set self_check_passed to true only if so.
${retryNote ? `\n${retryNote}\n` : ''}
Respond only with valid JSON, no other text, no markdown formatting, no preamble, in exactly this shape:
{"root": "...", "root_meaning": "...", "root_language": "...", "etymology": "...", "self_check_passed": true}`
}

// root is nullable (a word can genuinely have no traceable root), but when
// it's present, its three dependent fields must all be non-null strings —
// and when it's null, they must all be null too.
function isValidEtymologyShape(entry) {
  if (entry.root === null) {
    return entry.root_meaning === null && entry.root_language === null && entry.etymology === null
  }
  return (
    typeof entry.root === 'string' &&
    typeof entry.root_meaning === 'string' &&
    typeof entry.root_language === 'string' &&
    typeof entry.etymology === 'string'
  )
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

  const valid = isValidEtymologyShape(entry) && entry.self_check_passed === true
  return { entry, valid }
}

async function generateEtymology(row, retryNote) {
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 512,
    messages: [{ role: 'user', content: buildPrompt(row, retryNote) }],
  })
  const rawText = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
  return parseResult(rawText)
}

async function generateWithRetry(row) {
  const first = await generateEtymology(row)
  if (first.valid) return first.entry

  await sleep(DELAY_BETWEEN_CALLS_MS)

  const retryNote =
    'Your previous attempt failed validation (root was populated but one of ' +
    'root_meaning/root_language/etymology was missing or null, or vice versa, ' +
    `or the output was malformed). Fix the specific issue and try again for "${row.word}".`
  const second = await generateEtymology(row, retryNote)
  if (second.valid) return second.entry

  return null
}

function logNeedsReview(word, domain) {
  if (!existsSync(NEEDS_REVIEW_PATH)) {
    writeFileSync(NEEDS_REVIEW_PATH, 'word,domain,rough_tier\n')
  }
  appendFileSync(NEEDS_REVIEW_PATH, `${word},${domain},\n`)
}

// Independent per-word generation can't guarantee identical spelling for a
// root shared across words. This collects every distinct root produced and
// asks the model to spot spelling variants of the same underlying root in
// one pass. Returns proposed merge groups WITHOUT writing anything — the
// model can and does over-merge (e.g. conflating two roots that merely
// share a substring), so proposals are meant to be reviewed before
// applyRootMerges() is called on a vetted subset.
async function proposeRootMerges() {
  const { data, error } = await supabase.from('words').select('word, root, root_language').not('root', 'is', null)
  if (error) throw new Error(`Failed to fetch roots for consolidation: ${error.message}`)

  const byRoot = new Map()
  for (const row of data) {
    if (!byRoot.has(row.root)) byRoot.set(row.root, { language: row.root_language, example: row.word })
  }

  if (byRoot.size === 0) return []

  const listing = [...byRoot.entries()]
    .map(([root, info], i) => `${i + 1}. root_string="${root}" | language=${info.language} | example_word=${info.example}`)
    .join('\n')

  const prompt = `Below is a numbered list of etymological root morphemes generated independently for different English words, each tagged with its language of origin and one example word that uses it. Some entries may be spelling variants of the SAME underlying root, because they were generated in separate, independent calls (e.g. root_string="dogma" and root_string="dogmat" could both be the Greek root for "opinion/belief").

${listing}

Identify every group of 2+ entries above that refer to the exact same actual root — be conservative: only merge entries that share genuine etymological descent, never entries that merely look similar as substrings or belong to a loosely related word family. For each real group, choose ONE canonical spelling to represent it — prefer the most standard citation form as it would appear in an etymology dictionary.

CRITICAL: canonical and every entry in variants must be copied EXACTLY from the root_string="..." value of an entry above — the bare root text only, never the language, the example word, or the full numbered line. Entries with no duplicate variant should not appear in your output at all.

Respond only with valid JSON, no other text, no markdown formatting, no preamble: an array of merge groups, each shaped {"canonical": "...", "variants": ["...", "..."]} where variants lists the OTHER root_string values to replace with canonical (canonical itself excluded from variants). Return an empty array if there are no duplicates.`

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })
  const rawText = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')

  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1].trim() : rawText.trim()

  let groups
  try {
    groups = JSON.parse(candidate)
  } catch {
    console.log('Consolidation pass: failed to parse model output.')
    return []
  }

  const validRootStrings = new Set(byRoot.keys())
  return Array.isArray(groups)
    ? groups.filter(
        (g) =>
          g.canonical &&
          validRootStrings.has(g.canonical) &&
          Array.isArray(g.variants) &&
          g.variants.every((v) => validRootStrings.has(v))
      )
    : []
}

// Applies a vetted list of merge groups (same shape as proposeRootMerges'
// return value) by rewriting every variant's root to its group's canonical
// spelling.
async function applyRootMerges(groups) {
  if (groups.length === 0) {
    console.log('No root merges to apply.')
    return
  }

  console.log(`\nApplying ${groups.length} root merge group(s)...`)
  for (const group of groups) {
    for (const variant of group.variants) {
      if (variant === group.canonical) continue
      const { error: updateError, count } = await supabase
        .from('words')
        .update({ root: group.canonical }, { count: 'exact' })
        .eq('root', variant)
      if (updateError) {
        console.log(`  FAILED to merge "${variant}" -> "${group.canonical}": ${updateError.message}`)
        continue
      }
      console.log(`  "${variant}" -> "${group.canonical}" (${count} row(s))`)
    }
  }
}

async function printFamilyReport() {
  const { data, error } = await supabase.from('words').select('root').not('root', 'is', null)
  if (error) throw new Error(`Failed to fetch roots for report: ${error.message}`)

  const counts = new Map()
  for (const row of data) counts.set(row.root, (counts.get(row.root) || 0) + 1)

  const families = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const singletons = families.filter(([, n]) => n === 1).length
  const grouped = families.filter(([, n]) => n > 1)

  console.log('\n=== Root family report ===')
  console.log(`Distinct roots: ${families.length}`)
  console.log(`Singleton roots (1 word, not browsable as a family): ${singletons}`)
  console.log(`Roots shared by 2+ words: ${grouped.length}`)
  console.log('\nLargest families:')
  for (const [root, n] of grouped.slice(0, 20)) {
    console.log(`  ${root}: ${n} words`)
  }
}

// --consolidate-only: skip the per-word generation pass and only run the
// root-merge proposal (used after the main backfill has already completed,
// so re-running doesn't burn API calls regenerating already-good rows).
// --dry-run: propose merges and print them without writing anything, so
// they can be reviewed before applyRootMerges() runs for real.
async function main() {
  const args = process.argv.slice(2)
  const consolidateOnly = args.includes('--consolidate-only')
  const dryRun = args.includes('--dry-run')

  if (consolidateOnly) {
    const groups = await proposeRootMerges()
    if (dryRun) {
      console.log(JSON.stringify(groups, null, 2))
    } else {
      await applyRootMerges(groups)
      await printFamilyReport()
    }
    return
  }

  const words = await fetchAllWords()
  console.log(`Loaded ${words.length} words to backfill etymology for.\n`)

  let updated = 0
  let flagged = 0
  const failedWords = []

  for (let i = 0; i < words.length; i++) {
    const row = words[i]
    const progress = `[${i + 1}/${words.length}]`

    try {
      const result = await generateWithRetry(row)

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
        .update({
          root: result.root,
          root_meaning: result.root_meaning,
          root_language: result.root_language,
          etymology: result.etymology,
        })
        .eq('id', row.id)
      if (error) throw new Error(`Supabase update failed: ${error.message}`)

      console.log(
        `${progress} ${row.word} — root: ${result.root ?? '(none)'}${result.root ? ` [${result.root_language}]` : ''}`
      )
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
  if (failedWords.length > 0) {
    console.log(`Failed words: ${failedWords.join(', ')}`)
  }

  await applyRootMerges(await proposeRootMerges())
  await printFamilyReport()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})