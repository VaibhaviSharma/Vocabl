import { supabase } from './supabaseClient'

export async function createQuizAttempt(userId, category, totalWordsShown) {
  const { data, error } = await supabase
    .from('quiz_attempts')
    .insert({ user_id: userId, category, total_words_shown: totalWordsShown })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function saveQuizResults(attemptId, results) {
  if (results.length === 0) return
  const rows = results.map((r) => ({
    quiz_attempt_id: attemptId,
    word: r.word,
    result: r.result,
  }))
  const { error } = await supabase.from('quiz_attempt_results').insert(rows)
  if (error) throw error
}

export async function fetchQuizAttempts(userId) {
  const { data, error } = await supabase
    .from('quiz_attempts')
    .select('id, category, taken_at, total_words_shown, quiz_attempt_results (word, result)')
    .eq('user_id', userId)
    .order('taken_at', { ascending: false })
  if (error) throw error
  return data
}
