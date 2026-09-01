import { supabase } from './supabaseClient'

// Distinct source_domain values currently in the bank, for the Learn-mode
// domain filter. Queried live rather than hardcoded so it can't drift from
// whatever the content pipeline has actually generated.
export async function fetchDomains() {
  const { data, error } = await supabase.from('words').select('source_domain')
  if (error) throw error
  return [...new Set(data.map((r) => r.source_domain))].sort()
}

// Learn mode has no adaptive-tier logic (unlike hangman's getNextWord) — it
// just pulls whatever matches the user's chosen filters, so the whole
// filtered set is fetched once and sliced client-side rather than fetched
// word-by-word.
export async function fetchLearnWords({ tier, domain } = {}) {
  let query = supabase.from('words').select('*')
  if (tier) query = query.eq('tier', tier)
  if (domain) query = query.eq('source_domain', domain)
  const { data, error } = await query
  if (error) throw error
  return data
}