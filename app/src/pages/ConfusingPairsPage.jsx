import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { fetchConfusingPairsQueue } from '../lib/confusingPairs'
import { fetchConfusingPairStatuses, upsertConfusingPairStatus } from '../lib/confusingPairStatus'
import { fetchProfile, saveProfile } from '../lib/userProfile'
import { recordPracticeActivity } from '../lib/adaptiveTier'
import { logEvent } from '../lib/userEvents'
import { shuffle } from '../lib/shuffle'
import { maskWord } from '../lib/maskWord'

const SESSION_LENGTH = 10
const OPTION_LETTERS = ['A', 'B']

function buildOptions(pair) {
  return shuffle([
    { label: pair.word, isCorrect: true },
    { label: pair.commonly_confused_with, isCorrect: false },
  ])
}

// No word_id/tier ties here — confusing_pairs rows aren't part of the main
// word bank (most confusable partners were never added there), and
// adaptive difficulty is scoped to Quiz only (see vocabl_scope.md).
// Correct/incorrect per pair is tracked in its own confusing_pair_status
// table instead of user_word_status, keyed on confusing_pairs.id.
export default function ConfusingPairsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState('category') // 'category' | 'loading' | 'empty' | 'playing' | 'complete'
  const [queue, setQueue] = useState([])
  const [index, setIndex] = useState(0)
  const [options, setOptions] = useState([])
  const [selected, setSelected] = useState(null)
  const [results, setResults] = useState([])

  const sessionStartedRef = useRef(false)
  const savedRef = useRef(false)
  const resultsRef = useRef([])
  // Read by handleSelect so the streak/words-played update always builds
  // on the profile state that was current at the time.
  const profileRef = useRef(null)
  // handleSelect now does an awaited network call (status upsert) before
  // results update. Next/Finish is clickable the instant an answer is
  // picked (selected is set synchronously), so without this, a fast tap
  // could advance before the current answer's status write lands — same
  // race QuizPage guards against with pendingUpdateRef.
  const pendingUpdateRef = useRef(null)

  function endSession(eventType) {
    if (savedRef.current) return
    savedRef.current = true
    logEvent(user.id, eventType, { words_shown: resultsRef.current.length })
  }

  // Covers leaving the session any way other than the explicit ✕/Back
  // (browser back, closing the tab, navigating elsewhere) — same pattern
  // as the Learn/Quiz sessions.
  useEffect(() => {
    return () => {
      if (sessionStartedRef.current && !savedRef.current) {
        endSession('confusing_pairs_exited')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function startSession(category) {
    setStep('loading')
    const [pairs, p] = await Promise.all([
      category === 'wrong_only'
        ? fetchConfusingPairStatuses(user.id, 'incorrect').then((rows) =>
            shuffle(rows.map((r) => r.confusing_pairs))
          )
        : fetchConfusingPairsQueue(SESSION_LENGTH),
      fetchProfile(user.id),
    ])
    profileRef.current = p
    if (pairs.length === 0) {
      setStep('empty')
      return
    }
    setQueue(pairs)
    setIndex(0)
    setResults([])
    resultsRef.current = []
    setOptions(buildOptions(pairs[0]))
    setSelected(null)
    sessionStartedRef.current = true
    savedRef.current = false
    setStep('playing')
    logEvent(user.id, 'confusing_pairs_started', { category, session_length: pairs.length })
  }

  function handleSelect(option) {
    if (selected) return
    setSelected(option)
    const pair = queue[index]
    const result = option.isCorrect ? 'correct' : 'incorrect'
    const task = (async () => {
      await upsertConfusingPairStatus(user.id, pair.id, result)
      profileRef.current = await saveProfile(user.id, recordPracticeActivity(profileRef.current))
      const newResults = [...resultsRef.current, { result }]
      resultsRef.current = newResults
      setResults(newResults)
    })()
    pendingUpdateRef.current = task
    return task
  }

  async function handleNext() {
    if (pendingUpdateRef.current) await pendingUpdateRef.current
    const nextIndex = index + 1
    if (nextIndex >= queue.length) {
      endSession('confusing_pairs_completed')
      setStep('complete')
      return
    }
    setIndex(nextIndex)
    setOptions(buildOptions(queue[nextIndex]))
    setSelected(null)
  }

  async function handleBack() {
    if (pendingUpdateRef.current) await pendingUpdateRef.current
    endSession('confusing_pairs_exited')
    navigate('/practice')
  }

  const current = queue[index]
  const correctCount = results.filter((r) => r.result === 'correct').length
  const maskedSentence = current ? maskWord(current.demonstrating_sentence, current.word) : null

  return (
    <div className="app-shell">
      <div className="page-card">
        <div className="word-card-top">
          <button type="button" className="back-link" onClick={handleBack}>
            ← Back
          </button>
        </div>

        {step === 'category' && (
          <div className="category-choice">
            <p>Two words, one blank — pick the one that actually fits.</p>
            <button type="button" className="btn btn-secondary" onClick={() => startSession('all')}>
              All pairs
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => startSession('wrong_only')}>
              Only wrong
            </button>
          </div>
        )}

        {step === 'loading' && <div className="loading-state">Loading…</div>}

        {step === 'empty' && (
          <div className="empty-state">
            No pairs match that category yet.
            <div className="reveal-actions">
              <button type="button" className="btn btn-primary" onClick={() => navigate('/practice')}>
                Back to Practice
              </button>
            </div>
          </div>
        )}

        {step === 'playing' && current && (
          <>
            {maskedSentence && <p className="context-sentence">{maskedSentence}</p>}
            <div className="quiz-options">
              {options.map((opt, i) => {
                let cls = 'quiz-option'
                if (selected) {
                  if (opt.isCorrect) cls += ' correct'
                  else if (opt === selected) cls += ' incorrect'
                }
                return (
                  <button
                    key={opt.label}
                    type="button"
                    className={cls}
                    disabled={!!selected}
                    onClick={() => handleSelect(opt)}
                  >
                    <span className="option-letter">{OPTION_LETTERS[i]}.</span> {opt.label}
                  </button>
                )
              })}
            </div>

            {selected && (
              <>
                <p className="reveal-definition">
                  <strong>{current.word}</strong> — {current.word_meaning}
                </p>
                <p className="reveal-example">
                  <strong>{current.commonly_confused_with}</strong> — {current.confused_meaning}
                </p>
                <button type="button" className="btn btn-primary" onClick={handleNext}>
                  {index + 1 >= queue.length ? 'Finish' : 'Next'}
                </button>
              </>
            )}
          </>
        )}

        {step === 'complete' && (
          <div className="reveal-panel">
            <p className="reveal-result won">Session complete</p>
            <p className="quiz-complete-score">
              {correctCount}/{results.length} correct
            </p>
            <div className="reveal-actions">
              <button type="button" className="btn btn-primary" onClick={() => startSession('all')}>
                Play again
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => navigate('/practice')}>
                Practice
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
