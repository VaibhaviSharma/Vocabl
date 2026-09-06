import { supabase } from './supabaseClient'
import { fetchAllRows } from './supabaseUtil'

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

// Every root with at least `minCount` words sharing it — the "worth
// studying systematically" cutoff for the Root Words browse list.
export async function fetchRootFamilies(minCount = 3) {
  const all = await fetchAllRows('words', 'root, root_meaning, root_language', (q) => q.not('root', 'is', null))

  const byRoot = new Map()
  for (const r of all) {
    if (!byRoot.has(r.root)) {
      byRoot.set(r.root, { root: r.root, root_meaning: r.root_meaning, root_language: r.root_language, count: 0 })
    }
    byRoot.get(r.root).count += 1
  }

  return [...byRoot.values()]
    .filter((f) => f.count >= minCount)
    .sort((a, b) => b.count - a.count || a.root.localeCompare(b.root))
}
