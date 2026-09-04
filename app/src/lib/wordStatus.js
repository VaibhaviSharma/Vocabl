import { supabase } from './supabaseClient'

export async function upsertWordStatus(userId, wordId, status) {
  const { error } = await supabase.from('user_word_status').upsert(
    { user_id: userId, word_id: wordId, status, last_attempted_at: new Date().toISOString() },
    { onConflict: 'user_id,word_id' }
  )
  if (error) throw error
}

const WORD_FIELDS =
  'id, word, tier, correct_definition, distractor_definitions, example_sentence, source_domain, part_of_speech'

export async function fetchWordStatuses(userId, filter = 'all') {
  let query = supabase
    .from('user_word_status')
    .select(`id, word_id, status, last_attempted_at, words (${WORD_FIELDS})`)
    .eq('user_id', userId)
    .order('last_attempted_at', { ascending: false })

  if (filter === 'incorrect') {
    query = query.eq('status', 'incorrect')
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function countIncorrect(userId) {
  const { count, error } = await supabase
    .from('user_word_status')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'incorrect')
  if (error) throw error
  return count
}
