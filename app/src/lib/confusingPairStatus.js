import { supabase } from './supabaseClient'

// Mirrors upsertWordStatus's last-result-wins shape, but keyed on
// confusing_pairs.id rather than words.id — see migration 0013 for why
// Confusing Word Pairs can't share user_word_status directly.
export async function upsertConfusingPairStatus(userId, confusingPairId, status) {
  const { error } = await supabase.from('confusing_pair_status').upsert(
    { user_id: userId, confusing_pair_id: confusingPairId, status, last_attempted_at: new Date().toISOString() },
    { onConflict: 'user_id,confusing_pair_id' }
  )
  if (error) throw error
}

// Mirrors fetchWordStatuses's shape — used to power an "Only wrong"
// category here too, same as every other format.
export async function fetchConfusingPairStatuses(userId, filter = 'all') {
  let query = supabase
    .from('confusing_pair_status')
    .select('id, confusing_pair_id, status, last_attempted_at, confusing_pairs (*)')
    .eq('user_id', userId)
    .order('last_attempted_at', { ascending: false })

  if (filter === 'incorrect') {
    query = query.eq('status', 'incorrect')
  }

  const { data, error } = await query
  if (error) throw error
  return data
}
