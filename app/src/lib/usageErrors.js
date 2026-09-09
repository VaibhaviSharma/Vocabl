import { fetchAllRows } from './supabaseUtil'
import { shuffle } from './shuffle'

const WORD_FIELDS = 'id, word, tier, correct_definition, part_of_speech'

// Groups the flat usage_sentences rows (5 per word) back into one entry per
// word. Only words with a full, well-formed set of 5 sentences (4 correct,
// 1 not) are usable — generation runs as a separate batch job, so at any
// given time some tier 2-4 words may not have usage_sentences yet.
export async function fetchUsageErrorEntries() {
  const rows = await fetchAllRows('usage_sentences', `id, word_id, sentence, is_correct, words (${WORD_FIELDS})`)

  const byWord = new Map()
  for (const row of rows) {
    if (!row.words) continue
    if (!byWord.has(row.word_id)) {
      byWord.set(row.word_id, { word: row.words, sentences: [] })
    }
    byWord.get(row.word_id).sentences.push({ id: row.id, sentence: row.sentence, isCorrect: row.is_correct })
  }

  return [...byWord.values()].filter(
    (entry) => entry.sentences.length === 5 && entry.sentences.filter((s) => !s.isCorrect).length === 1
  )
}

export async function fetchUsageErrorsQueue(count) {
  const entries = await fetchUsageErrorEntries()
  return shuffle(entries).slice(0, count)
}

export function buildSentenceOptions(entry) {
  return shuffle(entry.sentences)
}
