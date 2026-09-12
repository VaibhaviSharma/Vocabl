import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { fetchProfile } from '../lib/userProfile'
import { countIncorrect } from '../lib/wordStatus'
import { logEvent } from '../lib/userEvents'
import { PRACTICE_TYPES } from '../lib/practiceTypes'

export default function HomePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [incorrectCount, setIncorrectCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [p, incorrect] = await Promise.all([
        fetchProfile(user.id),
        countIncorrect(user.id, PRACTICE_TYPES.CONTEXTUAL_CLOSEST_MEANING),
      ])
      if (!cancelled) {
        setProfile(p)
        setIncorrectCount(incorrect)
        setLoading(false)
      }
    }

    load()
    logEvent(user.id, 'screen_viewed', { screen_name: 'home' })
    return () => {
      cancelled = true
    }
  }, [user.id])

  if (loading) return <div className="loading-state">Loading…</div>

  return (
    <div className="app-shell">
      <div className="page-card">
        <div className="home-header">
          <div className="home-branding">
            <span className="home-logo">Vocabl</span>
            <span className="home-tagline">Vocabulary app for CAT aspirants</span>
          </div>
          <div className="home-header-actions">
            <span className="streak-pill">🔥 {profile.streak_count}</span>
            <Link to="/settings" className="logout-link" aria-label="Settings, including log out">
              ⋮
            </Link>
          </div>
        </div>

        <button type="button" className="play-button" onClick={() => navigate('/learn')}>
          Learn
        </button>

        <button type="button" className="play-button" onClick={() => navigate('/practice')}>
          Practice
        </button>

        <div className="stats-row">
          <div className="stat-tile">
            <div className="stat-value">{profile.words_played}</div>
            <div className="stat-label">Words played</div>
          </div>
          <button
            type="button"
            className="stat-tile stat-tile-action"
            onClick={() => navigate(`/review?type=${PRACTICE_TYPES.CONTEXTUAL_CLOSEST_MEANING}&filter=incorrect`)}
          >
            <div className="stat-value">{incorrectCount}</div>
            <div className="stat-label">to review</div>
            <div className="stat-action-hint">Tap to practice →</div>
          </button>
        </div>

        <Link to="/review" className="home-nav-link">
          My Words →
        </Link>

        <Link to="/feedback" className="home-nav-link">
          Share Feedback
        </Link>
      </div>
    </div>
  )
}
