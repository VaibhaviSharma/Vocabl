import { fetchAllRows } from './supabaseUtil'
import { shuffle } from './shuffle'

const WORD_FIELDS = 'id, word, tier, correct_definition'
const MIN_MEMBERS_TO_USE = 3
const ODD_WORD_CANDIDATE_POOL = 5

// Clusters (and their member words) are pre-built by the meaning-cluster
// batch job (generate-meaning-clusters.js) — this only reads that data.
// Actual questions are assembled at runtime by buildOddWordOutQuestion, not
// pre-generated, so the same clusters can produce many different questions
// over time.
export async function fetchEligibleClusters() {
  const clusterRows = await fetchAllRows('meaning_clusters', 'id, theme')
  const memberRows = await fetchAllRows('word_cluster_members', `cluster_id, word_id, words (${WORD_FIELDS})`)

  const clusterById = new Map(clusterRows.map((c) => [c.id, { id: c.id, theme: c.theme, members: [] }]))
  for (const row of memberRows) {
    if (!row.words) continue
    clusterById.get(row.cluster_id)?.members.push(row.words)
  }

  return [...clusterById.values()].filter((c) => c.members.length >= MIN_MEMBERS_TO_USE)
}

// Picks a cluster, takes 3 of its members, and picks a 4th "odd" word from
// a different cluster — chosen from a small pool of the closest-tier
// candidates (not always the single closest) so the odd word isn't
// guessable purely by being obviously harder/easier than the other three.
// `excludeClusterIds` lets a session avoid repeating the same cluster's
// theme back-to-back.
export function buildOddWordOutQuestion(clusters, excludeClusterIds = []) {
  if (clusters.length < 2) return null

  const excluded = new Set(excludeClusterIds)
  const pickable = clusters.filter((c) => !excluded.has(c.id))
  const pool = pickable.length > 0 ? pickable : clusters

  const cluster = pool[Math.floor(Math.random() * pool.length)]
  const three = shuffle(cluster.members).slice(0, 3)
  const avgTier = three.reduce((sum, w) => sum + w.tier, 0) / three.length

  const candidates = clusters.filter((c) => c.id !== cluster.id).flatMap((c) => c.members)
  if (candidates.length === 0) return null

  const sorted = [...candidates].sort((a, b) => Math.abs(a.tier - avgTier) - Math.abs(b.tier - avgTier))
  const closest = sorted.slice(0, Math.min(ODD_WORD_CANDIDATE_POOL, sorted.length))
  const oddWord = closest[Math.floor(Math.random() * closest.length)]

  const options = shuffle([
    ...three.map((w) => ({ ...w, isOdd: false })),
    { ...oddWord, isOdd: true },
  ])

  return { clusterId: cluster.id, theme: cluster.theme, options, oddWord }
}
