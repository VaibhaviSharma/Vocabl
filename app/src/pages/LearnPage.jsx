import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { fetchLearnWords, fetchDomains } from '../lib/learnWords'
import { logWordView } from '../lib/wordViews'
import { logEvent } from '../lib/userEvents'
import { shuffle } from '../lib/shuffle'
import Flashcard from '../components/Flashcard'

const SESSION_LENGTH = 10

export default function LearnPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState('filters') // 'filters' | 'loading' | 'playing' | 'empty' | 'complete'
  const [domains, setDomains] = useState([])
  const [tierFilter, setTierFilter] = useState(null)
  const [domainFilter, setDomainFilter] = useState(null)
  const [queue, setQueue] = useState([])
  const [index, setIndex] = useState(0)

  const sessionStartedRef = useRef(false)
  const savedRef = useRef(false)
  // Words actually shown this session. Read synchronously from endSession
  // (including the unmount cleanup below), so it can't be a stale
  // render-cycle count.
  const viewedCountRef = useRef(0)
  // Snapshotted at session start so the unmount cleanup logs the filters
  // the session actually ran with, not whatever the filter chips currently
  // show (which could differ if the user changed them after "Learn again").
  const sessionFiltersRef = useRef({ tier: null, domain: null })

  useEffect(() => {
    let cancelled = false
    fetchDomains().then((d) => {
      if (!cancelled) setDomains(d)
    })
    return () => {
      cancelled = true
    }
  }, [])

  function endSession(eventType) {
    if (savedRef.current) return
    savedRef.current = true
    logEvent(user.id, eventType, {
      words_viewed: viewedCountRef.current,
      tier: sessionFiltersRef.current.tier,
      domain: sessionFiltersRef.current.domain,
    })
  }

  // Covers leaving the session any way other than the explicit ✕ (browser
  // back, closing the tab, navigating elsewhere) — same pattern as the
  // hangman/quiz sessions.
  useEffect(() => {
    return () => {
      if (sessionStartedRef.current && !savedRef.current) {
        endSession('learn_session_exited')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function startSession() {
    setStep('loading')
    sessionFiltersRef.current = { tier: tierFilter, domain: domainFilter }
    const words = shuffle(await fetchLearnWords({ tier: tierFilter, domain: domainFilter })).slice(
      0,
      SESSION_LENGTH
    )

    if (words.length === 0) {
      setStep('empty')
      return
    }

    setQueue(words)
    setIndex(0)
    viewedCountRef.current = 1
    savedRef.current = false
    sessionStartedRef.current = true
    setStep('playing')
    logEvent(user.id, 'learn_session_started', {
      session_length: words.length,
      tier: tierFilter,
      domain: domainFilter,
    })
    logWordView(user.id, words[0].id)
  }

  function handleNext() {
    const nextIndex = index + 1
    if (nextIndex >= queue.length) {
      endSession('learn_session_completed')
      setStep('complete')
      return
    }
    setIndex(nextIndex)
    viewedCountRef.current += 1
    logWordView(user.id, queue[nextIndex].id)
  }

  function handleBack() {
    endSession('learn_session_exited')
    navigate('/home')
  }

  const currentWord = queue[index]

  return (
    <div className="app-shell">
      <div className="page-card">
        {step === 'filters' && (
          <>
            <div className="word-card-top">
              <Link to="/home" className="back-link">
                ← Back
              </Link>
            </div>
            <div className="category-choice">
              <p>Filter which words to see (optional)</p>

              <span className="filter-group-label">Tier</span>
              <div className="chip-group">
                <button
                  type="button"
                  className={`chip${tierFilter === null ? ' active' : ''}`}
                  onClick={() => setTierFilter(null)}
                >
                  All
                </button>
                {[1, 2, 3, 4, 5].map((t) => (
                  <button
                    type="button"
                    key={t}
                    className={`chip${tierFilter === t ? ' active' : ''}`}
                    onClick={() => setTierFilter(t)}
                  >
                    Tier {t}
                  </button>
                ))}
              </div>

              <span className="filter-group-label">Domain</span>
              <div className="chip-group">
                <button
                  type="button"
                  className={`chip${domainFilter === null ? ' active' : ''}`}
                  onClick={() => setDomainFilter(null)}
                >
                  All
                </button>
                {domains.map((d) => (
                  <button
                    type="button"
                    key={d}
                    className={`chip${domainFilter === d ? ' active' : ''}`}
                    onClick={() => setDomainFilter(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>

              <button type="button" className="btn btn-primary" onClick={startSession}>
                Start
              </button>
            </div>
          </>
        )}

        {step === 'loading' && <div className="loading-state">Loading…</div>}

        {step === 'empty' && (
          <div className="empty-state">
            No words match those filters.
            <div className="reveal-actions">
              <button type="button" className="btn btn-primary" onClick={() => setStep('filters')}>
                Change filters
              </button>
            </div>
          </div>
        )}

        {step === 'playing' && currentWord && (
          <Flashcard
            word={currentWord}
            onNext={handleNext}
            onBack={handleBack}
            progress={`${index + 1} / ${queue.length}`}
            isLast={index + 1 >= queue.length}
          />
        )}

        {step === 'complete' && (
          <div className="word-card">
            <div className="reveal-panel">
              <p className="reveal-result won">Session complete</p>
              <p className="quiz-complete-score">{viewedCountRef.current} words seen</p>
              <div className="reveal-actions">
                <button type="button" className="btn btn-primary" onClick={() => setStep('filters')}>
                  Learn again
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => navigate('/home')}>
                  Back to Home
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}