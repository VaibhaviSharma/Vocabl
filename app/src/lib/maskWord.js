// Blanks out the exact, whole-word occurrence of `word` within `sentence`,
// case-insensitively. Returns null if the word isn't found (e.g. an old row
// whose example_sentence predates the "must contain the exact base word"
// requirement) so the caller can skip showing a broken/misleading hint.
export function maskWord(sentence, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\b${escaped}\\b`, 'i')
  if (!re.test(sentence)) return null
  return sentence.replace(re, '_'.repeat(word.length))
}
