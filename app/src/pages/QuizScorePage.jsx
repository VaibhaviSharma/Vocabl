import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { fetchQuizAttempts } from '../lib/quizAttempts'
import { logEvent } from '../lib/userEvents'
import TabNav from '../components/TabNav'

const CATEGORY_LABELS = {
  all: 'All words',
  wrong_only: 'Wrong words only',
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function QuizScorePage() {
  const { user } = useAuth()
  const [attempts, setAttempts] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    logEvent(user.id, 'screen_viewed', { screen_name: 'quiz_score' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])

  useEffect(() => {
    let cancelled = false

    async function load() {
      const data = await fetchQuizAttempts(user.id)
      if (!cancelled) setAttempts(data)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user.id])

  return (
    <div className="app-shell">
      <div className="page-card">
        <div className="word-card-top">
          <Link to="/home" className="back-link">
            ← Back
          </Link>
        </div>

        <TabNav active="score" />

        {attempts === null ? (
          <div className="loading-state">Loading…</div>
        ) : attempts.length === 0 ? (
          <div className="empty-state">No quizzes taken yet.</div>
        ) : (
          <div className="quiz-history-list">
            {attempts.map((attempt) => {
              const total = attempt.total_words_shown
              const correct = attempt.quiz_attempt_results.filter((r) => r.result === 'correct').length
              const isExpanded = expandedId === attempt.id

              return (
                <div className="quiz-history-row" key={attempt.id}>
                  <button
                    type="button"
                    className="quiz-history-summary"
                    onClick={() => setExpandedId(isExpanded ? null : attempt.id)}
                  >
                    <span>{formatDateTime(attempt.taken_at)}</span>
                    <span>{CATEGORY_LABELS[attempt.category] ?? attempt.category}</span>
                    <span>
                      {correct}/{total}
                    </span>
                  </button>
                  {isExpanded && (
                    <ul className="quiz-history-detail">
                      {attempt.quiz_attempt_results.map((r, i) => (
                        <li key={i} className={`quiz-history-word ${r.result}`}>
                          {r.word} — {r.result}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
