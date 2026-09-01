import { supabase } from './supabaseClient'

const TIER_MIN = 1
const TIER_MAX = 5

// Weighted mix: 70% current tier, 20% one below, 10% one above, clamped to
// [1, 5]. Pure function so it's testable without touching Supabase.
export function pickTargetTier(currentTier) {
  const roll = Math.random()
  if (roll < 0.7) return currentTier
  if (roll < 0.9) return Math.max(TIER_MIN, currentTier - 1)
  return Math.min(TIER_MAX, currentTier + 1)
}

export function pickRandomWord(words) {
  if (words.length === 0) return null
  return words[Math.floor(Math.random() * words.length)]
}

async function fetchWordsAtTier(tier) {
  const { data, error } = await supabase.from('words').select('*').eq('tier', tier)
  if (error) throw error
  return data
}

async function fetchAnyWord() {
  const { data, error } = await supabase.from('words').select('*')
  if (error) throw error
  return data
}

function excludeWords(words, excludeIds) {
  if (!excludeIds || excludeIds.length === 0) return words
  const excluded = new Set(excludeIds)
  return words.filter((w) => !excluded.has(w.id))
}

// `excludeIds` — word IDs to skip (e.g. already served earlier in the
// current session), so a session doesn't repeat a word until every other
// eligible word has been used. Falls through three tiers of fallback: the
// picked difficulty tier -> the whole bank (still excluding) -> the whole
// bank allowing repeats, only once every word has genuinely been served.
export async function getNextWord(currentTier, excludeIds = []) {
  const targetTier = pickTargetTier(currentTier)
  const wordsAtTier = await fetchWordsAtTier(targetTier)
  const picked = pickRandomWord(excludeWords(wordsAtTier, excludeIds))
  if (picked) return picked

  const allWords = await fetchAnyWord()
  const pickedAny = pickRandomWord(excludeWords(allWords, excludeIds))
  if (pickedAny) return pickedAny

  // Every word in the bank has already been served — repeats are the only
  // option left, so allow one rather than dead-ending the session.
  return pickRandomWord(allWords)
}
