import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { fetchRootFamilies } from '../lib/wordFamily'
import { logEvent } from '../lib/userEvents'

const MIN_FAMILY_SIZE = 3

// Root-first entry point into the same Word Family data the flashcard's
// root chip already opens — this is an additional way to reach it, not a
// replacement. Passive/reference only: no scoring, no attempts logged.
export default function RootWordsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [families, setFamilies] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchRootFamilies(MIN_FAMILY_SIZE).then((data) => {
      if (!cancelled) setFamilies(data)
    })
    logEvent(user.id, 'screen_viewed', { screen_name: 'root_words' })
    return () => {
      cancelled = true
    }
  }, [user.id])

  return (
    <div className="app-shell">
      <div className="page-card">
        <div className="word-card-top">
          <button type="button" className="back-link" onClick={() => navigate('/learn')}>
            ← Back
          </button>
        </div>

        <div className="auth-logo">Root Words</div>
        <p className="welcome-tagline">Learn one root, unlock several words at once.</p>

        {families === null ? (
          <div className="loading-state">Loading…</div>
        ) : families.length === 0 ? (
          <div className="empty-state">No root families big enough to browse yet.</div>
        ) : (
          <div className="quiz-history-list">
            {families.map((f) => (
              <Link key={f.root} to={`/family?root=${encodeURIComponent(f.root)}`} className="quiz-history-row">
                <div className="quiz-history-summary">
                  <span>
                    {f.root} — {f.root_meaning} · {f.root_language}
                  </span>
                  <span>{f.count} words</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
