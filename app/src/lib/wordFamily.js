import { supabase } from './supabaseClient'

// Every word sharing an exact root value, including the word the user
// navigated from — a result of length 1 means it's the only word in the
// bank with that root (no siblings to browse).
export async function fetchWordFamily(root) {
  const { data, error } = await supabase
    .from('words')
    .select('id, word, correct_definition, root_meaning, root_language')
    .eq('root', root)
    .order('word')
  if (error) throw error
  return data
}