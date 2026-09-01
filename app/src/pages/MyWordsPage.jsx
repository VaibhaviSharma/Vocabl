import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { fetchWordStatuses } from '../lib/wordStatus'
import { logEvent } from '../lib/userEvents'
import TabNav from '../components/TabNav'

export default function MyWordsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const filter = searchParams.get('filter') === 'incorrect' ? 'incorrect' : 'all'
  const [rows, setRows] = useState(null)

  useEffect(() => {
    logEvent(user.id, 'screen_viewed', { screen_name: 'my_words' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])

  useEffect(() => {
    let cancelled = false
    setRows(null)

    async function load() {
      const data = await fetchWordStatuses(user.id, filter)
      if (!cancelled) setRows(data)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user.id, filter])

  function handleFilterChange(next) {
    setSearchParams(next === 'all' ? {} : { filter: next })
  }

  return (
    <div className="app-shell">
      <div className="page-card">
        <div className="word-card-top">
          <Link to="/home" className="back-link">
            ← Back
          </Link>
        </div>

        <TabNav active="words" />

        <button type="button" className="btn btn-primary" onClick={() => navigate('/quiz')}>
          Generate Quiz
        </button>

        <div className="filter-toggle">
          <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => handleFilterChange('all')}>
            All
          </button>
          <button
            type="button"
            className={filter === 'incorrect' ? 'active' : ''}
            onClick={() => handleFilterChange('incorrect')}
          >
            Incorrect only
          </button>
        </div>

        {rows === null ? (
          <div className="loading-state">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            {filter === 'incorrect'
              ? 'Nothing flagged incorrect right now.'
              : 'Nothing here yet — play some words first.'}
          </div>
        ) : (
          <table className="words-table">
            <thead>
              <tr>
                <th>Word</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.words.word}</td>
                  <td>
                    <span className={`status-pill status-${r.status}`}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
