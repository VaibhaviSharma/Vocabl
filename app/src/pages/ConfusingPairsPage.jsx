import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { fetchConfusingPairsQueue } from '../lib/confusingPairs'
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

// No word_id / user_word_status / tier ties here — confusing_pairs rows
// aren't part of the main word bank, and adaptive difficulty is scoped to
// Quiz only (see vocabl_scope.md). This is a lightweight, self-contained
// practice loop: pick the word that actually fits, see both meanings,
// move on.
export default function ConfusingPairsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState('intro') // 'intro' | 'loading' | 'playing' | 'complete'
  const [queue, setQueue] = useState([])
  const [index, setIndex] = useState(0)
  const [options, setOptions] = useState([])
  const [selected, setSelected] = useState(null)
  const [results, setResults] = useState([])

  const sessionStartedRef = useRef(false)
  const savedRef = useRef(false)
  const resultsRef = useRef([])

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

  async function startSession() {
    setStep('loading')
    const pairs = await fetchConfusingPairsQueue(SESSION_LENGTH)
    if (pairs.length === 0) {
      setStep('intro')
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
    logEvent(user.id, 'confusing_pairs_started', { session_length: pairs.length })
  }

  function handleSelect(option) {
    if (selected) return
    setSelected(option)
    const newResults = [...resultsRef.current, { result: option.isCorrect ? 'correct' : 'incorrect' }]
    resultsRef.current = newResults
    setResults(newResults)
  }

  function handleNext() {
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

  function handleBack() {
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

        {step === 'intro' && (
          <div className="category-choice">
            <p>Two words, one blank — pick the one that actually fits.</p>
            <button type="button" className="btn btn-primary" onClick={startSession}>
              Start
            </button>
          </div>
        )}

        {step === 'loading' && <div className="loading-state">Loading…</div>}

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
              <button type="button" className="btn btn-primary" onClick={startSession}>
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
