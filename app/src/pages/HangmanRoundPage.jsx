import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { fetchProfile, saveProfile } from '../lib/userProfile'
import { getNextWord } from '../lib/wordSelection'
import { applyRoundResult } from '../lib/adaptiveTier'
import { upsertWordStatus } from '../lib/wordStatus'
import { logEvent } from '../lib/userEvents'
import HangmanRound from '../components/HangmanRound'

const SESSION_LENGTH = 10

export default function HangmanRoundPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState('loading') // 'loading' | 'playing' | 'complete'
  const [word, setWord] = useState(null)
  const [profile, setProfile] = useState(null)
  const [results, setResults] = useState([])
  // Set precisely when each word is served (1-based), independent of
  // `results` (which only updates once a round's completion bookkeeping
  // finishes). Driving the progress display and the "last round" label off
  // `results.length` instead would lag by exactly one round, since the
  // reveal panel — including its Continue/See-results button — renders
  // immediately when a round ends, before that async bookkeeping resolves.
  const [roundIndex, setRoundIndex] = useState(1)

  // Source of truth for "how many rounds completed so far," read
  // synchronously from event handlers (handleContinue, handleBack, the
  // unmount cleanup) that can't wait for a render. Updated directly at the
  // point of mutation (not via a `useEffect` mirroring `results` state) —
  // an effect-based mirror lags a full commit+effect cycle behind the
  // state update, and `handleContinue`'s pendingCompletionRef await
  // resolves before that cycle completes, so it would still read a stale
  // count for one round every time.
  const resultsRef = useRef(results)
  const sessionStartedRef = useRef(false)
  const savedRef = useRef(false)
  // handleRoundComplete does two awaited network calls before results/profile
  // actually update. The reveal panel's Continue button is clickable the
  // instant the round ends (independent of that async work), so a fast tap
  // could otherwise race ahead and advance using a stale results count.
  // handleContinue awaits this to guarantee it never runs before that.
  const pendingCompletionRef = useRef(null)
  // Word IDs already served this session, so getNextWord can skip them —
  // otherwise the same word could resurface within a single 10-word run.
  const servedWordIdsRef = useRef([])

  function endSession(exitedEarly) {
    if (savedRef.current) return
    savedRef.current = true
    logEvent(user.id, 'session_completed', {
      words_played: resultsRef.current.length,
      exited_early: exitedEarly,
    })
  }

  // Covers leaving the session any way other than the explicit "back to
  // Home" control below (browser back, closing the tab, navigating
  // elsewhere) — same can't-catch-a-hard-tab-close caveat as QuizPage.
  useEffect(() => {
    return () => {
      if (sessionStartedRef.current && !savedRef.current) {
        endSession(true)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // `wasCancelled` lets the mount effect below abort applying the result if
  // it unmounts first — needed because React StrictMode double-invokes
  // effects in dev, and without this guard both invocations would run this
  // (each fetching its own word, firing its own session_started) and race
  // to overwrite each other's state, corrupting the round count for the
  // whole session. The "Play again" button calls this directly with no
  // guard, since a real click is a one-shot user action, not subject to
  // StrictMode's double-invocation.
  async function startSession(wasCancelled) {
    setStep('loading')
    setResults([])
    resultsRef.current = []
    setRoundIndex(1)
    savedRef.current = false
    servedWordIdsRef.current = []
    const p = await fetchProfile(user.id)
    const w = await getNextWord(p.current_tier, servedWordIdsRef.current)
    if (wasCancelled && wasCancelled()) return
    servedWordIdsRef.current = [w.id]
    setProfile(p)
    setWord(w)
    setStep('playing')
    sessionStartedRef.current = true
    logEvent(user.id, 'session_started', { session_length: SESSION_LENGTH })
    logEvent(user.id, 'hangman_round_started', { word_id: w.id, tier: w.tier })
  }

  useEffect(() => {
    let cancelled = false
    startSession(() => cancelled)
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])

  function handleRoundComplete({ result, usedMaxAttempts, attemptsUsed }) {
    const task = (async () => {
      await upsertWordStatus(user.id, word.id, result)
      const updates = applyRoundResult(profile, { tier: word.tier, result, usedMaxAttempts })
      const updatedProfile = await saveProfile(user.id, updates)
      setProfile(updatedProfile)
      const newResults = [...resultsRef.current, { result }]
      resultsRef.current = newResults
      setResults(newResults)
      logEvent(user.id, 'hangman_round_completed', { word_id: word.id, result, attempts_used: attemptsUsed })
    })()
    pendingCompletionRef.current = task
    return task
  }

  async function handleContinue() {
    if (pendingCompletionRef.current) await pendingCompletionRef.current
    if (resultsRef.current.length >= SESSION_LENGTH) {
      endSession(false)
      setStep('complete')
      return
    }
    setStep('loading')
    const w = await getNextWord(profile.current_tier, servedWordIdsRef.current)
    servedWordIdsRef.current = [...servedWordIdsRef.current, w.id]
    setWord(w)
    setStep('playing')
    setRoundIndex((i) => i + 1)
    logEvent(user.id, 'hangman_round_started', { word_id: w.id, tier: w.tier })
  }

  async function handleBack() {
    if (pendingCompletionRef.current) await pendingCompletionRef.current
    endSession(true)
    navigate('/home')
  }

  const correctCount = results.filter((r) => r.result === 'correct').length

  if (step === 'loading' || !word) return <div className="loading-state">Loading…</div>

  return (
    <div className="app-shell">
      <div className="page-card">
        {step === 'playing' && (
          <HangmanRound
            word={word}
            onRoundComplete={handleRoundComplete}
            onBack={handleBack}
            onContinue={handleContinue}
            continueLabel={roundIndex >= SESSION_LENGTH ? 'See results' : 'Continue'}
            progress={`${roundIndex} / ${SESSION_LENGTH}`}
          />
        )}

        {step === 'complete' && (
          <div className="word-card">
            <div className="reveal-panel">
              <p className="reveal-result won">Session complete</p>
              <p className="quiz-complete-score">
                {correctCount}/{results.length} correct
              </p>
              <div className="reveal-actions">
                <button type="button" className="btn btn-primary" onClick={() => startSession()}>
                  Play again
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
