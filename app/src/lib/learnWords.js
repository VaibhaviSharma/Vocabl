import { fetchAllRows } from './supabaseUtil'

// Distinct source_domain values currently in the bank, for the Learn-mode
// domain filter. Queried live rather than hardcoded so it can't drift from
// whatever the content pipeline has actually generated.
export async function fetchDomains() {
  const data = await fetchAllRows('words', 'source_domain')
  return [...new Set(data.map((r) => r.source_domain))].sort()
}

// Learn mode has no adaptive-tier logic (unlike hangman's getNextWord) — it
// just pulls whatever matches the user's chosen filters, so the whole
// filtered set is fetched once and sliced client-side rather than fetched
// word-by-word.
export async function fetchLearnWords({ tier, domain } = {}) {
  return fetchAllRows('words', '*', (q) => {
    if (tier) q = q.eq('tier', tier)
    if (domain) q = q.eq('source_domain', domain)
    return q
  })
}
