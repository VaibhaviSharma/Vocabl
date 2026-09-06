import { supabase } from './supabaseClient'

// Supabase caps an unbounded select at 1000 rows by default. `words` has
// passed that count, so any fetch that isn't narrowed to well under 1000
// rows (an unfiltered scan, a single loose filter, "All tiers/All
// domains") must paginate explicitly or silently drop data past the cap.
// `buildQuery` receives the base `supabase.from(table).select(columns)`
// query so callers can chain filters before pagination is applied.
export async function fetchAllRows(table, columns, buildQuery = (q) => q) {
  let all = []
  let from = 0
  while (true) {
    const { data, error } = await buildQuery(supabase.from(table).select(columns)).range(from, from + 999)
    if (error) throw error
    all = all.concat(data)
    if (data.length < 1000) break
    from += 1000
  }
  return all
}
