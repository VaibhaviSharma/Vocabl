#!/usr/bin/env node
// Vocabl Odd Word Out meaning-cluster generation script.
//
// Unlike the rest of the content pipeline, this is a batch-analysis job,
// not a per-word generation call: for each source_domain, all of that
// domain's words (with their correct_definition and tier) are sent to the
// model in one call, and it's asked to identify genuine synonym/near-
// synonym clusters of 4-6 words among them — real groupings found in the
// existing word bank, not forced/arbitrary ones. Words that don't cluster
// well are simply left out, which is expected and fine.
//
// Clusters are also tier-matched (checked both by the model's own
// self-check and programmatically here) so the "odd one out" in a later
// Odd Word Out question can't be spotted purely by being obviously
// harder/easier than the other three.
//
// This is a separate, additive batch job, not part of the core per-word
// pipeline in generate-words.js.
//
// Run:
//   node generate-meaning-clusters.js
//
// Safe to re-run: it always operates on the full domain word lists and
// replaces prior clusters (see main()), so it does not accumulate
// duplicate/stale clusters across runs.

import 'dotenv/config'
import { appendFileSync, existsSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const NEEDS_REVIEW_PATH = './needs_review.csv'
const CLAUDE_MODEL = 'claude-sonnet-4-6'
const DELAY_BETWEEN_CALLS_MS = 500
const MIN_CLUSTER_SIZE = 4
const MAX_CLUSTER_SIZE = 6
const MAX_TIER_SPREAD = 2

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

// Paginated explicitly — see generate-words.js for why this matters once a
// table passes 1000 rows.
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

function buildPrompt(domain, words, retryNote) {
  const wordList = words.map((w) => `- ${w.word} (tier ${w.tier}): ${w.correct_definition}`).join('\n')
  return `You are analyzing a set of CAT (Indian MBA exam) vocabulary words from the "${domain}" domain, to build "Odd Word Out" practice content for Vocabl. In that format, a player sees 4 words and must pick the one that doesn't share a meaning with the other 3 — so we need genuine synonym / near-synonym clusters drawn from this word list.

Word list (word, tier 1=very common to 5=genuinely obscure, and its correct definition):
${wordList}

Task: identify clusters of ${MIN_CLUSTER_SIZE}-${MAX_CLUSTER_SIZE} words from this list that share a core meaning closely enough that a reasonable, well-read person would group them together (e.g., a cluster of words all meaning roughly "lack of feeling or interest"). Rules:
- Only use words from the list above, spelled exactly as given.
- Each word may appear in at most one cluster.
- Do not force weak or tenuous groupings — leave out words that don't have enough true synonyms in this list. It's fine and expected for many words to be left out entirely.
- Keep each cluster's tier spread tight (ideally within ${MAX_TIER_SPREAD} tiers of each other) — a cluster mixing a very common word with a very obscure one makes for an unfair, difficulty-guessable question rather than a meaning-based one.
- Give each cluster a short theme label (a few words, e.g. "lack of feeling or interest") describing the shared meaning.
- Self-check each cluster: are you confident the words genuinely share a core meaning, and are they close enough in register/difficulty to be fair? Only include clusters you're confident about.
${retryNote ? `\n${retryNote}\n` : ''}
Respond only with valid JSON, no other text, no markdown formatting, no preamble, in exactly this shape:
{"clusters": [{"theme": "...", "words": ["word1", "word2", "word3", "word4"]}]}`
}

function parseResult(rawText, domainWordSet, tierByWord) {
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1].trim() : rawText.trim()

  let parsed
  try {
    parsed = JSON.parse(candidate)
  } catch {
    return null
  }
  if (!Array.isArray(parsed.clusters)) return null

  const usedWords = new Set()
  const validClusters = []

  for (const cluster of parsed.clusters) {
    if (typeof cluster.theme !== 'string' || !Array.isArray(cluster.words)) continue

    const words = [...new Set(cluster.words)].filter((w) => domainWordSet.has(w) && !usedWords.has(w))
    if (words.length < MIN_CLUSTER_SIZE || words.length > MAX_CLUSTER_SIZE) continue

    const tiers = words.map((w) => tierByWord.get(w))
    const spread = Math.max(...tiers) - Math.min(...tiers)
    if (spread > MAX_TIER_SPREAD) continue

    words.forEach((w) => usedWords.add(w))
    validClusters.push({ theme: cluster.theme.trim(), words })
  }

  return validClusters
}

