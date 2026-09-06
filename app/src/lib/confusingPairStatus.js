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
