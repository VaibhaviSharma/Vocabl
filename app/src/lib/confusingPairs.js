import { supabase } from './supabaseClient'
import { shuffle } from './shuffle'

export async function fetchConfusingPairsQueue(count) {
  const { data, error } = await supabase.from('confusing_pairs').select('*')
  if (error) throw error
  return shuffle(data).slice(0, count)
}
