import { supabase } from './supabaseClient'

// Fire-and-forget, like logEvent — exposure logging should never block or
// disrupt the flashcard flow it's describing.
export function logWordView(userId, wordId) {
  supabase
    .from('word_views')
    .insert({ user_id: userId, word_id: wordId })
    .then(({ error }) => {
      if (error) console.error('Failed to log word view:', error)
    })
}