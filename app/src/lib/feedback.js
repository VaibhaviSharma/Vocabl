import { supabase } from './supabaseClient'

export async function submitFeedback(userId, { rating, category, message }) {
  const { error } = await supabase.from('feedback').insert({
    user_id: userId,
    rating,
    category,
    message,
  })
  if (error) throw error
}