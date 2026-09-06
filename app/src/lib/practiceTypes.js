// One value per Practice-menu format. Kept as a single source of truth so
// every place that writes/reads user_word_status agrees on the exact
// strings — these match the check constraint on that column.
export const PRACTICE_TYPES = {
  CONTEXTUAL_CLOSEST_MEANING: 'contextual_closest_meaning',
  CONFUSING_WORD_PAIRS: 'confusing_word_pairs',
  WORD_USAGE_ERRORS: 'word_usage_errors',
  ODD_WORD_OUT: 'odd_word_out',
}

export const PRACTICE_TYPE_LABELS = {
  contextual_closest_meaning: 'Contextual Closest Meaning',
  confusing_word_pairs: 'Confusing Word Pairs',
  word_usage_errors: 'Word Usage Errors',
  odd_word_out: 'Odd Word Out',
}
