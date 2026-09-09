import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { fetchUsageErrorEntries, buildSentenceOptions } from '../lib/usageErrors'
import { fetchWordStatuses, upsertWordStatus } from '../lib/wordStatus'
import { fetchProfile, saveProfile } from '../lib/userProfile'
import { recordPracticeActivity } from '../lib/adaptiveTier'
import { logEvent } from '../lib/userEvents'
import { shuffle } from '../lib/shuffle'
import { PRACTICE_TYPES } from '../lib/practiceTypes'

const SESSION_LENGTH = 10
const PRACTICE_TYPE = PRACTICE_TYPES.WORD_USAGE_ERRORS
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E']

// Each entry is one word plus its 5 usage_sentences (4 correct, 1 not).
// Correctness is tracked per word_id in user_word_status, scoped to this
// practice_type — same shared status table the other formats use, kept
// isolated from them by the (user_id, word_id, practice_type) key.
export default function WordUsageErrorsPage() {
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
  // See ConfusingPairsPage/QuizPage: handleSelect awaits a status write
  // before results update, but Next/Finish is clickable the instant an
  // answer is picked — this stops it from racing ahead of that write.
  const pendingUpdateRef = useRef(null)

  function endSession(eventType) {
    if (savedRef.current) return
    savedRef.current = true
    logEvent(user.id, eventType, { total_words_shown: resultsRef.current.length })
  }

  useEffect(() => {
    return () => {
      if (sessionStartedRef.current && !savedRef.current) {
        endSession('usage_errors_exited')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function startSession(category) {
    setStep('loading')
    const [allEntries, p] = await Promise.all([fetchUsageErrorEntries(), fetchProfile(user.id)])
    profileRef.current = p
    const entryByWordId = new Map(allEntries.map((e) => [e.word.id, e]))

    const entries =
      category === 'wrong_only'
        ? (await fetchWordStatuses(user.id, PRACTICE_TYPE, 'incorrect'))
            .map((r) => entryByWordId.get(r.word_id))
            .filter(Boolean)
        : shuffle(allEntries).slice(0, SESSION_LENGTH)

    if (entries.length === 0) {
      setStep('empty')
      return
    }

    setQueue(entries)
    setIndex(0)
    setResults([])
    resultsRef.current = []
    setOptions(buildSentenceOptions(entries[0]))
    setSelected(null)
    sessionStartedRef.current = true
    savedRef.current = false
    setStep('playing')
    logEvent(user.id, 'usage_errors_started', { category, word_count: entries.length })
  }

  function handleSelect(option) {
    if (selected) return
    setSelected(option)
    const entry = queue[index]
    const result = !option.isCorrect ? 'correct' : 'incorrect'
    const task = (async () => {
      await upsertWordStatus(user.id, entry.word.id, result, PRACTICE_TYPE)
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
      endSession('usage_errors_completed')
      setStep('complete')
      return
    }
    setIndex(nextIndex)
    setOptions(buildSentenceOptions(queue[nextIndex]))
    setSelected(null)
  }

  async function handleBack() {
    if (pendingUpdateRef.current) await pendingUpdateRef.current
    endSession('usage_errors_exited')
    navigate('/practice')
  }

  const current = queue[index]
  const correctCount = results.filter((r) => r.result === 'correct').length
  const wrongSentence = current?.sentences.find((s) => !s.isCorrect)

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
            <p>Five sentences, one target word — spot the sentence that uses it incorrectly.</p>
            <button type="button" className="btn btn-secondary" onClick={() => startSession('all')}>
              All words
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => startSession('wrong_only')}>
              Only wrong
            </button>
          </div>
        )}

        {step === 'loading' && <div className="loading-state">Loading…</div>}

        {step === 'empty' && (
          <div className="empty-state">
            No words match that category yet.
            <div className="reveal-actions">
              <button type="button" className="btn btn-primary" onClick={() => navigate('/practice')}>
                Back to Practice
              </button>
            </div>
          </div>
        )}

        {step === 'playing' && current && (
          <>
            <p className="quiz-word">{current.word.word}</p>
            <p className="context-sentence">Choose the sentence where "{current.word.word}" is used incorrectly.</p>
            <div className="quiz-options">
              {options.map((opt, i) => {
                let cls = 'quiz-option'
                if (selected) {
                  if (!opt.isCorrect) cls += ' correct'
                  else if (opt === selected) cls += ' incorrect'
                }
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className={cls}
                    disabled={!!selected}
                    onClick={() => handleSelect(opt)}
                  >
                    <span className="option-letter">{OPTION_LETTERS[i]}.</span> {opt.sentence}
                  </button>
                )
              })}
            </div>

            {selected && wrongSentence && (
              <>
                {selected.isCorrect ? (
                  <>
                    <p className="reveal-example">The actually incorrect sentence: "{wrongSentence.sentence}"</p>
                    <p className="reveal-definition">
                      <strong>{current.word.word}</strong> actually means: {current.word.correct_definition}
                    </p>
                  </>
                ) : (
                  <p className="reveal-definition">
                    <strong>{current.word.word}</strong> means: {current.word.correct_definition}
                  </p>
                )}
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