async function generateForDomain(domain, words) {
  const domainWordSet = new Set(words.map((w) => w.word))
  const tierByWord = new Map(words.map((w) => [w.word, w.tier]))

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: buildPrompt(domain, words) }],
  })
  const rawText = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')

  let clusters = parseResult(rawText, domainWordSet, tierByWord)

  if (!clusters || clusters.length === 0) {
    await sleep(DELAY_BETWEEN_CALLS_MS)
    const retryNote =
      'Your previous attempt produced no valid clusters (either malformed JSON, clusters outside the ' +
      `${MIN_CLUSTER_SIZE}-${MAX_CLUSTER_SIZE} word size range, or too wide a tier spread). Look again for genuine, ` +
      'tier-matched synonym groups in this word list.'
    const retryMessage = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: buildPrompt(domain, words, retryNote) }],
    })
    const retryRawText = retryMessage.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
    clusters = parseResult(retryRawText, domainWordSet, tierByWord)
  }

  return clusters || []
}

function logNeedsReview(domain) {
  if (!existsSync(NEEDS_REVIEW_PATH)) {
    writeFileSync(NEEDS_REVIEW_PATH, 'word,domain,rough_tier\n')
  }
  appendFileSync(NEEDS_REVIEW_PATH, `,${domain},\n`)
}

async function main() {
  const words = await fetchAllRows('words', 'id, word, correct_definition, tier, source_domain')
  const wordIdByWord = new Map(words.map((w) => [w.word, w.id]))

  const domains = [...new Set(words.map((w) => w.source_domain))]
  console.log(`${words.length} words across ${domains.length} domains: ${domains.join(', ')}\n`)

  // Re-runnable: clear prior clusters before rebuilding, so this script
  // never accumulates stale/duplicate clusters across runs.
  const { error: clearMembersError } = await supabase
    .from('word_cluster_members')
    .delete()
    .neq('word_id', '00000000-0000-0000-0000-000000000000')
  if (clearMembersError) throw new Error(`Failed to clear word_cluster_members: ${clearMembersError.message}`)
  const { error: clearClustersError } = await supabase
    .from('meaning_clusters')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
  if (clearClustersError) throw new Error(`Failed to clear meaning_clusters: ${clearClustersError.message}`)

  let totalClusters = 0
  let totalClusterSize = 0
  const clusteredWords = new Set()

  for (const domain of domains) {
    const domainWords = words.filter((w) => w.source_domain === domain)
    console.log(`--- Domain: ${domain} (${domainWords.length} words) ---`)

    try {
      const clusters = await generateForDomain(domain, domainWords)

      if (clusters.length === 0) {
        console.log(`  No valid clusters found for ${domain}, flagged for review`)
        logNeedsReview(domain)
      }

      for (const cluster of clusters) {
        const { data: clusterRow, error: clusterError } = await supabase
          .from('meaning_clusters')
          .insert({ theme: cluster.theme })
          .select('id')
          .single()
        if (clusterError) throw new Error(`Failed to insert cluster: ${clusterError.message}`)

        const memberRows = cluster.words.map((w) => ({ cluster_id: clusterRow.id, word_id: wordIdByWord.get(w) }))
        const { error: memberError } = await supabase.from('word_cluster_members').insert(memberRows)
        if (memberError) throw new Error(`Failed to insert cluster members: ${memberError.message}`)

        console.log(`  Cluster "${cluster.theme}": ${cluster.words.join(', ')}`)
        totalClusters++
        totalClusterSize += cluster.words.length
        cluster.words.forEach((w) => clusteredWords.add(w))
      }
    } catch (err) {
      console.log(`  ERROR for domain ${domain}: ${err.message}`)
      logNeedsReview(domain)
    }

    await sleep(DELAY_BETWEEN_CALLS_MS)
  }

  console.log('\n=== Summary ===')
  console.log(`Total clusters formed: ${totalClusters}`)
  console.log(`Average cluster size: ${totalClusters > 0 ? (totalClusterSize / totalClusters).toFixed(2) : 0}`)
  console.log(`Words in at least one cluster: ${clusteredWords.size} / ${words.length}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
