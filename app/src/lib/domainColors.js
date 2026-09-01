const DOMAIN_COLORS = ['coral', 'teal', 'pink', 'amber', 'purple', 'green', 'blue']

// Deterministic per-domain color so a given source_domain always renders the
// same card color across screens (mirrors WordFit's colorForInterest()).
export function colorForDomain(domain) {
  let hash = 0
  for (const ch of domain) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return DOMAIN_COLORS[hash % DOMAIN_COLORS.length]
}
