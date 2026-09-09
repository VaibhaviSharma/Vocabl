const TIER_MIN = 1
const TIER_MAX = 5
const WINDOW_SIZE = 10

const TIER_UP_SUCCESS_RATE = 0.8
const TIER_UP_MAX_ATTEMPTS_CEILING = 0.2
const TIER_DOWN_SUCCESS_RATE = 0.45
const TIER_DOWN_MAX_ATTEMPTS_FLOOR = 0.5

// Re-evaluates current_tier from a rolling window of the last WINDOW_SIZE
// round outcomes. Pure function, testable independently of any UI/DB call.
export function nextTier(currentTier, recentResults) {
  if (recentResults.length === 0) return currentTier

  const successRate =
    recentResults.filter((r) => r.result === 'correct').length / recentResults.length
  const maxAttemptsUsedRate =
    recentResults.filter((r) => r.usedMaxAttempts).length / recentResults.length

  if (successRate >= TIER_UP_SUCCESS_RATE && maxAttemptsUsedRate <= TIER_UP_MAX_ATTEMPTS_CEILING) {
    return Math.min(TIER_MAX, currentTier + 1)
  }
  if (successRate <= TIER_DOWN_SUCCESS_RATE || maxAttemptsUsedRate >= TIER_DOWN_MAX_ATTEMPTS_FLOOR) {
    return Math.max(TIER_MIN, currentTier - 1)
  }
  return currentTier
}

function todayLocalDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function daysBetween(fromDateStr, toDateStr) {
  const from = new Date(fromDateStr + 'T00:00:00')
  const to = new Date(toDateStr + 'T00:00:00')
  return Math.round((to - from) / 86400000)
}

// Shared by every format — a day-streak and lifetime words-played count are
// engagement metrics, not Quiz-specific ones, so this doesn't touch
// current_tier/recent_results (Quiz's adaptive-difficulty state).
function computeActivityFields(profile) {
  const today = todayLocalDate()
  let streakCount
  if (!profile.last_played_date || profile.last_played_date === today) {
    streakCount = profile.last_played_date === today ? profile.streak_count : 1
  } else if (daysBetween(profile.last_played_date, today) === 1) {
    streakCount = profile.streak_count + 1
  } else {
    streakCount = 1
  }

  return {
    words_played: profile.words_played + 1,
    streak_count: streakCount,
    last_played_date: today,
  }
}

// Given the current stored profile and the outcome of a just-finished round,
// returns the fields to persist. Pure — no Supabase calls here, so the
// upsert/read boundary and the actual progression rules can be tested
// separately. Quiz-only: it's the only format with a difficulty tier to
// adapt.
export function applyRoundResult(profile, roundOutcome) {
  const recentResults = [...profile.recent_results, roundOutcome].slice(-WINDOW_SIZE)
  const currentTier = nextTier(profile.current_tier, recentResults)

  return {
    current_tier: currentTier,
    recent_results: recentResults,
    ...computeActivityFields(profile),
  }
}

// Used by every format that doesn't drive adaptive difficulty (Confusing
// Word Pairs, Word Usage Errors, Odd Word Out, Learn) so the streak/
// words-played count reflects practice in general, not just Quiz —
// otherwise a user who never plays Quiz sees the streak stuck at 0
// forever, which is indistinguishable from it being broken.
export function recordPracticeActivity(profile) {
  return computeActivityFields(profile)
}
