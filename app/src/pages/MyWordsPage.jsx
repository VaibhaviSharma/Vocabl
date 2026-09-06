import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { fetchWordStatuses } from '../lib/wordStatus'
import { logEvent } from '../lib/userEvents'
import { PRACTICE_TYPES, PRACTICE_TYPE_LABELS } from '../lib/practiceTypes'
import TabNav from '../components/TabNav'

// Only Contextual Closest Meaning writes to user_word_status today.
// Confusing Word Pairs tracks its own results in a separate table (it
// isn't keyed on a `words` row — see confusing_pair_status), so it can't
// be queried the same way here yet; Word Usage Errors and Odd Word Out
// aren't built yet. All four still show as tabs so the picker doesn't
// have to be rebuilt once those catch up — they just render an
// explanatory empty state for now instead of a table.
const QUERYABLE_TYPES = new Set([PRACTICE_TYPES.CONTEXTUAL_CLOSEST_MEANING])

export default function MyWordsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const filter = searchParams.get('filter') === 'incorrect' ? 'incorrect' : 'all'
  const practiceType = Object.values(PRACTICE_TYPES).includes(searchParams.get('type'))
    ? searchParams.get('type')
    : PRACTICE_TYPES.CONTEXTUAL_CLOSEST_MEANING
  const [rows, setRows] = useState(null)

  useEffect(() => {
    logEvent(user.id, 'screen_viewed', { screen_name: 'my_words' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])

  useEffect(() => {
    if (!QUERYABLE_TYPES.has(practiceType)) {
      setRows([])
      return
    }
    let cancelled = false
    setRows(null)

    async function load() {
      const data = await fetchWordStatuses(user.id, practiceType, filter)
      if (!cancelled) setRows(data)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user.id, practiceType, filter])

  function handleFilterChange(next) {
    const params = { type: practiceType }
    if (next === 'incorrect') params.filter = next
    setSearchParams(params)
  }

  function handleTypeChange(next) {
    setSearchParams(filter === 'incorrect' ? { type: next, filter: 'incorrect' } : { type: next })
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

        <span className="filter-group-label">Practice type</span>
        <div className="chip-group">
          {Object.values(PRACTICE_TYPES).map((type) => (
            <button
              key={type}
              type="button"
              className={`chip category-chip${practiceType === type ? ' active' : ''}`}
              onClick={() => handleTypeChange(type)}
            >
              {PRACTICE_TYPE_LABELS[type]}
            </button>
          ))}
        </div>

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

        {!QUERYABLE_TYPES.has(practiceType) ? (
          <div className="empty-state">
            {practiceType === PRACTICE_TYPES.CONFUSING_WORD_PAIRS
              ? "Confusing Word Pairs tracks results separately from other formats — a dedicated view for it is coming."
              : `${PRACTICE_TYPE_LABELS[practiceType]} isn't built yet.`}
          </div>
        ) : rows === null ? (
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
