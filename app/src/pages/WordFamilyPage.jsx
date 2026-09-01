import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { fetchWordFamily } from '../lib/wordFamily'
import { logEvent } from '../lib/userEvents'

export default function WordFamilyPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const root = searchParams.get('root')
  const [words, setWords] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    if (!root) return
    let cancelled = false

    fetchWordFamily(root).then((data) => {
      if (!cancelled) setWords(data)
    })
    logEvent(user.id, 'screen_viewed', { screen_name: 'word_family', root })

    return () => {
      cancelled = true
    }
  }, [root, user.id])

  if (!root) {
    navigate('/home', { replace: true })
    return null
  }

  const meta = words?.[0]

  return (
    <div className="app-shell">
      <div className="page-card">
        <div className="word-card-top">
          <button type="button" className="back-link" onClick={() => navigate(-1)}>
            ← Back
          </button>
        </div>

        <div className="word-card">
          {words === null ? (
            <div className="loading-state">Loading…</div>
          ) : (
            <div className="family-tree">
              <div className="family-root">
                <p className="family-root-word">{root}</p>
                {meta && (
                  <p className="family-root-meta">
                    {meta.root_meaning}
                    {meta.root_language ? ` · ${meta.root_language}` : ''}
                  </p>
                )}
              </div>

              {words.length <= 1 ? (
                <div className="empty-state">No other words share this root yet.</div>
              ) : (
                <>
                  <div className="family-trunk-line" />
                  <div className="family-children">
                    {words.map((w) => {
                      const isExpanded = expandedId === w.id
                      return (
                        <div className="family-child" key={w.id}>
                          <button
                            type="button"
                            className="family-child-word"
                            onClick={() => setExpandedId(isExpanded ? null : w.id)}
                          >
                            <span className="family-connector">└</span>
                            {w.word}
                          </button>
                          {isExpanded && <p className="family-child-definition">{w.correct_definition}</p>}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}